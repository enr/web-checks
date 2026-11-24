# web-checks — SPEC v2.5

> Nato come **pwa-check** (Progressive Web App Validator, SPEC fino alla v2.4).
> Dalla v2.5 il perimetro è **qualunque applicazione che si apre in un browser**;
> le best practice PWA diventano un pacchetto opzionale (vedi §Perimetro e
> pacchetti). Il progetto è un POC senza utenti: il nome del repository è
> provvisorio.

## Obiettivo

Realizzare uno strumento CLI che analizzi automaticamente un'applicazione web
(sito, SPA, pagine renderizzate dal server, pannello di amministrazione, PWA) e
ne verifichi la **salute a runtime** (risorse rotte, errori in console, 5xx), la
**responsiveness** del layout, l'`<head>` HTML e, se l'applicazione è una
**Progressive Web App (PWA)**, il rispetto delle relative best practice.

Fuori perimetro: app native e API. Le verifiche che bastano una singola
richiesta HTTP (status, header di sicurezza, TLS, contenuto della risposta)
spettano ai check `http` di poqa (`enr/effective-train`), che delega a
web-checks i check `web`: tutto ciò che richiede di renderizzare la pagina o di
analizzare la build di un frontend.

L'obiettivo non è solo verificare i requisiti minimi di installabilità, ma anche
fornire suggerimenti su qualità, UX, performance percepita e compatibilità.

Il tool deve:

* individuare risorse rotte ed errori a runtime;
* validare la configurazione PWA, quando l'applicazione è una PWA;
* individuare errori e configurazioni mancanti;
* assegnare un punteggio complessivo e un voto (A–F);
* suggerire come correggere ogni problema;
* validare il layout responsive su device di varie dimensioni.

---

## Perimetro e pacchetti *(v2.5)*

Il motore (modi, driver del browser, autenticazione, controlli di runtime) era
già generico; catalogo e punteggio no. Le categorie PWA (Manifest, Service
Worker, Installabilità, Icone, Offline) valgono 69 punti su 100 e tutti i 7
controlli `blocking` sono PWA (MAN-01, MAN-02, MAN-07, dimensione icone,
INST-01, INST-02, SW-01): fino alla v2.4 un sito non-PWA senza difetti
prendeva **F**.

Il catalogo si organizza in **pacchetti**; id e categorie dei controlli non
cambiano. L'appartenenza è calcolata in un solo punto (`src/core/packs.ts`,
`packOf`) da categoria e id.

| Pacchetto | Contenuto | Attivo |
| --- | --- | --- |
| `runtime` | RUN-01, RUN-04, RUN-05; nuovi candidati: mixed content, link interni rotti | default |
| `responsive` | RSP-*, UX-03 (system font), UX-05 (performance percepita) | default |
| `head` | HTML-02/04/06 (viewport, charset, title/description); candidato: lingua | default |
| `pwa` | MAN-*, ICO-*, SW-*, OFF-*, INST-*, SRC-*, HTML-01/03/05/07/08, UX-01/02/04, RUN-02 (risorse del manifest), RUN-03 (errori console di SW/manifest) | se il target è una PWA (vedi sotto), oppure con `--pack pwa` |
| `perf`, `compat`, `modern` | gli advisory attuali (Performance, Lighthouse; Compatibility; ModernApis) | default, solo advisory: mai valutati |
| candidati | accessibilità (axe-core), cookie e terze parti | da valutare |

RUN-02 e RUN-03 stanno in `pwa` e non in `runtime`: verificano manifest e
service worker, e RUN-02 dipende da MAN-01. Così nessun controllo dei pacchetti
di default dipende da un controllo PWA.

**Rilevamento PWA.** Prima della run, per ogni target: in `build`/`live` il
target è una PWA se l'HTML ha `<link rel="manifest">` o se un manifest esiste
in un percorso convenzionale (`/manifest.webmanifest`, `/manifest.json`), con
lo stesso loader di MAN-01 (nessuna richiesta in più); in `source` se c'è un
manifest statico (SRC-01) o un plugin PWA in `package.json`. Basta un target
per attivare il pacchetto. Il report indica il motivo (`detected` /
`not-detected`) e l'evidenza.

**Selezione.**

* `--pack <lista>` (o `packs` nella config; il flag vince) sostituisce i
  pacchetti di default e il rilevamento PWA.
* `--only <id|glob>`, separati da virgola, con `*` come jolly e senza
  distinzione di maiuscole: seleziona i controlli per id invece che per
  pacchetto. Non combinabile con `--pack`; nessuna corrispondenza = errore
  d'uso (exit 1).
* Le dipendenze (`dependsOn`) dei controlli selezionati **vengono eseguite**
  (il loro esito decide il controllo dipendente) **ma non compaiono nel
  report** né nel punteggio: il loro effetto si vede già nel controllo
  dipendente (es. `skipped (dependency)`).
* `ignore` resta un'esclusione e si applica dopo la selezione.

**Punteggio.**

* **Voto per pacchetto**: `computeScore` sui soli finding del pacchetto; i
  pesi delle categorie si normalizzano su quelle con controlli applicabili,
  come già avveniva per il voto unico. Le categorie divise fra due pacchetti
  (Html, UX, RuntimeHealth) contribuiscono a ciascuno con il proprio peso.
* **Voto complessivo**: lo stesso calcolo sui finding di tutti i pacchetti
  attivi. Su una PWA coincide con il voto unico della v2.4 (verificato sui
  golden: 100/A e 89/B invariati).
* **Blocker**: un `blocking` fallito limita a F il voto del proprio pacchetto
  **e** quello complessivo. Poiché tutti i blocker sono in `pwa`, e `pwa` si
  attiva solo sulle PWA, un sito non-PWA non viene più limitato.
* **Nessun voto**: se i controlli selezionati non hanno esiti valutabili (es.
  `--pack perf,compat`), la run è advisory (`advisoryReason:
  "no-scored-checks"`) e il gate `--fail-below-grade` non fallisce, come per le run solo
  `source` (`advisoryReason: "source-only"`).

**Browser.** Se c'è un target `live` e i controlli selezionati includono Tier
1, il browser è obbligatorio: se Playwright o Chromium non partono, la run
termina con **exit 3** e il motivo (`playwright` non installato, Chromium
mancante, avvio fallito). `--no-browser` è l'uscita esplicita: i Tier 1
risultano `skipped (no-browser)` ed esce 0. Fino alla v2.4 i Tier 1 venivano
saltati senza errore, e una run senza browser risultava verde senza aver
verificato nulla.

**Output.** Il report testuale ha una sezione `PACKS` (voto o motivo per cui
il pacchetto non è attivo); il report `agent` una riga per pacchetto; il JSON
ha `schemaVersion` (2 dal 2026-11-22, `ci` → `gate`), `version`, `packs` (`pack`, `active`, `reason`,
`evidence`, `advisory`, `score`) e il campo `pack` su ogni finding.

**Da decidere coi dati delle prime run su siti non-PWA**: RUN-04 (errori
console generici) e RUN-05 (5xx) sono `info`, quindi fuori dal voto del
pacchetto `runtime`, che oggi si basa sul solo RUN-01. Valutarne la promozione
a `warning` ora che non sono più un dettaglio di una PWA.

---

## Modalità di input

Il tool supporta **tre modalità**. La modalità determina *quali* controlli sono
eseguibili: ogni controllo nel catalogo è etichettato con i modi in cui è
disponibile (vedi colonna **Modi**). I controlli non applicabili al modo corrente
vengono **saltati** (non falliti) e segnalati come `skipped`.

| Modo | Sigla | Cosa riceve | Esempio CLI |
| --- | --- | --- | --- |
| Source | `src` | Cartella repo **pre-build** — solo **pre-flight advisory** (vedi nota) | `web-checks ./my-app --mode source` |
| Build | `build` | Cartella di **output buildato** (HTML/JS/JSON finali, es. `dist/`) | `web-checks ./dist --mode build` |
| Live | `live` | **URL** di un'app servita (localhost o produzione) | `web-checks https://app.example.com --mode live` |

Note:

* La modalità può essere **auto-rilevata**: se l'argomento è un URL → `live`; se la
  cartella contiene un `index.html` con asset hashati / nessun `package.json` →
  `build`; altrimenti → `source`. L'auto-detect è sovrascrivibile con `--mode`.
* Le tre modalità sono **combinabili** in una singola esecuzione (es.
  `--mode build,live` puntando build locale + URL di staging) per massimizzare la
  copertura. In caso di conflitto vince il risultato del modo più "alto"
  (`live` > `build` > `src`) perché più vicino alla realtà di runtime.
