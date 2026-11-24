# web-checks — Implementation Plan

> Nato come piano di **pwa-check** (PWA Validator). Dalla SPEC v2.5 il tool è
> **web-checks**: perimetro esteso a qualunque app web, PWA come pacchetto
> opzionale (SPEC §Perimetro e pacchetti), niente npm pubblico.

> Companion operativo di `SPEC.md`. Definisce **runtime, packaging, architettura
> del codice e fasi di sviluppo**. La SPEC descrive *cosa* validare; questo piano
> descrive *come costruirlo*.

## 0. Decisione di runtime & packaging (gate del progetto)

**Contesto del requisito.** Desiderata: eseguibile statico (Bun `--compile`),
uso di librerie Node, e loading di codice JS/TS a runtime (config + auth pluggable).

**Esito della valutazione.**

| Desiderata | Bun | Note |
| --- | --- | --- |
| Loading JS/TS utente a runtime | ✅ punto di forza | Binario Bun incorpora transpiler; `import()` dinamico di file esterni consentito (default `["*"]`). Migliore di Node SEA. |
| Eseguibile statico | ✅ solo Tier 0 | Nessun single-file può incorporare i browser Playwright (~300MB, cache separata). Beneficio reale solo per il motore statico. |
| Playwright / Lighthouse | ❌ oggi instabile | `bun build --compile` **non** funziona con Playwright (bun#27530); launch/IPC/WebSocket rotti sotto Bun nativo. Portante per tutto il Tier 1. |

**Decisione presa: si parte su Node, Bun si rivaluta in seguito.** Nessun lock-in:
l'architettura resta runtime-agnostica (vedi guardrail sotto), quindi il passaggio
futuro a Bun costa solo un worker Node dietro `BrowserDriver`, non una riscrittura.

**Guardrail che tengono aperta la porta a Bun (obbligatori da subito, costo zero):**
1. Playwright/Lighthouse toccati **solo** dietro `BrowserDriver`.
2. Core/Tier 0/loader usano solo API standard (`node:fs`, `node:path`, `fetch`),
   niente internals Node-only.
3. Config e modulo auth caricati via `import()` dinamico (identico Node/Bun).
4. TS deve compilare con `tsc` (niente feature legate a un transpiler specifico).

**Rivalutazione Bun** — condizionata a *entrambi*: spike "Playwright su Bun"
positivo **e** single-binary diventato requisito hard. *(Decisione utente
2026-07-02: il single-binary è un **nice-to-have** → Strategia A confermata,
vedi §4.)*

**Architettura: runtime-agnostica con confine netto tra Tier 0 e Tier 1.**

- **Core + Tier 0 + loader config/auth**: nessuna dipendenza da browser →
  eseguibile sia sotto Node sia sotto Bun; candidato a `bun build --compile` per
  la fast-path statica.
- **Tier 1/2 (Playwright/Lighthouse)**: isolati dietro l'interfaccia
  `BrowserDriver`; girano su **Node**. In scenario Bun-binary vengono invocati
  come **worker Node separato** (subprocess + JSON-RPC su stdio).

**Strategia iniziale (A, pragmatica).** Sviluppo su **Node ≥ 20 + TypeScript**
(come da SPEC §Runtime). Distribuzione: tarball di `npm pack` su GitHub Release, niente npm pubblico (SPEC D9). Il confine Tier0/Tier1 e
il `BrowserDriver` rendono la Strategia B (single-binary Bun + worker Node)
adottabile **senza riscrivere il core**.

**Spike Bun+Playwright (declassato a opzionale).** Con la decisione D1
(single-binary = nice-to-have) lo spike non è più un gate: verificare
`playwright.chromium.launch()` sotto Bun nativo è utile solo se/quando si
riaprirà il tema packaging (post-v1). Non va pianificato in Fase 0.

---

## 1. Architettura del codice

```
src/
  cli/            # parsing arg, auto-detect modo, orchestrazione, exit code
  core/
    check.ts      # tipi Check/Finding/Mode/Category/SkipReason (da SPEC §Modello dati)
    finding.ts    # helper pass/warn/fail/info/skip (unico modo di creare Finding)
    registry.ts   # catalogo controlli: array di import ESPLICITI + filtro modo/tier
    engine.ts     # esecuzione runtime-agnostica, raccolta Finding
    scoring.ts    # pesi categoria, normalizzazione, cap da blocker, voto A–F
    modes.ts      # auto-detect src|build|live, combinazioni, precedenza
  loaders/
    config.ts     # web-checks.config.{json,js,ts} via import() dinamico
    input.ts      # astrae accesso ad artefatti: FS (src/build) | HTTP (live)
  checks/
    tier0/        # manifest, icons, html-head, sw-static, offline-static, perf-static
    tier1/        # responsive, installability-live, offline-live, sw-runtime, runtime-health
    tier2/        # lighthouse (opt-in)
  browser/
    driver.ts     # interface BrowserDriver (launch, page, measure, storageState)
    playwright.ts # impl in-process (Node)
    measure.ts    # precondizioni di misura + snapshot metriche per route×breakpoint
    worker/       # impl via subprocess Node (scenario Bun-binary) — Fase B
  auth/
    loader.ts     # rileva forma del default export (Fn|DSL|Session)
    dsl.ts        # interprete step DSL (goto/fill/click/press/waitFor/set*)
    context.ts    # AuthContext: env/secret/resolve/log; redazione segreti
    cache.ts      # storageState su disco con TTL, --refresh-auth
  report/
    finding.ts    # struttura dati completa (sempre prodotta internamente)
    messages.ts   # catalogo messaggi (inglese; un solo punto per i18n futura)
    text.ts       # formatter CLI colorato (v1)
    json.ts       # v1.x
    html.ts       # v1.x
    sarif.ts      # v1.x
```

**Principi architetturali derivati dalla SPEC.**

- **Formatter pluggabili**: l'engine produce *sempre* la lista completa di
  `Finding`; l'output è una proiezione. (SPEC §Output)
- **Skip-not-fail**: controlli non applicabili al modo/tier → `skipped`, mai
  falliti. Il registry filtra per modo prima dell'esecuzione. (SPEC §Modalità)
- **Determinismo**: Tier 0 e Tier 1-DOM deterministici; visual/Lighthouse
  `advisory`, esclusi dal punteggio salvo `--include-advisory-in-score`.
- **Agnostico da framework**: solo artefatti agnostici (HTML/JS bundlato/manifest/
  icone/runtime). Nessun compilatore per-framework.
- **`BrowserDriver` come confine di runtime**: unico punto che dipende da
  Playwright; abilita sia in-process (Node) sia worker (Bun).

**Dipendenze principali (Tier 0 dependency-light):** `node-html-parser`/`cheerio`
(HTML), `acorn` (AST JS del bundle/SW), parser JSON nativo. **Tier 1:**
`playwright`. **Tier 2:** `lighthouse` (opt-in, lazy import).

---

## 2. Fasi di sviluppo

### Fase 0 — Fondamenta (settimana 1)
- Scaffold progetto TS, bin `web-checks`, config tooling, test runner.
- ~~Spike Bun+Playwright~~ *(non più necessario: decisione D1, vedi §0 e §4).*
- `core/check.ts`, `registry.ts` (catalogo vuoto tipizzato), `report/finding.ts`.
- `modes.ts`: auto-detect + `--mode` + combinazioni + precedenza `live>build>src`.
- `loaders/input.ts`: astrazione FS/HTTP.
- **Exit criteria**: `pwa-check ./x --mode build` gira a vuoto e stampa scheletro.

### Fase 1 — Tier 0 completo (settimane 2–3)  → cuore di v1
Motore statico, nessun browser. Implementa il catalogo Tier 0:
- **Manifest** MAN-01..15 (presenza, JSON valido/UTF-8/no-dup, campi, coerenza
  `start_url`/`scope`).
- **Icone** ICO-01..07 (presenza dichiarazioni, file esistente, PNG/MIME, maskable,
  dimensioni reali vs dichiarate; regola anti-doppio-conteggio ICO-06↔HTML-05).
- **HTML head** HTML-01..07.
- **Service Worker statico** SW-01..07 (+ rilevamento SW *generato* Workbox/plugin →
  eventi/strategie "gestiti per costruzione").
- **Offline statico** OFF-01/03/04/05/06; **Installabilità statica** INST-02.
- **Performance hygiene** PERF-01..06 (advisory).
- **Modo `source`**: solo sottoinsieme pre-flight advisory (MAN file, ICO statiche,
  smoke SRC-01..03 — SPEC §Modalità), non scorato.
- `scoring.ts`: pesi categoria, normalizzazione per modo, cap da blocker, voto A–F.
- `report/text.ts`: output colorato come da esempio SPEC.
- **Exit criteria**: report completo + voto su una PWA reale buildata (`dist/`);
  fixture di test per pass/warning/error/skip per ogni check; scoring verificato
  contro casi noti (incl. cap da blocker). Ogni check rispetta la **Definition of
  Done** (B.1); la sequenza di PR consigliata è in B.5, le fixture golden in B.6.

### Fase 2 — Tier 1 browser (settimane 4–6)
- `browser/driver.ts` + `browser/playwright.ts` (in-process Node).
- **Precondizioni di misura deterministiche** (SPEC §Responsiveness): set viewport,
  `networkidle`, `document.fonts.ready`, disabilita animazioni/transizioni, esclusi
  nodi non visibili/fuori flusso.
- **Responsive** RSP-01..11 sui 6 breakpoint fissi (scored: 01/02/03/07/08/11;
  advisory: 04/05/06/09/10).
- **Installabilità/Offline/SW runtime**: INST-01/03, OFF-02, SW-08/09.
- **Runtime health** RUN-01..05 (listener `console`/`pageerror`/`response`; scored
  RUN-01/02/03 same-origin + PWA-related, advisory RUN-04/05; auth-aware →
  `skipped (auth-required)` su 401/403; filtro `runtime.ignoreOrigins/ignoreUrls`).
- **`routes`**: esecuzione check di pagina su route rappresentative, aggregazione.
- **Skip su assenza browser** (CI senza Playwright) → `skipped`, non fail.
- **Exit criteria**: RSP deterministici (2 run identiche) su app reale; skip pulito
  senza browser.

### Fase 3 — Autenticazione (settimana 6–7, parallela a 2b/2c **dopo** il driver 2a — vedi A.10)
- `auth/loader.ts`: rileva `AuthFn | AuthDSL | AuthSession` dal default export.
- `auth/dsl.ts`: interprete step; placeholder `{{env.*}}`/`{{secret.*}}`.
- `auth/context.ts`: `env/secret/resolve/log`; **redazione segreti** in report/log.
- `auth/cache.ts`: `storageState` su disco + TTL + `--refresh-auth`.
- **Login-wall guard**: `ready` → fail-fast diagnostico; check singolo dietro muro →
  `skipped (auth-required)`; distingue `start_url` irraggiungibile vs auth-gated.
- **Esecuzione unica** dell'auth, context riusato su route/breakpoint, fuori dal punteggio.
- **Exit criteria**: le 3 forme del modulo funzionano su un target dietro login;
  nessun segreto compare nei log.

### Fase 4 — Rifinitura v1 & release
- Config completa (`weights`, `ignore`, `breakpoints`, `layout.*`, `baseUrl`…).
- Docs, catalogo compatibilità (§10) e API moderne (§9) come tabelle statiche.
- **Exit criteria**: `web-checks` installato dal tarball della release, end-to-end su ≥3 app reali diverse per framework.

### Fase 5+ — Roadmap SPEC (post-v1)
- **v1.x**: `--format json`, exit code CI (`--fail-below-grade`, prima `--ci` +
  `--min-grade` con soglia default **C** — D2), `--include-advisory-in-score` con regola di peso da fissare (D3),
  report HTML, SARIF, Lighthouse opt-in (13b) + `@lhci/cli`.
- **v2**: visual regression (baseline, advisory); valutare promozione PERF 13a a
  scorata; espansione compatibilità.
- **Packaging Bun (Strategia B)** *se il single-binary diventa requisito hard*:
  `bun build --compile` del core+Tier0; `browser/worker/` come subprocess Node per
  Tier 1; il binario Bun orchestra e parla col worker via JSON-RPC/stdio.

---

## 3. Rischi & mitigazioni

| Rischio | Impatto | Mitigazione |
| --- | --- | --- |
| Playwright instabile su Bun | Blocca single-binary | Confine `BrowserDriver`; strategia worker; spike Fase 0 |
| Browser non incorporabili nel binario | "Statico" parziale | Comunicare che statico = Tier 0; `playwright install` per Tier 1 |
| Falsi positivi euristiche layout (RSP-08/09/10) | Punteggio fuorviante | Advisory in v1; guardie anti-falso-positivo; tolleranze configurabili |
| SW generati (Workbox/plugin) → falsi negativi pattern-matching | Voto errato | Rilevamento firma SW generato → check "gestiti per costruzione" |
| Modulo auth utente importa npm | Fallisce sotto binario | API iniettata (`page`/`ctx`), non import; documentare vincolo |
| Determinismo Tier 1 (font/animazioni) | Punteggio instabile | Precondizioni di misura rigorose (§Fase 2) |

## 4. Decisioni chiuse (nessuna approvazione pendente)

Non restano decisioni aperte per la v1. Log delle scelte (dettagli in SPEC
§Backlog decisionale):

| Decisione | Esito | Data |
| --- | --- | --- |
| Single-binary Bun | **Nice-to-have** → Strategia A (Node); niente worker/bridge in Fase 2; Bun `--compile` eventuale artefatto extra post-v1 per la fast-path Tier 0 | 2026-07-02 |
| Soglia CI default | **`C`** (con `--min-grade` per override); implementazione in v1.x | 2026-07-02 |
| `--include-advisory-in-score` | **Rinviato a v1.x**: chiave riservata in v1 (errore d'uso); scoring v1 = solo error/warning | 2026-07-02 |
| Lingua messaggi | **Inglese**, catalogo centralizzato `report/messages.ts` | 2026-07-02 |
| Nome pacchetto | ~~`pwa-check`~~ → **`web-checks`**, bin omonimo; rename senza alias (POC senza utenti) | 2026-10-31 |
| Perimetro | Qualunque app web; catalogo in pacchetti con voto per pacchetto (SPEC §Perimetro e pacchetti) | 2026-10-31 |
| Pacchetti: implementazione | Appartenenza calcolata in `src/core/packs.ts` (`packOf`), non dichiarata nei moduli; rilevamento PWA in `src/checks/detect.ts` riusando `loadManifest`; dipendenze eseguite ma non riportate; blocker che limita pacchetto e voto complessivo; exit 3 senza browser, `--no-browser` per evitarlo | 2026-10-31 |
| Distribuzione | Niente npm pubblico (`"private": true`): tarball di `npm pack` + `SHA256SUMS` su GitHub Release | 2026-10-31 |
| Allineamento CLI poqa | `--fail-below-grade` al posto di `--ci`/`--min-grade` (config `failBelowGrade`), `-o`, `-q`/`-v`, `-V` per la versione; JSON `ci` → `gate`, `schemaVersion` 2 | 2026-11-22 |
| Contratto poqa | Exit code come i tool poqa (`1` uso, `2` gate, `3` target/browser/fatale); target live irraggiungibile a livello di rete → exit 3 (prima veniva valutato F); `--format poqa` = `poqa-findings/v1` di effective-train, schema copiato in `tests/schemas/` | 2026-11-22 |

Se durante lo sviluppo emerge una decisione non coperta da SPEC/piano, la regola
per il team è: scegliere il default più semplice coerente coi guardrail (§0),
annotarlo in questa tabella e proseguire — non bloccarsi in attesa di approvazione.

---

## Appendice A — Contratti & Convenzioni (da fissare prima della Fase 1)

> Questa appendice colma il divario tra "architettura" e "codice eseguibile".
> Le interfacce qui sotto sono i **contratti portanti**: vanno implementate per
> prime (Fase 0) e **non** vanno reinventate dentro i singoli check. Un junior che
> ha queste firme può scrivere gli ~80 controlli in parallelo senza prendere
> decisioni architetturali. Le firme sono indicative: fissarle in codice
> (`core/*.ts`) è il primo deliverable di Fase 0.

### A.1 `InputSource` — accesso agli artefatti (FS o HTTP)

Unico modo con cui **ogni** check Tier 0 legge il target. Rende un check identico
in `build` (file) e `live` (HTTP). Nessun check deve usare `node:fs` o `fetch`
direttamente.

```ts
interface Asset {
  path: string;          // path logico relativo a baseUrl (es. "/manifest.webmanifest")
  bytes: Buffer;
  contentType?: string;  // header HTTP oppure inferito da estensione (build)
}

interface InputSource {
  readonly mode: 'source' | 'build' | 'live';
  readonly baseUrl: string;              // root FS assoluta, oppure origin HTTP
  read(path: string): Promise<Asset | null>;   // null = 404 / file inesistente
  exists(path: string): Promise<boolean>;      // HEAD (live) / fs.stat (fs) — no body
  entryHtml(): Promise<Asset | null>;          // index.html (fs) o GET baseUrl (live)
  list(glob?: string): Promise<string[]>;      // solo FS; live → [] (usa i ref nell'HTML)
}
```

**Convenzioni.** Path sempre relativi a `baseUrl` e normalizzati con `/` iniziale.
In `live` `list()` non è disponibile: i check devono partire dai riferimenti trovati
nell'HTML (link/script/img), non dall'enumerazione del filesystem. `read()`
**non lancia** su 404/timeout: ritorna `null` (vedi A.7 robustezza).

### A.2 Contratto del check — `CheckModule`

Ogni file in `checks/**` esporta **un** `CheckModule`. Firma unica per tutti.

```ts
interface CheckContext {
  input: InputSource;
  config: ResolvedConfig;      // config già validata + default applicati
  browser?: BrowserDriver;     // presente SOLO per check Tier 1/2
  auth?: AuthRuntime;          // sessione autenticata, se disponibile
  results: ResultBag;          // Finding già prodotti (dipendenze tra check)
  log: Logger;                 // logger con redazione segreti (A.6)
}

interface CheckModule {
  check: Check;                          // metadati statici (SPEC §Modello dati)
  dependsOn?: string[];                  // id di altri check (ordina l'engine — A.4)
  run(ctx: CheckContext): Promise<Finding | Finding[]>;
}
```

**Convenzioni.**
- Il check **non** decide se è applicabile al modo/tier: lo fa il `registry`
  filtrando su `check.modes`/`check.tier` **prima** di chiamarlo (skip-not-fail
  centralizzato). Dentro `run()` si assume di essere applicabili.
- Usare helper condivisi per costruire i `Finding` — non assemblare l'oggetto a
  mano in 80 punti:
  ```ts
  pass(check, msg?)            // status 'pass'
  warn(check, msg, fix?, evidence?)
  fail(check, msg, fix?, evidence?)  // 'error'
  info(check, msg, fix?)
  skip(check, reason)         // reason: SkipReason tipizzato (SPEC §Modello dati)
  ```
- Un check che ritorna più `Finding` (es. RSP-* per breakpoint/route) usa lo stesso
  `check.id` con `evidence` diverso; l'aggregazione la fa l'engine con la regola
  **worst-of binaria** definita in SPEC §Sistema di punteggio (una istanza fallita
  → il check fallisce; le istanze fallite finiscono in `evidence`).
- Il **registry è un array di import espliciti** (`registry.ts` importa ogni
  `CheckModule` per nome), niente auto-discovery via filesystem: deterministico,
  tree-shakable, compatibile con un futuro `bun build --compile`.
- I testi di `message`/`fix` sono in **inglese** e vengono dal catalogo messaggi
  centralizzato (SPEC §Output — Lingua dei messaggi), non stringhe inline.

### A.3 `BrowserDriver` — confine di runtime

Unico punto che tocca Playwright. Deterministicamente astratto perché lo stesso
codice giri in-process (Node) o via worker (Bun). **Nessun check importa
`playwright`**: usa solo questa interfaccia.

```ts
interface BrowserDriver {
  launch(opts?: { headless?: boolean }): Promise<void>;
  newPage(session?: AuthSession): Promise<DriverPage>;
  close(): Promise<void>;
}

interface DriverPage {
  goto(url: string, opts?: { waitUntil?: 'networkidle' | 'load' }): Promise<{ status: number }>;
  setViewport(v: { width: number; height: number; deviceScaleFactor?: number }): Promise<void>;
  evaluate<T>(fn: (arg?: unknown) => T, arg?: unknown): Promise<T>; // serializzabile
  on(event: 'console' | 'pageerror' | 'response', cb: (e: unknown) => void): void;
  setOffline(offline: boolean): Promise<void>;
  addInitScript(js: string): Promise<void>;   // disabilita animazioni (§Fase 2)
  storageState(): Promise<StorageState>;
  close(): Promise<void>;
}
```

**Convenzioni.** Le **precondizioni di misura** (viewport, `networkidle`,
`document.fonts.ready`, kill animazioni, esclusione nodi non visibili — SPEC
§Responsiveness) vivono in un helper `browser/measure.ts`, **non** duplicate in ogni
RSP-*. La firma `evaluate` accetta solo funzioni serializzabili + arg JSON (vincolo
che vale anche per il futuro worker Bun via JSON-RPC).

### A.4 `ResultBag` — dipendenze tra check

Risolve ICO-06↔HTML-05 e l'aggregazione di INST-02 senza accoppiare i check tra loro.

```ts
interface ResultBag {
  get(id: string): Finding | undefined;   // undefined = non ancora eseguito / non applicabile
  passed(id: string): boolean;            // false se assente o non 'pass'
}
```

**Meccanica.** L'engine ordina i check con un **sort topologico** su `dependsOn`
(grafo aciclico) prima dell'esecuzione. Esempio:
- `ICO-06` dichiara `dependsOn: ['HTML-05']`; dentro `run()`:
  `if (!ctx.results.passed('HTML-05')) return skip(check, 'dipende da HTML-05');`
- `INST-02` dichiara come `dependsOn` i suoi prerequisiti (MAN valido, SW, icone,
  display) e li somma leggendo `ctx.results`.

### A.5 Combinazione dei modi (`--mode build,live`)

L'engine gira **una volta per modo**, poi **fonde** i `Finding` per `check.id`.

**Regola di precedenza (dal più informativo):** `live` > `build` > `source`; a
parità, un esito **non-`skipped`** batte uno `skipped`. In pratica, per ogni
`check.id`:
1. scarta i `skipped` se esiste almeno un esito reale;
2. tra gli esiti reali, tieni quello del modo più alto;
3. il report mostra il modo vincente nell'`evidence` e conteggia gli skip residui.

Il punteggio si calcola **una volta sola sul set fuso**, non per-modo.

### A.6 Redazione segreti — centralizzata

I valori da `secret()` / `{{secret.*}}` **non** devono comparire in report/log.
Non lasciare la redazione ai singoli punti: registra i valori segreti in un
`SecretRegistry` al momento della risoluzione e fai passare **ogni** output
(`log`, serializzazione di `Finding.evidence`) attraverso un `redact(str)` che
sostituisce le stringhe note con `«redacted»`. Un solo punto di verità.

### A.7 Robustezza del tool (distinta da skip-not-fail dei check)

- **Isolamento del check.** L'engine avvolge ogni `run()` in try/catch: un'eccezione
  non pianificata → `Finding` con `status:'error'`, `message:'errore interno del
  check'` + stack in `evidence` (debug). **Mai** far crashare l'intera run per un
  check.
- **I/O tollerante.** `read()`/`goto()` gestiscono 404/timeout ritornando valori
  vuoti/`null`, non lanciando. Timeout HTTP/navigazione configurabili (default
  sensato, es. 15s).
- **Browser assente** (CI senza Playwright): i check Tier 1/2 → `skipped`, filtrati
  dal registry, non errori.
- **Manifest/JS malformati** sono un **esito di check** (es. MAN-02 `error`), non un
  crash del parser: catturare gli errori di parsing e trasformarli in `Finding`.

### A.8 Stack tecnologico — scelte **finalizzate** (niente "slash")

| Ambito | Scelta | Perché |
| --- | --- | --- |
| Runtime / linguaggio | Node ≥ 20, TypeScript `strict` | come SPEC §Runtime |
| Formato moduli | **ESM only** (`"type": "module"`, tsconfig `module: NodeNext`, `engines: ">=20"`) | `import()` dinamico nativo (config/auth), identico su Bun |
| Nome pacchetto / bin | `web-checks` / `web-checks` | dalla SPEC v2.5 (era `pwa-check`); non pubblicato su npm |
| Package manager | `pnpm` | lockfile deterministico, veloce |
| Parsing argomenti CLI | `node:util` `parseArgs` (zero-dep) | rispetta il guardrail "solo API standard" → identico su Bun |
| Parser HTML | `node-html-parser` | leggero, sync, sufficiente per `<head>`/link/img |
| Parser/AST JS (SW & bundle) | `acorn` + `acorn-walk` | standard, piccolo; niente feature transpiler-specifiche |
| Test runner | `vitest` | fixture-friendly, watch, snapshot |
| Lint + format | `biome` | tool unico (niente eslint+prettier separati) |
| Build | `tsc` per typecheck + `tsup` (esbuild) per il bin | `tsc` obbligatorio dal guardrail; `tsup` per shebang/bundle |
| Colori CLI | `picocolors` | minimale |
| Browser (Tier 1) | `playwright` | come SPEC |
| Lighthouse (Tier 2) | `lighthouse` in **lazy import** | caricato solo con `--lighthouse` |

> Se un junior sente la tentazione di aggiungere una dipendenza fuori da questa
> tabella, deve chiedere: la lista è volutamente minimale (guardrail Bun + Tier 0
> dependency-light).

### A.9 Hint sui punti tecnicamente ostici

**MAN-02: campi duplicati e UTF-8.** `JSON.parse` **non** segnala chiavi duplicate
(vince silenziosamente l'ultima). Niente dipendenze: usare `JSON.parse` per la
validità sintattica e, per i duplicati, un piccolo scanner (~50 righe) che percorre
la stringa JSON carattere per carattere (gestendo stringhe ed escape) e traccia le
chiavi per livello di oggetto. UTF-8: leggere i **byte** (non `toString` diretto);
BOM presente → `pass` con nota nel message (tollerato dai browser, sconsigliato);
byte non decodificabili UTF-8 → `error`.

**OFF-02: procedura del test offline (ordine obbligato).**
1. `goto(url)` **online**, attendi `networkidle`;
2. attendi il SW: `await navigator.serviceWorker.ready` **e** `controller != null`
   (se il SW non controlla la pagina al primo load — manca `clients.claim` — fare
   **un** reload e riverificare);
3. `setOffline(true)` → `goto(url)` di nuovo;
4. `pass` se la risposta arriva dal SW con documento non vuoto (status 200 e
   `body` con contenuto); anche una pagina di fallback dedicata conta come pass;
5. **sempre** `setOffline(false)` a fine check (anche su errore), per non
   inquinare i check successivi.

**SW-01: discovery del file SW in `live`.** Ordine di ricerca, registrato in
`evidence`: (1) argomento di `navigator.serviceWorker.register(...)` trovato nei
bundle JS dell'entry HTML; (2) a runtime (Tier 1 disponibile):
`navigator.serviceWorker.getRegistrations()`; (3) path convenzionali
(`/sw.js`, `/service-worker.js`, `/serviceworker.js`) via `exists()`.

**PERF-01: cosa si somma.** Byte **così come serviti** (`Content-Length` in live,
size del file in build) di tutti gli `<script src>` e `<link rel="stylesheet">`
referenziati dall'entry HTML (niente lazy/dynamic import). Soglia da
`config.perf.initialBudgetKb` (default 300). Advisory: non inseguire gzip/brotli
in v1; il messaggio dichiara che la misura è pre-compressione.

**RSP-*: un solo `evaluate` per (route × breakpoint).** `browser/measure.ts` fa
**una** `evaluate` che raccoglie tutte le metriche (overflow, box dei media, touch
target, font-size, overlap, clipping) e ritorna un unico JSON serializzabile,
cacheato per (route × breakpoint); i singoli RSP-* leggono dallo snapshot
condiviso. Evita N round-trip e garantisce che tutti i check misurino lo **stesso**
layout congelato.

**Rilevamento SW & analisi eventi (SW-03..07, OFF-*).** Parse del file SW con
`acorn`, poi `acorn-walk.simple`:
- **SW generato (Workbox/plugin)** — cercare *prima* le firme: import/uso di
  `workbox`, chiamate `precacheAndRoute`, `registerRoute`, o un array di precache
  manifest (`[{url, revision}]`). Se presente → SW-03..07 = `pass` "gestito per
  costruzione" (evita falsi negativi del pattern-matching). Questo check gira per
  primo tra gli SW-*.
- **Handler `fetch`/`install`/`activate`** — `CallExpression` su
  `addEventListener('fetch'|…)` **oppure** assegnazione `self.onfetch = …`.
- **Cache API** — `MemberExpression` `caches.open` / `cache.addAll` / `cache.put`.
- **Strategia offline (SW-07)** — euristica sull'ordine `caches.match` vs `fetch`
  dentro l'handler `fetch`: match-first→Cache First, fetch-first con fallback→Network
  First, entrambi in parallelo→SWR. È best-effort e `info`: non rincorrere la
  precisione.
- **SW-02 (registrazione)** — cercare `navigator.serviceWorker.register(` **nel
  bundle** (tutti i `.js` d'ingresso), non solo nel file SW.

**Auto-detect del modo (`modes.ts`).**
1. argomento parsabile come URL `http(s)://` → `live`;
2. altrimenti è una cartella: se contiene `index.html` **e** (nessun `package.json`
   **oppure** l'HTML referenzia asset con hash — regex `\.[0-9a-f]{8,}\.(js|css|woff2?)`)
   → `build`;
3. altrimenti → `source`.
`--mode` sovrascrive sempre. Documentare la regola esatta nel report ("modo
auto-rilevato: build, motivo: asset hashati").

**Fixture di test — convenzione.** `tests/fixtures/<scenario>/` con un mini-target
per modo (`build/` = alberatura di file; `live/` = server statico avviato dal test).
Per **ogni** check almeno 4 fixture: `pass` / `warning` / `error` / `skip`. Lo
scoring si testa con 2–3 fixture "golden" a punteggio atteso noto (incluso un caso
con **blocker fallito** → voto F). Un esempio completo (`manifest-ok`,
`manifest-missing-theme`) va scritto in Fase 0 come **template** che gli altri copiano.

### A.10 Ordine reale delle dipendenze tra fasi

Il testo dice "Fase 3 parallelizzabile con Fase 2", ma il grafo reale è:

```
Fase 0 (contratti: InputSource, CheckModule, ResultBag, registry, engine)
   └─> Fase 1 (Tier 0, nessun browser)
   └─> Fase 2a: browser/driver.ts + playwright.ts   ← prerequisito comune
          ├─> Fase 2b: RSP-* / OFF-02 / INST / SW-08/09
          ├─> Fase 2c: RUN-* (runtime health)
          └─> Fase 3: auth  (dipende dal driver, NON da 2b/2c)
```

Quindi: `driver` va fatto **prima**; poi **auth (Fase 3) e i check di pagina (2b/2c)
sono paralleli tra loro**, entrambi sopra il driver. Auth e RSP-* non condividono
codice, solo il `DriverPage`. *(La dicitura della Fase 3 in §2 è già stata
allineata a questo grafo.)*

---

## Spike — distribuzione senza npm pubblico (2026-11-01)

Verificato su un'installazione reale, come la farebbe poqa (prefisso dedicato,
niente dipendenze di sviluppo):

| Domanda | Risultato |
| --- | --- |
| Il tarball di `npm pack` si installa con `"private": true`? | Sì: `private` blocca solo `npm publish`. `npm install --omit=dev --prefix <dir> web-checks-X.tgz` installa 17 pacchetti, 23 MB, in 3–4 s |
| Il tarball è riproducibile? | Sì: due `npm pack` successivi danno lo stesso SHA-256, quindi `SHA256SUMS` è verificabile anche ricostruendolo |
| Contenuto | 9 file, 134 kB compressi (`files: ["dist"]` + README, LICENSE, package.json) |
| Browser | `playwright install chromium` dal Playwright incluso: 681 MB (Chromium completo + headless shell + ffmpeg), 28 s. Con `--only-shell`: **278 MB**, 12 s, ed è sufficiente perché web-checks lancia sempre in headless |
| Dove finisce il browser | Dove dice `PLAYWRIGHT_BROWSERS_PATH`, sia in installazione sia in esecuzione: poqa può tenerlo nella propria cache accanto alla versione di web-checks |
| Run live dall'installazione isolata | `manifest-ok` servito in locale: 9 s, tutti i pacchetti valutati (A/98) |
| Browser assente | exit 3 con il motivo; `--no-browser` per i soli Tier 0 |
| Accesso alle release | **Il repository è privato**: scaricare un asset di release richiede un token GitHub con accesso in lettura (API `releases/assets/{id}` con `Accept: application/octet-stream`). Il downloader di poqa (`poqa-common/src/tools/download.rs`) oggi non invia credenziali: serve supporto a un token (es. `GITHUB_TOKEN`) oppure rendere pubblico il repository. terminus invece è pubblico |
| CI offline o con registry interno | `npm install` del tarball scarica le dipendenze dal registry configurato (`.npmrc`), Playwright compreso. Per un'installazione senza registry si possono includere le dipendenze nel tarball (`bundleDependencies`); da valutare se serve davvero, perché i browser vanno comunque scaricati dal CDN di Playwright (o da `PLAYWRIGHT_DOWNLOAD_HOST`) |

Conseguenze:

* workflow `Release` (tag `vX.Y.Z`): controllo versione tag = `package.json` =
  `src/version.ts`, lint, typecheck, test unitari, `npm pack`, `SHA256SUMS`,
  smoke test del tarball installato in un prefisso pulito, release GitHub;
* poqa installa il browser con `--only-shell` in
  `~/.cache/poqa/tools/web-checks/<versione>/browsers` e passa
  `PLAYWRIGHT_BROWSERS_PATH` a ogni esecuzione;
* decisione aperta per poqa: token per le release private o repository pubblico.

---

## Appendice B — Kit operativo per lo sviluppo (junior-ready)

### B.1 Definition of Done di un check

Una PR che aggiunge un check è mergiabile solo se **tutte** le caselle sono vere:

- [ ] un file per check in `checks/tier{0,1,2}/<categoria>/<id-kebab>.ts`
      (es. `checks/tier0/manifest/man-03-name.ts`);
- [ ] i metadati `Check` coincidono **alla lettera** con la riga di catalogo in
      SPEC (id, modes, tier, severity, blocking, weight = E:3/W:1 salvo override);
- [ ] usa gli helper `pass/warn/fail/info/skip` — mai `Finding` assemblati a mano;
- [ ] nessun accesso diretto a `node:fs`/`fetch`/`playwright`: solo `ctx.input`,
      `ctx.browser`, `ctx.results`;
- [ ] `fix` valorizzato per ogni esito warning/error; `evidence` con
      file/URL/breakpoint che prova l'esito;
- [ ] messaggi in inglese, presi dal catalogo messaggi;
- [ ] registrato nell'array esplicito di `registry.ts`;
- [ ] ≥ 4 fixture in `tests/fixtures/` (pass / warning-o-error / skip / edge) e
      test vitest verdi;
- [ ] se dichiara `dependsOn`, il comportamento a dipendenza fallita è testato
      (`skipped (dependency)`).

### B.2 Template completo di un check (da copiare)

Il primo check implementato in Fase 0/1 fa da **template**; questo è il contenuto
atteso, allineato ai contratti A.1–A.4:

```ts
// src/checks/tier0/manifest/man-03-name.ts
import type { CheckModule } from '../../../core/check.js';
import { pass, fail, skip } from '../../../core/finding.js';
import { messages } from '../../../report/messages.js';
import { loadManifest } from './shared.js'; // parse+cache del manifest per-run

export const man03: CheckModule = {
  check: {
    id: 'MAN-03',
    category: 'Manifest',
    title: 'name is present',
    modes: ['source', 'build', 'live'],
    tier: 0,
    severity: 'error',
    weight: 3,            // derivato dalla severità (SPEC §Punteggio)
    deterministic: true,
  },
  dependsOn: ['MAN-01', 'MAN-02'],
  async run(ctx) {
    if (!ctx.results.passed('MAN-02')) return skip(this.check, 'dependency');
    const { json, path } = await loadManifest(ctx);
    if (typeof json.name === 'string' && json.name.trim().length > 0) {
      return pass(this.check);
    }
    return fail(this.check, messages['MAN-03'].missing,
      messages['MAN-03'].fix, path);
  },
};
```

Test corrispondente:

```ts
// tests/checks/man-03.test.ts
import { runSingleCheck } from '../helpers/run.js'; // engine su una fixture

test('MAN-03 pass', async () => {
  const f = await runSingleCheck('manifest-ok', 'MAN-03');
  expect(f.status).toBe('pass');
});
test('MAN-03 fail when name missing', async () => {
  const f = await runSingleCheck('manifest-no-name', 'MAN-03');
  expect(f.status).toBe('error');
  expect(f.fix).toBeTruthy();
});
test('MAN-03 skipped when manifest invalid', async () => {
  const f = await runSingleCheck('manifest-invalid-json', 'MAN-03');
  expect(f.status).toBe('skipped');
  expect(f.skipReason).toBe('dependency');
});
```

Ogni categoria ha un solo helper condiviso (`shared.ts`) che fa parse/cache
dell'artefatto della categoria (manifest, SW AST, head HTML): i check leggono il
risultato, non ri-parsano.

### B.3 `ResolvedConfig` — schema e validazione

`loaders/config.ts` produce **sempre** un oggetto completo (default applicati),
mai `undefined` sparsi nei check:

```ts
interface ResolvedConfig {
  targets: { mode: Mode; target: string }[];   // ≥1; modi tutti distinti
  breakpoints: Breakpoint[];                   // default: i 6 della SPEC
  layout: {
    overflowTolerancePx: number;   // 1
    overlapTolerancePx: number;    // 1
    minTouchTargetPx: number;      // 44
    minFontSizePx: number;         // 12
    minReadableColWidthPx: number; // 240
    ignoreSelectors: string[];     // []
  };
  runtime: {
    ignoreOrigins: string[];       // default: tutte le origini ≠ target
    ignoreUrls: string[];          // []
    failOnStatus: number[];        // [404]
    advisoryStatus: number[];      // [500,502,503,504]
  };
  perf: { initialBudgetKb: number };            // 300
  timeouts: { httpMs: number; navigationMs: number }; // 15000 / 30000
  weights: Record<Category, number>;            // default: tabella SPEC
  ignore: string[];                              // []
  routes: string[];                              // default [start_url] (o '/')
  auth?: AuthConfig;
  lighthouse: boolean;   // false — v1.x: in v1 il flag stampa "lands in v1.x" e skippa
  // includeAdvisoryInScore: chiave RISERVATA (v1.x) — in v1 la sua presenza nella
  // config utente è errore d'uso (exit 1). Vedi SPEC §Backlog decisionale D3.
  failBelowGrade?: Grade; // gate CI (--fail-below-grade); assente = nessun gate
}
```

**Validazione fatta a mano** (niente zod: guardrail dipendenze A.8): una funzione
`validateConfig(raw: unknown): { config?: ResolvedConfig; errors: string[] }` che
(1) segnala **chiavi sconosciute** (tipico typo → errore d'uso, exit 1);
(2) verifica i tipi campo per campo; (3) accumula **tutti** gli errori e li
stampa insieme, non si ferma al primo. Se `weights` è override parziale, i pesi
mancanti restano ai default e la somma viene **rinormalizzata a 100** (con nota
nel report).

### B.4 Pipeline CI del progetto (GitHub Actions)

Due job, così il Tier 0 resta veloce e senza browser (dogfooding di skip-not-fail):

```yaml
# .github/workflows/ci.yml — schema, non copia-incolla letterale
jobs:
  static:            # sempre, veloce
    steps: [pnpm install --frozen-lockfile, biome ci ., tsc --noEmit,
            vitest run --exclude tests/e2e]
  browser:           # Tier 1: fixture live servite da server statico locale
    steps: [pnpm install --frozen-lockfile,
            pnpm exec playwright install chromium --with-deps,
            vitest run tests/e2e]
```

Matrice Node `20.x` e `22.x` sul job `static` (il guardrail "API standard" si
verifica gratis). Il job `browser` gira su un solo Node (20) per tempo di CI.
Uno smoke test end-to-end (`web-checks tests/fixtures/golden-b/dist --mode build`
→ exit 0 e voto atteso nel testo) chiude il job static.

### B.5 Sequenza di PR per la Fase 1 (ordine consigliato)

Piccole, una categoria per PR, dipendenze esplicite:

| # | PR | Contenuto | Dipende da |
| --- | --- | --- | --- |
| 1 | contratti | `core/check.ts`, `finding.ts` + helper, `registry.ts`, `engine.ts` (sequenziale + toposort `dependsOn`), scheletro `scoring.ts` | — |
| 2 | input | `loaders/input.ts` (`FsSource`, `HttpSource`), infra fixture + `runSingleCheck` | 1 |
| 3 | manifest | MAN-01..15 + `shared.ts` (incl. scanner duplicati B/A.9) + template B.2 | 2 |
| 4 | html-head | HTML-01..07 | 2 |
| 5 | icons | ICO-01..07 (ICO-06 `dependsOn` HTML-05) | 3, 4 |
| 6 | sw-static | SW-01..07 + rilevamento Workbox/plugin (gira per primo) | 2 |
| 7 | offline+inst | OFF-01/03/04/05/06, INST-02 (`dependsOn` MAN/SW/ICO) | 3, 5, 6 |
| 8 | perf-static | PERF-01..06 (advisory) | 4 |
| 9 | scoring+report | `scoring.ts` completo (pesi, normalizzazione, cap, worst-of), `report/text.ts`, exit code | 1–8 |
| 10 | source-mode | SRC-01..03, auto-detect `modes.ts`, fusione multi-modo (A.5) | 9 |

Dalla PR 3 in poi le categorie 4/6/8 sono parallelizzabili tra persone diverse:
ognuna tocca solo la propria cartella + una riga nel registry.

### B.6 Fixture golden — contenuto minimo

- `golden-a/` — PWA completa e corretta (voto atteso A): manifest completo, SW
  Workbox-like, icone 192/512+maskable, head completo.
- `golden-b/` — PWA con 2 warning noti (voto atteso B, es. niente maskable,
  niente `theme-color` meta): verifica il calcolo pesato.
- `golden-blocker/` — manifest assente: qualunque punteggio → **voto F** (cap).
- `golden-skip/` — target `build` con check live-only: verifica conteggio skip e
  ridistribuzione del peso di categoria.

I voti attesi sono asseriti nei test di scoring come numeri esatti: se un peso
cambia in SPEC, il test rompe e obbliga ad aggiornare entrambi.
