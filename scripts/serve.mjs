import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { createServer } from "node:http";

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const root = resolve(process.cwd());

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

function toSafePath(urlPathname) {
  const decoded = decodeURIComponent(urlPathname.split("?")[0] || "/");
  const trimmed = decoded.replace(/^\/+/, "");
  const normalizedPath = normalize(trimmed);
  const absolutePath = resolve(root, normalizedPath);
  if (!absolutePath.startsWith(root)) {
    return null;
  }
  return absolutePath;
}

function resolveFilePath(urlPathname) {
  if (urlPathname === "/" || urlPathname === "") {
    return join(root, "demos", "index.html");
  }

  const requestedPath = toSafePath(urlPathname);
  if (!requestedPath) {
    return null;
  }

  let resolvedPath = requestedPath;
  if (!existsSync(resolvedPath)) {
    const trimmed = decodeURIComponent(urlPathname.split("?")[0] || "").replace(/^\/+/, "");
    const demoPath = resolve(root, "demos", normalize(trimmed));
    if (!demoPath.startsWith(join(root, "demos")) || !existsSync(demoPath)) {
      return null;
    }
    resolvedPath = demoPath;
  }

  const stats = statSync(resolvedPath);
  if (stats.isDirectory()) {
    const indexPath = join(resolvedPath, "index.html");
    return existsSync(indexPath) ? indexPath : null;
  }

  return resolvedPath;
}

function sendNotFound(response) {
  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not found");
}

function sendError(response, error) {
  response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(error instanceof Error ? error.message : "Internal server error");
}

const server = createServer((request, response) => {
  try {
    const filePath = resolveFilePath(request.url || "/");
    if (!filePath) {
      sendNotFound(response);
      return;
    }

    const extension = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[extension] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": contentType });
    createReadStream(filePath).pipe(response);
  } catch (error) {
    sendError(response, error);
  }
});

server.listen(port, host, () => {
  console.log(`layoutmaster demos at http://${host}:${port}/`);
  console.log(`open http://${host}:${port}/demos/`);
});