* **Sintassi CLI dei modi combinati** — si passano **più target posizionali**, uno
  per modo. Il modo di ciascun target è auto-rilevato; `--mode` (lista separata da
  virgole, abbinata ai target **in ordine**) forza l'assegnazione:

  ```sh
  web-checks ./dist https://staging.example.com   # auto-detect: build + live
  web-checks ./app ./dist --mode source,build     # esplicito, abbinato in ordine
  ```

  Due target che risolvono allo **stesso** modo sono un errore d'uso (exit code 1,
  vedi §Output). La fusione dei risultati per `check.id` è definita in
  `IMPLEMENTATION_PLAN.md` §A.5.
* **Il modo `source` è un pre-flight advisory, non scorato.** Senza tooling
  per-framework, ciò che varia per framework (head HTML, iniezione della
  registrazione SW, link al manifest, SW generato) **non è osservabile** in modo
  affidabile pre-build; ciò che è osservabile è già verificato meglio sul build.
  Perciò in `source` si eseguono **solo** i controlli agnostici su **file statici**:
  manifest come file (`MAN-01..15`, se è un file in `public/` e non generato),
  file icona statici (`ICO-01/02/04/07`) e uno **smoke check** "è una PWA?"
  (esiste manifest/SW/plugin PWA). Tutti gli altri controlli `source` sono
  **saltati**. Gli esiti `source` **non concorrono al punteggio** e il tool
  raccomanda di rieseguire su `build`/`live` per un giudizio valido.
* Lo **smoke check "è una PWA?"** del modo `source` è formalizzato in tre controlli
  advisory dedicati (così hanno un ID citabile nel report e nelle fixture):

  | ID | Controllo | Tier | Sev |
  | --- | --- | --- | --- |
  | SRC-01 | Manifest presente come file statico (`public/`, `static/`, root) | 0 | advisory |
  | SRC-02 | SW presente come file statico **oppure** plugin PWA dichiarato in `package.json` (`vite-plugin-pwa`, `next-pwa`, `workbox-*`, `@angular/pwa`, `serwist`) | 0 | advisory |
  | SRC-03 | Chiamata `navigator.serviceWorker.register(` da qualche parte nel sorgente | 0 | advisory |

  SRC-02/03 **sostituiscono** in `source` la coppia SW-01/SW-02 (che è osservabile
  in modo affidabile solo post-build): per coerenza SW-01/SW-02 sono etichettati
  solo `B L` nel catalogo. Categoria dei SRC-*: **Preflight** (advisory, senza
  peso: non compare nella tabella dei pesi).

---

## Principi

Il validatore deve essere:

* **Deterministico** — vedi sezione dedicata.
* **Compatibile con qualsiasi framework** (React, Vue, Lit, Angular, Svelte,
  Vanilla JS) — in modo **agnostico**. Il tool **non** usa librerie/compilatori
  specifici per framework (niente JSX, `@vue/compiler-sfc`, template Angular,
  parsing della config dei plugin PWA). Si analizzano **solo artefatti agnostici**:
  HTML renderizzato, JS bundlato, `manifest`, file icona, comportamento a runtime.
  Conseguenza: i controlli affidabili vivono in `build` e `live`; `source` è
  ridotto a un pre-flight advisory (vedi sotto).
* **Dependency-free dove possibile** — i controlli statici (Tier 0) non richiedono
  un browser. Il browser (Tier 1) è usato solo dove necessario (modo `live`,
  responsive, installabilità reale). Lighthouse (Tier 2) è opzionale.

### Determinismo — definizione operativa

Un'esecuzione è deterministica se, **dato lo stesso input e la stessa
configurazione**, produce lo **stesso elenco di controlli, gli stessi esiti e lo
stesso punteggio**.

* **Tier 0 (statico)** e **Tier 1 euristiche-DOM**: deterministici. I controlli su
  proprietà del DOM girano a un set **fisso** di breakpoint e leggono proprietà
  misurabili (overflow, dimensione touch target, ecc.), non pixel.
* **Visual regression** e **Lighthouse**: **non deterministici** per natura
  (timing, rendering, rete). Sono marcati `advisory` ed **esclusi dal punteggio**
  di default. Possono essere abilitati esplicitamente ma il loro esito non altera
  il voto a meno di `--include-advisory-in-score`.

### Runtime di implementazione

**Decisione: Node.js + TypeScript ora; Bun da rivalutare in seguito** (vedi
`IMPLEMENTATION_PLAN.md` §0). Motivazioni per Node: ecosistema web nativo
(Playwright per Tier 1, `lighthouse` per Tier 2), parser maturi
(`node-html-parser`/`cheerio` per HTML, `acorn`/`@babel/parser` per AST JS, ecc.),
Target: Node LTS (≥ 20). Il tool ha bin `web-checks` e **non è pubblicato su
npm pubblico** (`"private": true` in `package.json`): ogni release su GitHub
allega il tarball di `npm pack` e `SHA256SUMS`; si installa da lì
(`npm install <tarball>`), ed è così che lo installa poqa nella sua cache.

**Perché non Bun subito.** Bun sarebbe attraente per due desiderata (eseguibile
statico via `bun build --compile`; loading di codice JS/TS utente a runtime — su
quest'ultimo Bun è superiore a Node SEA). Ma **Playwright oggi non è affidabile
sotto Bun** e in particolare `bun build --compile` non funziona con Playwright:
poiché Playwright è portante per tutto il Tier 1, adottare Bun ora bloccherebbe la
metà "runtime" del tool. Inoltre nessun eseguibile statico può incorporare i
browser Playwright (~300MB, cache separata): il beneficio "statico" varrebbe solo
per il Tier 0.

**Come teniamo aperta la porta a Bun (a costo zero).** L'architettura è
**runtime-agnostica**: (1) i tocchi a Playwright/Lighthouse vivono solo dietro
l'interfaccia `BrowserDriver`; (2) core, Tier 0 e loader usano solo API standard
(`node:fs`/`node:path`/`fetch`), niente internals; (3) config e modulo auth sono
caricati via `import()` dinamico (identico su Node e Bun); (4) il TS compila con
`tsc`. Rivalutazione futura condizionata a: spike "Playwright su Bun" positivo *e*
single-binary diventato requisito hard → in tal caso si implementa solo un worker
Node dietro `BrowserDriver`, senza riscrivere il core.

---

## Architettura dei controlli (tiering)

| Tier | Strumento | Quando | Determinismo |
| --- | --- | --- | --- |
| 0 | Parsing statico (no browser) | sempre, su file/HTML/JSON/JS | ✅ |
| 1 | Browser headless (Playwright) | modo `live`; responsive; installabilità runtime | ✅ (euristiche DOM) |
| 2 | Lighthouse | opzionale, modo `live` | ❌ advisory |

Ogni controllo dichiara il proprio tier. In assenza del browser (es. CI senza
Playwright) i controlli Tier 1/2 vengono `skipped`, non falliti.

> **Engine browser: solo Chromium in v1.** I criteri di installabilità e
> `beforeinstallprompt` sono definiti da Chromium, e un engine unico è condizione
> di determinismo delle misure DOM. Multi-engine (Firefox/WebKit) eventualmente in
> v2, come advisory.

> **HTML in modo `live` (Tier 0).** I check Tier 0 leggono l'**HTML servito**
> (GET, senza eseguire JS). Tag iniettati client-side (es. `<link rel="manifest">`
> aggiunto via JS) non sono visibili al Tier 0: quando il browser è disponibile, i
> presence-check dell'head (MAN-01, HTML-01/03/05/07) vengono **ricontrollati sul
> DOM renderizzato** e un `pass` a runtime sostituisce il `fail` statico, con nota
> "iniettato via JS" in `evidence` e il suggerimento di servire il tag
> staticamente. A parità di input il comportamento resta deterministico.

---

## Output

### Primario: CLI leggibile

Report testuale colorato, leggibile dallo sviluppatore. I colori sono disattivati
automaticamente se stdout non è un TTY o se è impostata la variabile `NO_COLOR`
(override manuale: `--no-color`).

```
PWA CHECK  ·  mode: build  ·  target: ./dist

GRADE: B (88%)

  18 passed   ·   2 warnings   ·   1 error   ·   4 skipped

MANIFEST
  ✓ MAN-01  Manifest trovato (manifest.webmanifest)
  ✓ MAN-02  JSON valido / UTF-8 / nessun campo duplicato
  ✗ MAN-09  theme_color mancante                         [error]
            → Aggiungi "theme_color": "#0b5" al manifest e <meta name="theme-color">

SERVICE WORKER
  ✓ SW-01   Service Worker rilevato (sw.js)
  ⚠ SW-04   Evento 'fetch' non gestito                   [warning]
            → Senza handler 'fetch' l'app non funziona offline

ICONS
  ⚠ ICO-04  Nessuna icona maskable                       [warning]
            → Aggiungi un'icona con "purpose": "maskable"

…

SKIPPED (mode: build)
  - INST-01 HTTPS              (richiede modo live)
  - LH-*    Lighthouse         (advisory, non abilitato)
```

Legenda esiti: `✓ pass`, `⚠ warning`, `✗ error`, `· skipped`, `i info`.

### Fasi successive (non in v1, ma il design li deve permettere)

* ~~**JSON strutturato** (`--format json`) per integrazione programmatica.~~ **Implementato.**
* ~~**Exit code per CI**: `0` se voto ≥ soglia, `2` altrimenti.~~ Oggi `--fail-below-grade <g>` (prima `--ci` + `--min-grade`, default `C`).
  **Implementato** (run advisory source-only: il gate non fallisce mai).
* **Report HTML** condivisibile (`--format html`).
* **SARIF** per GitHub code scanning.

L'engine produce internamente sempre la struttura dati completa (lista di
`Finding`); i formatter sono pluggabili.

