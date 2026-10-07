import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { repositoryRoot, inside } from './lib/package-utils.mjs';

const port = Number(process.env.PREVIEW_PORT || 8766);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png' };
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname.split('/').some(part => part.startsWith('.') || ['node_modules', 'build', '_metadata', 'xcode', 'xcode-v1'].includes(part))) throw Error('Private path');
    const file = inside(repositoryRoot, pathname === '/' ? 'tests/popup-preview.html' : pathname.slice(1));
    if (!(await stat(file)).isFile()) throw Error('Not a file');
    response.setHeader('Content-Type', types[extname(file)] || 'text/plain; charset=utf-8');
    response.end(await readFile(file));
  } catch { response.writeHead(404); response.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Local preview: http://127.0.0.1:${port}/tests/popup-preview.html?lang=pt-BR`));
