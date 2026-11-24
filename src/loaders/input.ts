// InputSource — artifact access, FS or HTTP (IMPLEMENTATION_PLAN §A.1).
// The single way every Tier 0 check reads the target, identical in `build`
// (files) and `live` (HTTP). No check uses node:fs or fetch directly.

import { type Dirent, createReadStream } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, posix, resolve as resolvePath } from 'node:path';
import type { Mode } from '../core/check.js';

export interface Asset {
  /** Logical path relative to baseUrl, e.g. "/manifest.webmanifest". */
  path: string;
  bytes: Buffer;
  /** HTTP header, or inferred from extension (build). */
  contentType?: string;
}

export interface InputSource {
  readonly mode: Mode;
  /** Absolute FS root, or HTTP origin. */
  readonly baseUrl: string;
  /** null = 404 / missing file. Never throws on 404/timeout. */
  read(path: string): Promise<Asset | null>;
  /** HEAD (live) / fs.stat (fs) — no body. */
  exists(path: string): Promise<boolean>;
  /** index.html (fs) or GET baseUrl (live). */
  entryHtml(): Promise<Asset | null>;
  /** FS only; live → [] (use references found in the HTML). */
  list(glob?: string): Promise<string[]>;
}

/** Normalize a logical path: always relative to baseUrl, leading '/'. */
export function normalizePath(p: string): string {
  const cleaned = p.split(/[?#]/)[0] ?? p;
  const withSlash = cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
  return posix.normalize(withSlash);
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function inferContentType(path: string): string | undefined {
  return CONTENT_TYPES[extname(path).toLowerCase()];
}

/** Convert a minimal glob (supporting * and **) into a RegExp. */
function globToRegExp(glob: string): RegExp {
  // Tokenize on ** and * so each maps to a distinct pattern without a
  // placeholder char; everything else is escaped literally.
  const tokens = glob.split(/(\*\*|\*)/);
  const pattern = tokens
    .map((tok) => {
      if (tok === '**') return '.*';
      if (tok === '*') return '[^/]*';
      return tok.replace(/[.+^${}()|[\]\?]/g, '$&');
    })
    .join('');
  return new RegExp(`^${pattern}$`);
}

/** Filesystem-backed source for `source`/`build` modes. */
export class FsSource implements InputSource {
  readonly mode: Mode;
  readonly baseUrl: string;

  constructor(root: string, mode: Mode) {
    this.baseUrl = resolvePath(root);
    this.mode = mode;
  }

  private toFsPath(logicalPath: string): string {
    const norm = normalizePath(logicalPath);
    return join(this.baseUrl, norm);
  }

  async read(path: string): Promise<Asset | null> {
    const fsPath = this.toFsPath(path);
    try {
      const bytes = await readFile(fsPath);
      return { path: normalizePath(path), bytes, contentType: inferContentType(path) };
    } catch {
      return null;
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      const s = await stat(this.toFsPath(path));
      return s.isFile();
    } catch {
      return false;
    }
  }

  async entryHtml(): Promise<Asset | null> {
    return this.read('/index.html');
  }

  async list(glob?: string): Promise<string[]> {
    const out: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries: Dirent[];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const abs = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
          await walk(abs);
        } else if (entry.isFile()) {
          const rel = `/${posix.relative(this.baseUrl, abs.split('\\').join('/'))}`;
          out.push(rel);
        }
      }
    };
    await walk(this.baseUrl);
    out.sort();
    if (!glob) return out;
    const re = globToRegExp(glob.startsWith('/') ? glob : `/${glob}`);
    return out.filter((p) => re.test(p));
  }

  /** Stream helper for large assets (avoids buffering when only size is needed). */
  stream(path: string): NodeJS.ReadableStream {
    return createReadStream(this.toFsPath(path));
  }
}

/** HTTP-backed source for `live` mode. */
export class HttpSource implements InputSource {
  readonly mode: Mode = 'live';
  readonly baseUrl: string;
  private readonly httpMs: number;
  private readonly headers: Record<string, string>;

  /**
   * `headers` (e.g. HTTP Basic credentials for a proxy in front of the app)
   * are sent only to the target's own origin.
   */
  constructor(origin: string, opts?: { httpMs?: number; headers?: Record<string, string> }) {
    // Strip trailing slash so join is predictable.
    this.baseUrl = origin.replace(/\/+$/, '');
    this.httpMs = opts?.httpMs ?? 15000;
    this.headers = opts?.headers ?? {};
  }

  private headersFor(url: string): Record<string, string> {
    try {
      return new URL(url).origin === new URL(this.baseUrl).origin ? this.headers : {};
    } catch {
      return {};
    }
  }

  private toUrl(logicalPath: string): string {
    if (/^https?:\/\//.test(logicalPath)) return logicalPath;
    return this.baseUrl + normalizePath(logicalPath);
  }

  private async fetchWithTimeout(url: string, init?: RequestInit): Promise<Response | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.httpMs);
    try {
      return await fetch(url, {
        ...init,
        headers: this.headersFor(url),
        signal: controller.signal,
        redirect: 'follow',
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async read(path: string): Promise<Asset | null> {
    const url = this.toUrl(path);
    const res = await this.fetchWithTimeout(url);
    if (!res || !res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    return {
      path: normalizePath(path),
      bytes,
      contentType: res.headers.get('content-type') ?? inferContentType(path),
    };
  }

  async exists(path: string): Promise<boolean> {
    const url = this.toUrl(path);
    const res = await this.fetchWithTimeout(url, { method: 'HEAD' });
    return !!res && res.ok;
  }

  async entryHtml(): Promise<Asset | null> {
    return this.read('/');
  }

  /**
   * Network-level reachability of the origin: null when it answers with any
   * HTTP status (a 404 or 5xx home page is something to check, not an
   * unreachable target), otherwise why it did not answer.
   */
  async unreachableReason(): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.httpMs);
    try {
      const res = await fetch(`${this.baseUrl}/`, {
        method: 'GET',
        headers: this.headers,
        signal: controller.signal,
        redirect: 'follow',
      });
      await res.body?.cancel();
      return null;
    } catch (err) {
      if (controller.signal.aborted) return `no answer within ${this.httpMs} ms`;
      const cause = (err as { cause?: { code?: string; message?: string } }).cause;
      return cause?.code ?? cause?.message ?? (err as Error).message;
    } finally {
      clearTimeout(timer);
    }
  }

  async list(): Promise<string[]> {
    return [];
  }
}