### Exit code

| Codice | Significato |
| --- | --- |
| 0 | Run completata (senza `--fail-below-grade` il voto non influenza l'exit code) |
| 1 | Errore d'uso: argomenti/config non validi, due target sullo stesso modo, pacchetto sconosciuto, `--only` senza corrispondenze |
| 2 | Gate CI: voto < `--fail-below-grade` (o `failBelowGrade` in config); senza soglia non c'è gate |
| 3 | Target irraggiungibile (DNS, connessione rifiutata, timeout: una pagina di errore HTTP è un target raggiungibile e si valuta), browser necessario ma non disponibile (§Perimetro e pacchetti), o errore interno fatale (non un singolo check fallito) |

Sono gli exit code di tutti i tool poqa (contratto comune in
`enr/effective-train`, `docs/poqa-findings.md` §Exit codes). Fino al
2026-11-22 web-checks usava `1` per il gate e `2` per l'errore d'uso: invertiti
per allineamento, senza alias perché il POC non ha utenti.

**Formato `poqa`** (`--format poqa`): il documento `poqa-findings/v1` dello
stesso contratto, per poqa-live e gli altri consumatori della suite; mappatura
in README §Output formats.

### Lingua dei messaggi

I testi prodotti dal tool (`title`, `message`, `fix`) sono in **inglese** in v1
(audience internazionale). Gli esempi in questa SPEC sono
illustrativi in italiano. I messaggi vivono in un catalogo centralizzato (non
hardcodati negli 80 check) per consentire i18n futura.

### Ordinamento deterministico del report

Le sezioni seguono l'ordine delle categorie del catalogo (§Catalogo dei
controlli); dentro ogni sezione i finding sono ordinati per `check.id`. Nessun
ordinamento dipendente da tempi di esecuzione.

---

## Modello dati di un controllo (Finding)

```ts
interface Check {
  id: string;            // es. "MAN-01"
  category: Category;    // Manifest | ServiceWorker | Icons | Html | ...
  title: string;
  modes: Mode[];         // ["src","build","live"]
  tier: 0 | 1 | 2;
  severity: 'error' | 'warning' | 'info';
  weight?: number;       // peso intra-categoria; se assente è derivato dalla
                         // severità (Error = 3, Warning = 1 — vedi §Punteggio)
  blocking?: boolean;    // se fallito, cap del voto (vedi punteggio)
  deterministic: boolean;
}

type SkipReason =
  | 'mode'            // controllo non applicabile al modo corrente
  | 'no-browser'      // Tier 1/2 senza Playwright disponibile
  | 'dependency'      // dipendenza fallita/assente (es. ICO-06 se HTML-05 fallisce)
  | 'auth-required'   // risorsa dietro login (vedi §Autenticazione)
  | 'disabled'        // escluso via config `ignore`
  | 'advisory-preflight'; // esito modo source, fuori punteggio

interface Finding {
  check: Check;
  status: 'pass' | 'warning' | 'error' | 'info' | 'skipped';
  message: string;       // descrizione del problema riscontrato
  fix?: string;          // suggerimento di correzione (obbligatorio se warning/error)
  evidence?: string;     // file:riga / snippet / URL che prova l'esito
  skipReason?: SkipReason; // presente sse status === 'skipped'
}
```

Regola: un controllo **fallito** produce sempre `status === check.severity` — il
check non declassa né promuove la propria severità a runtime. Le eccezioni (es.
ICO-01/02/07 advisory in `src`) sono dichiarate staticamente nel catalogo, non
decise dal singolo run.

---

## Livelli di severità

| Severità | Significato | Effetto sul punteggio |
| --- | --- | --- |
| **Error** | Impedisce una PWA corretta | Perde il peso del controllo; se `blocking`, applica cap al voto |
| **Warning** | Non blocca ma riduce qualità/compatibilità | Perde il peso del controllo |
| **Info** | Suggerimento di miglioramento | `advisory`: elencato, **non** influisce sul punteggio |

Esempi *Error*: manifest mancante, JSON non valido, Service Worker assente, icona
192×192 mancante, HTTPS assente (modo live).
Esempi *Warning*: icona maskable assente, theme-color mancante, offline limitato.
Esempi *Info*: aggiungere shortcut, usare `display: standalone`, system font.

---

## Catalogo dei controlli

Legenda colonna **Modi**: `S`=source, `B`=build, `L`=live. **Sev**: E/W/I.

### 1. Manifest  *(categoria, peso 20)*

| ID | Controllo | Modi | Tier | Sev | Block |
| --- | --- | --- | --- | --- | --- |
| MAN-01 | Manifest presente (`manifest.json` o `.webmanifest`, referenziato da `<link rel="manifest">`) | S B L | 0 | E | ✔ |
| MAN-02 | JSON valido, UTF-8, nessun campo duplicato | S B L | 0 | E | ✔ |
| MAN-03 | `name` presente | S B L | 0 | E | |
| MAN-04 | `short_name` presente (≤ 12 caratteri consigliato) | S B L | 0 | E | |
| MAN-05 | `start_url` presente, valido, coerente con `scope` e raggiungibile | S B L | 0 | E | |
| MAN-06 | `display` presente e installabile (`standalone`/`fullscreen`/`minimal-ui`); segnala `browser` | S B L | 0 | E | |
| MAN-07 | `icons` presente e ben formato | S B L | 0 | E | ✔ |
| MAN-08 | `scope` presente e coerente con `start_url` | S B L | 0 | W | |
| MAN-09 | `theme_color` presente | S B L | 0 | W | |
| MAN-10 | `background_color` presente | S B L | 0 | W | |
| MAN-11 | `description` presente | S B L | 0 | I | |
| MAN-12 | `lang` / `dir` presenti | S B L | 0 | I | |
| MAN-13 | `orientation` presente | S B L | 0 | I | |
| MAN-14 | `categories` presente | S B L | 0 | I | |
| MAN-15 | `id` presente (stabilità identità app) | S B L | 0 | I | |
| MAN-16 | `screenshots` presente e ben formato, con form factor `wide` + `narrow` (install UI ricca) | S B L | 0 | I | |

> **MAN-01 vs HTML-01 (anti-doppio-conteggio).** Entrambi toccano
> `<link rel="manifest">`: la **presenza del tag** vive in **HTML-01**; **MAN-01**
> verifica che il **file manifest** esista e sia leggibile all'URL/path linkato.
> Se il tag manca, MAN-01 cerca i path convenzionali (`/manifest.webmanifest`,
> `/manifest.json`): se trova il file → MAN-01 `pass` (con nota) e fallisce solo
> HTML-01; se non lo trova → MAN-01 `error` (blocking) e HTML-01 `skipped
> (dependency)`, per non contare due volte la stessa causa. **MAN-02..15 dichiarano
> `dependsOn: MAN-01/MAN-02`**: manifest assente o JSON invalido → `skipped
> (dependency)`, non 14 error a cascata.
>
> **Più manifest / più SW.** Se l'HTML contiene più `<link rel="manifest">` vince
> il **primo** (comportamento browser) e il report lo segnala come nota; idem per
> più file SW candidati (vince quello registrato, vedi SW-01).
>
> **MAN-05 "raggiungibile" — definizione operativa per modo.** `build`: il path di
> `start_url` (risolto rispetto a `scope`) esiste come file nella cartella, oppure
> esiste l'`index.html` di fallback SPA; `live`: GET su `start_url` seguendo i
> redirect → 2xx = pass, 302 verso pagina di login = `skipped (auth-required)`
> (vedi §Autenticazione), 404/5xx = fail. In `source` si verifica solo presenza e
> coerenza sintattica con `scope` (niente reachability).

### 2. Icone  *(peso 10)*

