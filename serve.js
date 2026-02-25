import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { join, extname } from 'path';

const PORT = 5000;
const ROOT = new URL('.', import.meta.url).pathname;

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  let path = req.url.split('?')[0];
  if (path === '/') path = '/index.html';

  const filePath = join(ROOT, path);
  try {
    await stat(filePath);
    const data = await readFile(filePath);
    const ext = extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Static server running at http://0.0.0.0:${PORT}`);
});
