// Minimal static file server for live-mode fixtures (tests only).

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { type Server, createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

export interface StaticServer {
  url: string;
  close(): Promise<void>;
}

/** Serve `root` over HTTP on an ephemeral port. SPA-style index fallback. */
export async function startStaticServer(root: string): Promise<StaticServer> {
  const server: Server = createServer(async (req, res) => {
    const rawPath = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
    let rel = normalize(rawPath).replace(/^(\.\.[/\\])+/, '');
    if (rel.endsWith('/')) rel += 'index.html';
    let file = join(root, rel);
    try {
      const s = await stat(file);
      if (!s.isFile()) throw new Error('not a file');
    } catch {
      // Fallback to index.html (SPA) only for extension-less requests.
      if (extname(rel) === '') {
        file = join(root, 'index.html');
      } else {
        res.statusCode = 404;
        res.end('not found');
        return;
      }
    }
    res.setHeader('content-type', TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
    createReadStream(file).pipe(res);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