| ID | Controllo | Modi | Tier | Sev | Block |
| --- | --- | --- | --- | --- | --- |
| ICO-01 | Icona 192×192 presente e file esistente | B L | 0 | E | ✔ |
| ICO-02 | Icona 512×512 presente e file esistente | B L | 0 | E | ✔ |
| ICO-03 | Icone in PNG con MIME type corretto | B L | 0 | W | |
| ICO-04 | Almeno un'icona `purpose: maskable` | S B L | 0 | W | |
| ICO-05 | Dimensioni consigliate aggiuntive (48/72/96/128/256) | B L | 0 | I | |
| ICO-06 | `apple-touch-icon` presente nell'HTML (vedi nota anti-doppio-conteggio) | B L | 0 | W | |
| ICO-07 | Dimensioni dichiarate coincidono con i pixel reali del file | B L | 0 | W | |

> **ICO-06 vs HTML-05.** Entrambi verificano il link `apple-touch-icon` ma in
> categorie diverse (Icone vs HTML head). Per non penalizzare due volte la stessa
> causa, il presence-check del tag `<link rel="apple-touch-icon">` vive in **HTML-05**;
> **ICO-06** ne verifica invece la **qualità lato icona** (file esistente, PNG,
> dimensione ≥ 180×180). Se il tag manca, ICO-06 riporta `skipped` (dipende da
> HTML-05) per evitare il doppio conteggio.

> In modo `source` le dimensioni reali del file possono non essere verificabili
> (asset generati al build): ICO-01/02/07 diventano `advisory` in `src`.

> **ICO-01/02 e `purpose`.** L'icona 192/512 deve avere `purpose` che **include
> `any`** (o `purpose` assente, che equivale ad `any`): un'icona dichiarata solo
> `maskable` non soddisfa i criteri di installabilità e non fa passare ICO-01/02
> (il report lo spiega esplicitamente, perché è un errore comune).

### 3. HTML `<head>`  *(peso 8)*

| ID | Controllo | Modi | Tier | Sev | Block |
| --- | --- | --- | --- | --- | --- |
| HTML-01 | `<link rel="manifest">` presente | B L | 0 | E | |
| HTML-02 | `<meta name="viewport">` presente e con `width=device-width` | B L | 0 | E | |
| HTML-03 | `<meta name="theme-color">` presente (idealmente coerente col manifest) | B L | 0 | W | |
| HTML-04 | `<meta charset="utf-8">` presente | B L | 0 | W | |
| HTML-05 | `apple-touch-icon` link presente | B L | 0 | W | |
| HTML-06 | `<title>` e `<meta name="description">` presenti | B L | 0 | I | |
| HTML-07 | `apple-mobile-web-app-capable` / `mobile-web-app-capable` | B L | 0 | I | |
| HTML-08 | Splash screen iOS (`apple-touch-startup-image`, varianti portrait/landscape) | B L | 0 | I | |

### 4. Service Worker  *(peso 18)*

Gestione esplicita di **SW generati** (Workbox, `vite-plugin-pwa`,
`next-pwa`, ecc.): se si rileva un SW generato (firma Workbox, `precacheAndRoute`,
manifest di precache) i controlli su eventi/strategie sono considerati soddisfatti
per costruzione e marcati come "gestito da Workbox/plugin", evitando falsi negativi
del pattern-matching.

| ID | Controllo | Modi | Tier | Sev | Block |
| --- | --- | --- | --- | --- | --- |
| SW-01 | File SW presente (`sw.js`/`service-worker.js`/generato) | B L | 0 | E | ✔ |
| SW-02 | Registrazione `navigator.serviceWorker.register(...)` nel bundle | B L | 0 | E | |
| SW-03 | Evento `install` gestito | B L | 0 | W | |
| SW-04 | Evento `fetch` gestito (necessario per offline) | B L | 0 | W | |
| SW-05 | Evento `activate` gestito | B L | 0 | I | |
| SW-06 | Uso di Cache API (`caches.open`, `cache.addAll`) o precache | B L | 0 | I | |
| SW-07 | Strategia offline rilevata (Cache First / Network First / SWR / Network Only / Cache Only) | B L | 0 | I | |
| SW-08 | SW effettivamente registrato e `activated` a runtime | L | 1 | W | |
| SW-09 | `scope` del SW copre lo `scope` del manifest | L | 1 | W | |

### 5. Offline & Caching  *(peso 8)*

| ID | Controllo | Modi | Tier | Sev | Block |
| --- | --- | --- | --- | --- | --- |
| OFF-01 | Offline fallback presente (`offline.html` o route di fallback) | B L | 0 | W | |
| OFF-02 | L'app risponde con contenuto utile **offline** (navigazione test con rete disabilitata) | L | 1 | W | |
| OFF-03 | Cache versioning (nome cache con versione/hash) | B L | 0 | I | |
| OFF-04 | Cleanup delle cache obsolete in `activate` | B L | 0 | I | |
| OFF-05 | `skipWaiting` presente | B L | 0 | I | |
| OFF-06 | `clients.claim()` presente | B L | 0 | I | |

### 6. Installabilità  *(peso 13)*

| ID | Controllo | Modi | Tier | Sev | Block |
| --- | --- | --- | --- | --- | --- |
| INST-01 | Servito su **HTTPS** (o `localhost`) | L | 1 | E | ✔ |
| INST-02 | Criteri di installabilità soddisfatti (manifest valido + SW + icone + display) | B L | 0/1 | E | ✔ |
| INST-03 | Evento `beforeinstallprompt` disponibile a runtime (browser supportati) | L | 1 | W | |

> INST-02 è valutato staticamente in `build` (somma dei prerequisiti, via
> `dependsOn` sugli esiti di MAN/SW/ICO) e confermato a runtime in `live`.
>
> **INST-01 e redirect.** Si valuta l'URL **finale** dopo i redirect: un target
> `http://` che redirige a `https://` è `pass` con nota (consigliare HSTS);
> contenuto servito in HTTPS ma con asset `http:` (mixed content) fa fallire
> INST-01 con l'elenco degli asset in `evidence`.
>
> **INST-03 e timing.** L'evento `beforeinstallprompt` è atteso per **max 5s**
> dopo `load` sulla `start_url`; timeout scaduto → `warning` con nota sul
> supporto browser (l'evento esiste solo su Chromium e richiede i criteri di
> installabilità già soddisfatti).

### 7. Responsiveness  *(peso 14 — vedi sezione dedicata)*

Questa categoria non verifica solo l'**assenza di rotture** (overflow, target
piccoli) ma anche che il layout sia **realmente adattivo**: le immagini scalano, il
contenuto rifluisce a colonna singola su mobile, gli elementi non si sovrappongono e
il testo non viene tagliato. Vedi *Responsiveness — metodologia* per come le
proprietà sono misurate in modo deterministico.

| ID | Controllo | Modi | Tier | Sev | Block |
| --- | --- | --- | --- | --- | --- |
| RSP-01 | Viewport meta corretto (no `user-scalable=no`, no `maximum-scale=1`) | B L | 0 | W | |
| RSP-02 | Nessun overflow orizzontale a ciascun breakpoint (`scrollWidth ≤ clientWidth + tolleranza`) | L | 1 | W | |
| RSP-03 | Touch target ≥ 44×44 px nei breakpoint mobile | L | 1 | W | |
| RSP-04 | Nessun testo con `font-size` < 12px | L | 1 | I | |
| RSP-05 | Presenza di media query / layout adattivo nel CSS | B L | 0 | I | |
| RSP-06 | Nessun elemento a larghezza fissa che ecceda il viewport | L | 1 | I | |
| RSP-07 | Immagini e media scalano col contenitore (`max-width:100%`; nessun `<img>`/`<video>`/`<canvas>`/`<svg>` eccede il proprio contenitore o il viewport) | L | 1 | W | |
| RSP-08 | Layout adattivo verificato tra breakpoint (il contenuto rifluisce a colonna singola sui breakpoint mobile; la geometria del DOM cambia quando il contenuto lo richiede, non un layout desktop semplicemente compresso) | L | 1 | W | |
| RSP-09 | Nessun overlap indebito tra elementi (bounding box di testo/target interattivi che si intersecano) | L | 1 | I | |
| RSP-10 | Nessun clipping/troncamento non intenzionale del testo (`scrollWidth/scrollHeight` del nodo di testo eccede il box con `overflow:hidden`) | L | 1 | I | |
| RSP-11 | **WCAG 1.4.10 Reflow** (AA): contenuto usabile a 320 CSS px equivalenti senza scroll bidirezionale né perdita di contenuto/funzionalità | L | 1 | W | |

> **Scored vs advisory.** RSP-01/02/03/07/08/11 sono `Warning` e concorrono al
> punteggio (misure DOM deterministiche a breakpoint fissi). RSP-04/05/06 e i due
> check euristici RSP-09 (overlap) e RSP-10 (clipping) sono `info`/advisory: elencati
> e spiegati ma **fuori dal punteggio** in v1, perché più soggetti a falsi positivi
> (contenuto dinamico, troncamento voluto con ellipsis). Possono essere promossi a
> scored in una release successiva una volta stabilizzate le euristiche.

