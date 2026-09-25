// Serves public/ for the smoke tests, with js/firebase.js swapped for the in-memory fake.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../public/', import.meta.url));
const fake = fileURLToPath(new URL('./fake-firebase.js', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const port = Number(process.env.PORT || 4173);
createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path === '/js/firebase.js' ? fake : join(root, normalize(path === '/' ? '/index.html' : path));
  if (!file.startsWith(root) && file !== fake) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  } catch { res.writeHead(404).end('not found'); }
}).listen(port, '127.0.0.1', () => console.log(`smoke server on http://127.0.0.1:${port}`));
