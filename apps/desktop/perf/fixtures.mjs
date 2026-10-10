import { createServer } from 'node:http';
import { URL } from 'node:url';

/** Minimal copy of the e2e fixture server: deterministic `/page/<name>` documents, no network. */
export function startFixtureServer() {
  const server = createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    if (u.pathname.startsWith('/page/')) {
      const name = decodeURIComponent(u.pathname.slice(6));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        `<!doctype html><html><head><title>${name}</title></head>` +
          `<body style="font-family:sans-serif;padding:40px"><h1 data-testid="heading">${name}</h1>` +
          `<p>${'lorem ipsum '.repeat(400)}</p></body></html>`,
      );
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}