### 8. Runtime Health  *(peso 6)*

Errori osservati **a runtime** che indicano una PWA rotta pur con configurazione
statica corretta. Categoria **solo `live`** (Tier 1): richiede il browser e
l'esecuzione reale. Cattura via Playwright (`page.on('console')`,
`page.on('pageerror')`, `page.on('response')`) durante il primo load e la
navigazione sulle `routes`.

**Distinzione segnale/rumore (determinismo).** Sono **scored** solo gli errori
riconducibili alla superficie PWA e **same-origin** (deterministici a parità di
input); gli errori generici dipendenti da backend/terze parti sono `advisory`,
fuori dal punteggio, per non rendere il voto instabile. Le richieste verso origini
di terze parti (analytics, ads, CDN esterni) sono **escluse di default** e
configurabili via `runtime.ignoreOrigins` / `runtime.ignoreUrls`.

| ID | Controllo | Modi | Tier | Sev | Block |
| --- | --- | --- | --- | --- | --- |
| RUN-01 | Nessun **404 / errore di rete** su asset **same-origin** referenziati (JS/CSS/font/immagini/icone) | L | 1 | W | |
| RUN-02 | Nessun 404 su risorse **precachate dal SW** o dichiarate nel `manifest` (icone, `start_url`) | L | 1 | W | |
| RUN-03 | Nessun errore console `error` / `pageerror` durante **registrazione SW** o **fetch del manifest** | L | 1 | W | |
| RUN-04 | Nessun errore console non gestito al **primo load** (generico) | L | 1 | I | |
| RUN-05 | Nessuna risposta **5xx** su richieste same-origin | L | 1 | I | |

