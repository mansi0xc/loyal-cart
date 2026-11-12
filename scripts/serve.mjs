import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.cwd());
const port = Number(process.env.PORT ?? 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".wasm": "application/wasm",
};

createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${port}`);
  const requested = url.pathname === "/" ? "/packages/web/index.html" : url.pathname;
  const path = resolve(join(root, normalize(requested)));
  if (!path.startsWith(root)) {
    response.writeHead(403).end("forbidden");
    return;
  }
  try {
    statSync(path);
  } catch {
    response.writeHead(404).end("not found");
    return;
  }
  response.writeHead(200, {
    "content-type": types[extname(path)] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(path).pipe(response);
}).listen(port, () => {
  console.log(`Loyal Cart UI: http://localhost:${port}`);
});