> **RUN assorbe INST-04.** Il precedente INST-04 ("nessun errore di console
> bloccante al primo load", info) è confluito qui: **RUN-03** ne isola la parte
> PWA-critical (SW/manifest) come `Warning` scored, **RUN-04** mantiene la parte
> generica come `info` advisory.

> **Auth-aware.** Risposte `401/403` su route dietro login **non** fanno fallire
> RUN-01/RUN-05: sono trattate come `skipped (auth-required)` (coerente con
> §Autenticazione), distinguendo "risorsa rotta" da "risorsa protetta".

> **Scored vs advisory.** RUN-01/02/03 sono `Warning` e concorrono al punteggio
> (same-origin + PWA-related, misure di rete/console deterministiche a parità di
> input). RUN-04/05 sono `info`/advisory: elencati e spiegati ma **fuori dal
> punteggio** in v1, perché più soggetti a variabilità di backend/terze parti.

### 9. UX  *(peso 3)*

| ID | Controllo | Modi | Tier | Sev | Block |
| --- | --- | --- | --- | --- | --- |
| UX-01 | `theme_color` coerente tra manifest e meta tag | B L | 0 | I | |
| UX-02 | `display` installabile e navigazione adeguata (no dead-end senza barra browser) | B L | 0 | I | |
| UX-03 | Uso di system font (`font-family: system-ui`) suggerito | B L | 0 | I | |
| UX-04 | Shortcuts dichiarate nel manifest | B L | 0 | I | |
| UX-05 | Skeleton/preload/lazy-loading rilevati (performance percepita) | B L | 0 | I | |

### 10. API moderne  *(advisory — non nel punteggio)*

Informativi: File Handling API, Share Target, Web Share API, Background Sync,
Periodic Background Sync, Badging API, Launch Handler, Window Controls Overlay,
Web Push (handler `push`/`notificationclick` nel Service Worker, MOD-07).
Per ciascuno: rilevato / non rilevato + nota di supporto cross-browser.

### 11. Compatibilità  *(advisory — non nel punteggio)*

Per le feature usate, segnalare le **limitazioni note** su Chrome, Edge, Firefox,
Safari, Android, iOS (es. SW e installabilità limitati su iOS Safari, niente
`beforeinstallprompt` su iOS). Tabella statica di capability mantenuta nel tool.

### 12. Lighthouse  *(Tier 2, advisory, opt-in)*

`--lighthouse` (solo modo `live`): riporta i punteggi PWA/Performance/
Accessibility/Best-Practices/SEO come **riferimento**. Non concorre al voto salvo
`--include-advisory-in-score`.

---

### 13. Performance  *(advisory — non nel punteggio in v1)*

Strategia: **non costruire un motore di performance**. Si combinano due livelli,
entrambi agnostici da framework.

**13a. Performance hygiene statica (Tier 0, deterministica, modo `build`).**
Controlli su dimensioni e struttura degli artefatti — deterministici, quindi
candidabili a entrare nel punteggio in futuro.

| ID | Controllo | Modi | Tier | Sev |
| --- | --- | --- | --- | --- |
| PERF-01 | Budget peso totale JS/CSS iniziale entro soglia (configurabile) | B | 0 | I |
| PERF-02 | Nessuna risorsa render-blocking evitabile in `<head>` | B L | 0 | I |
| PERF-03 | Immagini con `loading="lazy"` dove opportuno / formati moderni | B L | 0 | I |
| PERF-04 | `preconnect`/`preload` per risorse critiche | B L | 0 | I |
| PERF-05 | Nessuna sourcemap servita in produzione | B L | 0 | I |
| PERF-06 | Asset statici con hash in nome (cache-busting) | B | 0 | I |

**13b. Performance di laboratorio (Tier 2, non deterministica, opt-in, modo
`live`).** Riuso di **Lighthouse** per Performance score + Core Web Vitals (LCP,
CLS, TBT/INP, FCP). Per CI è disponibile l'integrazione con `@lhci/cli`
(Lighthouse CI) e budget. Non concorre al voto salvo `--include-advisory-in-score`.

*Effort stimato: basso. 13b è quasi tutto riuso di Lighthouse (già previsto);
13a è analisi dimensione file + parsing HTML.*

---

## Responsiveness — punto di partenza (iterabile)

**Fase 1 (v1, deterministica, default).** Euristiche su proprietà del DOM via
Playwright, a un set **fisso** di breakpoint:

| Nome | Viewport | Classe |
| --- | --- | --- |
| mobile-s | 320×568 | mobile |
| mobile-m | 360×740 | mobile |
| tablet | 768×1024 | tablet |
| tablet-l | 1024×768 | tablet |
| desktop | 1280×800 | desktop |
| desktop-l | 1920×1080 | desktop |

Per ogni breakpoint si valutano i controlli RSP-02..10 leggendo proprietà
misurabili (`scrollWidth`/`clientWidth`, bounding box dei target interattivi,
`getComputedStyle`). Tolleranza configurabile (default overflow ≤ 1px). I breakpoint
sono sovrascrivibili da config.

**Precondizioni di misura (per il determinismo).** Prima di ogni set di misure a un
breakpoint il tool: (a) imposta il viewport e `deviceScaleFactor`; (b) attende
`networkidle` e `document.fonts.ready` (i web font cambiano le metriche del testo);
(c) disabilita animazioni/transizioni CSS (`prefers-reduced-motion` + injection di
`* { animation: none !important; transition: none !important; }`) per congelare il
layout; (d) non scrolla e non interagisce. Le misure vengono lette una sola volta a
layout stabile. Elementi con `display:none`/`visibility:hidden`/opacità 0 e nodi
fuori dal flusso documentale sono esclusi.

**Come sono valutati i nuovi controlli layout:**

* **RSP-07 (media scalano).** Per ogni `<img>/<video>/<canvas>/<svg>/<picture>` si
  confronta il `getBoundingClientRect().right/bottom` con il box del contenitore e
  con il viewport. Fallisce se un media eccede il contenitore oltre la tolleranza o
  provoca overflow orizzontale della pagina. Segnalato anche il caso `width`/`height`
  fissi in px senza `max-width:100%`.
* **RSP-08 (layout adattivo).** Si confronta la **geometria** del contenuto tra una
  classe desktop e una mobile: (1) sui breakpoint mobile nessuna riga di contenuto
  principale deve richiedere scroll orizzontale né comprimere elementi sotto una
  larghezza minima leggibile; (2) se a desktop esistono elementi affiancati
  (multi-colonna) questi devono impilarsi (colonna singola) a 320/360px. **Guardia
  anti-falso-positivo:** un'app già a colonna singola su tutti i breakpoint è
  considerata valida (non si pretende che il layout "cambi" se non serve); il check
  fallisce solo quando un layout largo **non** rifluisce e ciò genera crowding/
  overflow.
* **RSP-09 (overlap, advisory).** Si campiona un insieme di nodi "foglia" di testo e
  di target interattivi (`a,button,input,[role=button],…`) e si verifica che i loro
  bounding box non si intersechino oltre una tolleranza. Sono ammessi overlap
  intenzionali (elementi `position:absolute/fixed`, tooltip, dropdown, elementi con
  z-index esplicito e background) tramite lista di esclusione configurabile.
* **RSP-10 (clipping, advisory).** Per i nodi di testo si confronta
  `scrollWidth/scrollHeight` con `clientWidth/clientHeight` in presenza di
  `overflow:hidden`. Il troncamento **intenzionale** (`text-overflow:ellipsis`,
  `-webkit-line-clamp`, `overflow:auto/scroll`) è escluso e non fa fallire il check.
* **RSP-11 (WCAG 1.4.10 Reflow, scored).** Criterio AA formale. Si porta il
  contenuto all'equivalente di **320 CSS px** di larghezza — nell'implementazione via
  viewport 1280×1024 con **zoom di pagina 400%** (`page.evaluate` su
  `document.body.style.zoom` / emulazione `deviceScaleFactor`), che è il modo canonico
  di testare il criterio e cattura layout che "reggono" a 320px nativi ma si rompono
  sotto zoom. Si verifica che: (1) non serva **scroll orizzontale** per leggere il
  contenuto a scorrimento verticale (`documentElement.scrollWidth ≤ clientWidth +
  tolleranza`); (2) nessun contenuto o funzionalità vada **perso** (nessun elemento
  interattivo o testo diventa `display:none`/fuori dal viewport rispetto al layout
  desktop). **Eccezioni previste dal criterio** — contenuti che richiedono layout
  bidimensionale per significato/uso (tabelle dati, mappe, diagrammi, immagini di
  grandi dimensioni, video, giochi, UI di editing) — sono esclusi tramite
  `layout.ignoreSelectors`.

> **RSP-02 vs RSP-11.** RSP-02 misura l'overflow orizzontale ai breakpoint nativi
> (incluso 320px). RSP-11 è il criterio WCAG formale sotto **zoom 400%** e aggiunge
> la condizione di **non perdita** di contenuto/funzionalità: è più stringente e
> cattura casi che RSP-02 non vede (es. layout con `min-width` in px che cede solo
> quando il testo è ingrandito).

**Fase 2 (futura, opt-in, advisory).** Visual regression con baseline: screenshot
per breakpoint confrontati con immagini di riferimento approvate. Richiede gestione
baseline (`--update-baseline`), mascheratura aree dinamiche, soglia di diff. Non
deterministico → fuori dal punteggio. *Fuori scope v1: si progetta all'apertura
della v2 (vedi §Backlog decisionale) — nessun impatto sul lavoro attuale.*

---

## Sistema di punteggio

### Pesi per categoria (somma = 100)

| Categoria | Peso |
| --- | --- |
| Manifest | 20 |
| Service Worker | 18 |
| Responsiveness | 14 |
| Installabilità | 13 |
| Icone | 10 |
| HTML head | 8 |
| Offline & Caching | 8 |
| Runtime Health | 6 |
| UX | 3 |
| **Totale** | **100** |

> **Nota v2.1**: Responsiveness sale da 8 a 14 (verifica del layout reale, non solo
> assenza di overflow). Il peso è recuperato riducendo Manifest (22→20), Service
> Worker (20→18) e Offline & Caching (12→10). La somma resta 100.
>
> **Nota v2.2**: aggiunta la categoria **Runtime Health** (peso 6). Il peso è
> recuperato riducendo Installabilità (16→13), Offline & Caching (10→8) e UX (4→3)
> — categorie con cui Runtime Health si sovrappone concettualmente (errori a
> runtime = installabilità/offline *reali*). La somma resta 100.

*API moderne, Compatibilità e Lighthouse sono `advisory` e non entrano nel punteggio.*

### Peso dei controlli (intra-categoria)

Il catalogo non assegna pesi per-check: salvo override esplicito, il `weight`
deriva dalla severità — **Error = 3, Warning = 1**. Gli `info` non hanno peso
(fuori dal punteggio). I `blocking` non pesano più degli altri: il loro effetto è
il **cap** (punto 4 sotto). Questa regola rende il catalogo compilabile
meccanicamente: un junior copia severità → peso senza decisioni caso per caso.

### Aggregazione multi-istanza (breakpoint × route)

I check Tier 1 di pagina (RSP-*, RUN-*, OFF-02) producono un `Finding` per ogni
istanza (breakpoint × route). Ai fini del punteggio il check è **binario,
worst-of**: `pass` solo se passa su **tutte** le istanze applicabili; una sola
istanza fallita fa fallire il check e il report elenca ogni istanza fallita in
`evidence` (es. `mobile-s @ /dashboard`). Niente crediti parziali in v1 — regola
semplice e deterministica; l'eventuale credito proporzionale è una questione
aperta (§Questioni).

### Calcolo

1. Si considerano solo i controlli **error/warning** **applicabili al modo
   corrente** e non `skipped`. I controlli `info`/`advisory` sono esclusi.
2. Per ogni categoria: `score_cat = (Σ peso dei controlli passati) / (Σ peso dei
   controlli applicabili) × peso_categoria`. Se una categoria non ha controlli
   applicabili nel modo corrente, il suo peso viene **ridistribuito** sulle altre
   (normalizzazione), così i modi restano comparabili. Il report indica sempre
   quanti controlli sono stati saltati e perché.
3. `score = Σ score_cat`, arrotondato all'intero. È una percentuale 0–100.
4. **Cap da blocker**: se fallisce un controllo `blocking` (es. manifest assente,
   SW assente, icona 192/512 assente, HTTPS assente in `live`), il voto è
   **limitato a F**, indipendentemente dal punteggio numerico, perché l'app non è
   una PWA installabile. Il report spiega quale blocker ha causato il cap.

### Voti

| Voto | Range |
| --- | --- |
| A | 95–100 |
| B | 85–94 |
| C | 70–84 |
| D | 55–69 |
| E | 40–54 |
| F | < 40 (o blocker fallito) |

*(L'esempio di output usa `B (88%)`, coerente con il range B = 85–94. La versione
precedente della spec mostrava `B (82%)`, incoerente: corretto.)*

---

## Configurazione

File opzionale `web-checks.config.{json,js,ts}` o flag CLI. Tutto ha default
sensati; il tool funziona zero-config.

* `mode`: `source` | `build` | `live` | combinazioni; default auto-detect.
* `breakpoints`: override del set responsive.
* `layout`: tolleranze e opzioni dei check responsive:
  * `overflowTolerancePx` (default 1) — tolleranza overflow orizzontale (RSP-02/07).
  * `overlapTolerancePx` (default 1) — intersezione ammessa tra box (RSP-09).
  * `minTouchTargetPx` (default 44) — soglia touch target (RSP-03).
  * `minFontSizePx` (default 12) — soglia testo minimo (RSP-04).
  * `minReadableColWidthPx` (default 240) — larghezza minima di colonna sotto cui il
    contenuto è considerato "compresso" (RSP-08).
  * `ignoreSelectors` — selettori CSS esclusi dai check di overlap/clipping (es.
    overlay, tooltip, mappe, carousel): `["[data-overlay]", ".tooltip", ".map"]`.
* `runtime`: opzioni dei check Runtime Health (RUN-*):
  * `ignoreOrigins` — origini escluse da RUN-* (default: **tutte le origini ≠
    target**, così solo il same-origin è scored): `["https://www.google-analytics.com"]`.
  * `ignoreUrls` — URL/glob specifici da ignorare (beacon, telemetria):
    `["**/collect", "**/gtm.js"]`.
  * `failOnStatus` (default `[404]`) — status di rete che fanno fallire RUN-01/02.
  * `advisoryStatus` (default `[500,502,503,504]`) — status trattati come advisory
    (RUN-05).
* `timeouts`: `{ httpMs: 15000, navigationMs: 30000 }` — timeout I/O e navigazione
  browser; allo scadere il check interessato fallisce/skippa, la run prosegue.
* `perf`: `{ initialBudgetKb: 300 }` — soglia PERF-01 (advisory): somma dei byte
  serviti di JS+CSS iniziali referenziati dall'entry HTML, pre-compressione.
* `weights`: override dei pesi di categoria.
* `ignore`: lista di ID controllo da escludere (es. `["UX-03"]`) → `skipped (disabled)`.
* `failBelowGrade` / `--fail-below-grade`: soglia del gate CI; la sola presenza
  attiva il gate (come le soglie dei tool poqa), il flag sovrascrive la config.
  Sostituisce `minGrade` + `--ci` (default `C`, D2) dal 2026-11-22: un gate con
  soglia implicita era l'unico non dichiarato esplicitamente nella suite.
* `lighthouse` *(v1.x)*: on/off. In v1 il flag è riconosciuto ma risponde
  `Lighthouse integration lands in v1.x` e i check LH-* restano `skipped`.
* `baseUrl`: origine per risolvere i path relativi in modo `live`.
* `auth`: configurazione autenticazione (vedi §Autenticazione). Campi (chiavi
  sconosciute = errore d'uso):
  * `module` — path al file JS pluggable (anche `--auth`).
  * `storageState` — sessione registrata con `web-checks auth record` o
    storageState Playwright (anche `--auth-state`).
  * `ready` — `{ url?, selector?, timeoutMs? }`: login-wall guard per sessione
    registrata, cache e forma funzione (il `ready` di un DSL ha la precedenza).
  * `headers` — header statici (alternativa o aggiunta al `module`); placeholder espansi.
  * `httpCredentials` — `{ username, password }` per HTTP Basic/Digest (proxy
    davanti all'app): browser e richieste statiche same-origin; placeholder espansi.
  * `cache` — `{ path, ttl }` (ms) per persistere lo `storageState` autenticato
    (anche `--auth-cache <file>`, TTL 12 h se il file di config non lo fissa).
  * `refresh` — forza il re-login ignorando la cache (anche `--refresh-auth`).
  I flag CLI hanno la precedenza sulle chiavi del file.
* `routes`: URL/route rappresentative su cui girano i check Tier 1 di pagina.
  **Default: `[start_url]`** (o `/` se il manifest non la dichiara).
* `includeAdvisoryInScore` *(rinviato a v1.x — deciso 2026-07-02)*: chiave
  **riservata**; in v1 usarla produce errore d'uso `not yet supported` (exit 1).
  Il punteggio v1 considera **solo** error/warning. La regola di peso degli
  advisory verrà fissata in v1.x insieme al flag (proposta: weight 1 uniforme).
* `startUrl`/`scope` override per il check di installabilità.

---

## Autenticazione (modo `live`)

Molte app hanno il contenuto rappresentativo **dietro login**. Va distinto *cosa* è
protetto e *come* il tool vi accede.

### Cosa richiede auth (e cosa no)

* La **configurazione PWA** (manifest, service worker, icone, `<head>`) è pubblica
  per costruzione — deve esserlo perché l'installabilità funzioni. Perciò tutti i
  controlli **Tier 0** (MAN-*, ICO-*, HTML-*, SW-01..07) e la parte statica di INST-*
  girano **senza autenticazione**, anche su app "dietro login".
* Dietro auth sta il **contenuto renderizzato**: i controlli **Tier 1 su pagina**
  (RSP-*, RUN-*, OFF-02, INST-03, SW-08/09) hanno bisogno di una sessione autenticata *e*
  di URL rappresentativi, altrimenti girerebbero sulla login page — non
  rappresentativa. Il report segnala sempre quando un check è girato senza sessione.

### Principio: auth pluggable in un singolo file JS

Requisito di design: **l'utente fornisce solo un file JS** (`web-checks.auth.js`, o un
path in `auth.module`) per gestire l'autenticazione. Il file può assumere tre forme,
tutte **agnostiche dal framework** dell'app:

1. **DSL dichiarativo** (default, nessuna conoscenza di Playwright) — una lista di step.
2. **Funzione imperativa** (escape hatch) — controllo Playwright completo per flussi
   complessi (MFA custom, token rinnovati, redirect multipli).
3. **Sessione pronta** (token/header) — nessun browser, per auth via API token.

Il tool rileva la forma dal default export, esegue l'auth **una sola volta** prima
dei check e produce un **context autenticato** riusato da tutte le route e tutti i
breakpoint. L'auth **non concorre al punteggio** e gira **prima** delle misure
deterministiche, così da non alterarle.

### Contratto del modulo

```ts
// Il default export è una di queste forme:
type AuthModule = AuthFn | AuthDSL | AuthSession;

type AuthFn = (page: Page, ctx: AuthContext) => Promise<AuthResult | void>;

interface AuthDSL {
  steps: AuthStep[];
  ready?: ReadyCondition;   // verifica post-login (login-wall guard)
}

// Almeno uno tra url e selector; se entrambi presenti devono valere entrambi.
interface ReadyCondition {
  url?: string;        // glob sull'URL corrente (es. "**/dashboard")
  selector?: string;   // selettore CSS che deve esistere ed essere visibile
  timeoutMs?: number;  // default 10000
}

interface AuthContext {
  baseUrl: string;
  env(name: string): string;      // legge da process.env
  secret(name: string): string;   // segreti: mai stampati in report/log
  resolve(path: string): string;  // path relativo -> URL assoluto su baseUrl
  log: Logger;
}

type AuthResult = void | { storageState?: StorageState } | AuthSession;

interface AuthSession {           // flussi token/header senza browser
  cookies?: Cookie[];
  headers?: Record<string, string>;
  storageState?: StorageState;
}
```

**DSL — step supportati** (sottoinsieme sicuro e agnostico):

| Step | Significato |
| --- | --- |
| `{ goto: path }` | naviga (relativo a `baseUrl`) |
| `{ fill: selector, value }` | scrive in un campo; `value` supporta `{{env.X}}` / `{{secret.X}}` |
| `{ click: selector }` | click |
| `{ press: selector, key }` | pressione tasto |
| `{ waitFor: { url \| selector } }` | attende un URL (glob) o un selettore |
| `{ setCookie: { name, value, domain?, path?, secure?, httpOnly? } }` | inietta un cookie; `domain`/`path` default dal `baseUrl` |
| `{ setLocalStorage: { key, value } }` | scrive in `localStorage` (eseguito su `baseUrl`, prima della navigazione) |
| `{ setSessionStorage: { key, value } }` | scrive in `sessionStorage` della pagina corrente (su `baseUrl` se non ne è aperta una) |

I placeholder `{{env.*}}` / `{{secret.*}}` evitano credenziali in chiaro nel file.
`{{totp.X}}` (e `ctx.totp('X')`) vale il codice TOTP corrente (RFC 6238: SHA-1,
6 cifre, 30 s) per il seed base32 nella variabile `X`; seed e codice sono oscurati.
Calcolato con `node:crypto`: il modulo utente non può importare pacchetti npm.

### Esempi

DSL (caso comune, nessun Playwright):

```js
// web-checks.auth.js
export default {
  steps: [
    { goto: '/login' },
    { fill: '#email', value: '{{env.PWA_USER}}' },
    { fill: '#password', value: '{{secret.PWA_PASS}}' },
    { click: 'button[type=submit]' },
    { waitFor: { url: '**/dashboard' } },
  ],
  ready: { selector: '[data-testid=app-shell]' }, // login-wall guard
};
```

Imperativo (escape hatch):

```js
export default async function auth(page, ctx) {
  await page.goto(ctx.resolve('/login'));
  await page.fill('#email', ctx.env('PWA_USER'));
  await page.fill('#password', ctx.secret('PWA_PASS'));
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard');
  // opzionale: return { storageState: await page.context().storageState() };
}
```

Sessione senza browser (token/header):

```js
export default async () => ({
  headers: { Authorization: `Bearer ${process.env.PWA_TOKEN}` },
});
```

La forma sessione accetta `cookies` (senza `domain` valgono per l'origine del
target), `headers`, `sessionStorage` (`[{ origin, entries: [{ name, value }] }]`)
e `httpCredentials`.

### Login non scriptabili: sessione registrata (OAuth/OIDC, SAML, SSO, MFA)

Quando il login avviene su un identity provider terzo (Google, Microsoft/Entra,
GitHub, Okta, …) scriptarlo è fragile: anti-bot e captcha sui browser
automatizzati, MFA push/passkey, markup del provider che cambia. Principio:
**separare l'acquisizione della sessione dal suo uso**.

* `web-checks auth record <url> [-o file] [--ready-url glob] [--ready-selector css]`
  apre un Chromium **visibile** su `<url>`; la persona fa il login a mano
  (qualunque flusso) e preme Invio nel terminale, oppure il salvataggio scatta
  appena vale la condizione `ready`. Serve un display: senza, exit 3 subito.
* Il file salvato (`{ tool, savedAt, url, storageState }`, modo 0600) contiene
  cookie, `localStorage`, **IndexedDB** (Firebase Auth) e **`sessionStorage`**
  (MSAL): Playwright non persiste `sessionStorage`, che viene catturato dalle
  pagine aperte e reiniettato con un init script una sola volta per tab e
  origine, prima degli script dell'app. È accettato anche uno storageState
  Playwright puro (`{ cookies, origins }`).
* Le run lo caricano con `--auth-state` / `auth.storageState`. Prima dei check
  la sessione viene **verificata** aprendo l'app (login-wall guard con
  `auth.ready` o l'euristica): se è scaduta e non c'è un `module`, **fail-fast**
  (exit 3) con il comando per registrarla di nuovo; con un `module`, si ripiega
  sul login scriptato.
* In CI la sessione registrata va conservata come secret. Per CI senza persona
  l'alternativa è non passare dalle pagine del provider: il modulo (forma
  sessione) scambia un refresh token di un utente di test con un token
  (`fetch` al token endpoint) e restituisce `cookies`/`headers`/`sessionStorage`.

Ordine delle fonti: cache valida → sessione registrata → `module` → solo
`headers`/`httpCredentials`.

### Ciclo di vita, caching e determinismo

* **Esecuzione unica**: l'auth gira una volta per run; il context autenticato è
  riusato su tutte le route e tutti i breakpoint.
* **Caching opzionale** (`auth.cache = { path, ttl }`): lo `storageState` risultante
  può essere persistito su disco con TTL, così le run successive **saltano il login**
  → più veloci e più deterministiche. Invalidato a TTL scaduto, con `--refresh-auth`,
  o quando la sessione in cache non passa più il login-wall guard (si rifà il login).
  Il file è scritto con modo 0600.
* **Login-wall guard**: dopo l'auth il tool valuta `ready` (o, in assenza, un'euristica
  con fino a 5 s di attesa per il redirect: campo password visibile, o path che
  termina con un segmento di login — `/login`, `/signin`, `/sign-in`, `/log-in`,
  `/logon`. Un path che contiene solo `auth`, come `/app/auth/...`, non conta).
  * Se `ready` **fallisce** → **fail-fast** con diagnostica esplicita
    (`auth failed / expired`), invece di produrre check fuorvianti.
  * Se un singolo check auth-dipendente incontra comunque un muro di login →
    `skipped (auth-required)`, coerente con la filosofia **skip-not-fail**. Questo
    permette anche a MAN-05/INST-02 di distinguere `start_url` **irraggiungibile**
    da **auth-gated** (302 → login).
* **Segreti**: i valori letti via `secret()` / `{{secret.*}}` non vengono **mai**
  stampati in report o log; l'`evidence` che li contenesse è oscurata.

### Route rappresentative

Ortogonale all'auth ma spesso necessaria con SPA il cui `start_url` rimanda al login:
`routes` elenca le pagine profonde su cui girano i check Tier 1 di pagina.

```jsonc
"routes": ["/dashboard", "/settings", "/reports/42"]
```

I controlli RSP-* / OFF-02 girano su ciascuna route; il report aggrega per route.

---

## Roadmap

* **v1**: modi `build`/`live` (più `source` come pre-flight advisory), catalogo
  Tier 0 completo, Tier 1 (responsive euristiche estese — overflow, media scaling,
  reflow/layout adattivo, overlap e clipping advisory — + installabilità/offline
  runtime, runtime health RUN-*), Performance hygiene statica (13a, advisory),
  output CLI leggibile,
  punteggio e voto, config base.
* **v1.x**: output JSON + exit code CI; report HTML; SARIF; Lighthouse opt-in (13b)
  con eventuale `@lhci/cli`.
* **v2**: visual regression (baseline) come Tier 1 advisory; valutare promozione di
  Performance hygiene statica (13a) nel punteggio; espansione tabella compatibilità.

---

## Backlog decisionale (nulla di bloccante per v1)

**Per la v1 non restano decisioni aperte**: tutto ciò che segue è già risolto per
lo scope v1 (comportamento definito sopra) e la decisione residua riguarda solo
release future, da prendere coi dati delle prime run.

### Decisioni chiuse

| # | Tema | Esito | Data |
| --- | --- | --- | --- |
| D1 | Runtime: Bun single-binary | **Nice-to-have** → Strategia A (Node); Bun solo eventuale artefatto extra post-v1 | 2026-07-02 |
| D2 | Soglia CI di default | **`C`** (override con `--min-grade`); il flag `--ci` resta v1.x. *Superata il 2026-11-22: `--fail-below-grade <g>` senza default* | 2026-07-02 |
| D3 | `--include-advisory-in-score` | **Rinviato a v1.x**; in v1 chiave riservata → errore d'uso. Punteggio v1 = solo error/warning | 2026-07-02 |
| D4 | Lingua dei messaggi | **Inglese**, catalogo centralizzato (i18n futura possibile) | 2026-07-02 |
| D5 | start_url/scope dietro auth/SPA | Modulo auth pluggable + login-wall guard + `routes` (vedi §Autenticazione) | v2.2 |
| D6 | Tooling per-framework | Escluso; `source` ridotto a pre-flight advisory | v2 |
| D7 | Nome pacchetto | ~~`pwa-check`~~ → **`web-checks`**, bin omonimo (D8) | 2026-10-31 |
| D8 | Perimetro | Da validatore PWA a verifiche su qualunque app web; PWA come pacchetto opzionale (§Perimetro e pacchetti). Rename immediato, senza alias: POC senza utenti | 2026-10-31 |
| D9 | Distribuzione | Niente npm pubblico: tarball di `npm pack` + `SHA256SUMS` su GitHub Release | 2026-10-31 |

### Da decidere in v1.x (coi dati delle prime run)

1. **Promozione di RSP-09 (overlap) e RSP-10 (clipping)** da advisory a scored,
   più eventuali criteri aggiuntivi di "layout corretto" (contrasto, baseline
   visual, scroll orizzontale a 256 CSS px di altezza).
2. **Regola di peso degli advisory** quando `--include-advisory-in-score` verrà
   implementato (proposta sul tavolo: weight 1 uniforme nella categoria;
   Lighthouse comunque escluso).
3. **Crediti parziali multi-istanza**: valutare credito proporzionale
   (istanze passate / applicabili) se il worst-of binario si rivela troppo
   punitivo su app multi-route.

### Da decidere in v2

4. **Promozione della Performance hygiene statica (13a)** a categoria scorata, e
   con quale peso.
5. **Packaging come GitHub Action.**

---

## Changelog

* **v2.5** — Da pwa-check a **web-checks**:
  * perimetro esteso a qualunque applicazione che si apre in un browser
    (§Obiettivo); confine con i check `http` di poqa;
  * nuova sezione §Perimetro e pacchetti, implementata: pacchetti `runtime`,
    `responsive`, `head`, `pwa` rilevato, advisory `perf`/`compat`/`modern`;
    voto per pacchetto e complessivo; `--pack`, `--only`, `packs` nella config;
    exit 3 se il browser serve e non parte, `--no-browser` per evitarlo;
    `schemaVersion` e `packs` nel JSON; RUN-02/RUN-03 spostati in `pwa`;
  * rename di bin, file di config (`web-checks.config.*`), modulo auth
    (`web-checks.auth.js`) e campo `tool` del JSON; decisioni D7–D9;
  * distribuzione senza npm pubblico (§Runtime di implementazione).

* **v2.4** — Chiusura di tutte le decisioni aperte per v1 (handoff a sviluppo):
  * decisioni utente registrate (D1–D4, §Backlog decisionale): Bun nice-to-have,
    soglia CI default `C`, `--include-advisory-in-score` rinviato a v1.x,
    messaggi in inglese;
  * §Questioni aperte ristrutturata in **Backlog decisionale** con log delle
    decisioni chiuse: per v1 non resta nulla da approvare;
  * definiti `ReadyCondition` e le forme di `setCookie`/`setLocalStorage` nel
    DSL auth; `routes` default `[start_url]`; timeout INST-03 (5s);
    `Check.weight` opzionale; categoria `Preflight` per SRC-*; `lighthouse`
    marcato v1.x; gestione `NO_COLOR`/TTY nel report.
* **v2.3** — Revisione di coerenza e completamento operativo:
  * risolta la contraddizione catalogo↔nota `source`: SW-01/02, INST-02, RSP-05,
    UX-03 non sono più etichettati `S` (in `source` la copertura equivalente è
    SRC-02/03); MAN-02 esteso a `S` (il manifest-file è validabile pre-build);
  * formalizzato lo smoke check `source` in **SRC-01..03**;
  * definita la **sintassi CLI dei modi combinati** (più target posizionali);
  * regola anti-doppio-conteggio **MAN-01↔HTML-01** (speculare a ICO-06↔HTML-05),
    `dependsOn` MAN-02..15 → niente error a cascata; gestione manifest/SW multipli;
  * definizione operativa di **MAN-05 raggiungibile** per modo; nota **ICO-01/02
    purpose `any`**; nota **INST-01 redirect/mixed content**;
  * punteggio: **peso di default derivato dalla severità (E=3, W=1)**, regola
    `status === check.severity`, **aggregazione multi-istanza worst-of**;
  * `Finding.skipReason` tipizzato (tassonomia degli skip);
  * **exit code v1**, lingua dei messaggi (**inglese**, catalogo centralizzato),
    ordinamento deterministico del report;
  * Tier 1 dichiarato **Chromium-only** in v1; nota sul limite Tier 0 in `live`
    (tag iniettati via JS) con re-check sul DOM renderizzato;
  * config: aggiunti `timeouts` e `perf.initialBudgetKb`.
* **v2.2 / v2.1** — vedi note storiche in §Sistema di punteggio.
