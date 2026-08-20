import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createGameSession,
  createHostToken,
  isValidJoinCode,
  joinTeam,
  normalizeJoinCode,
  publicGameView,
  unusedJoinCode,
} from "./lib/session.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number.parseInt(process.env.PORT ?? "4173", 10);
const TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

export function createGameStore() {
  return new Map();
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    connection: "close",
  });
  res.end(JSON.stringify(body));
}

function sendError(res, status, error) {
  sendJson(res, status, { error });
}

async function readJson(req, limit = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error("That quiz is too large to start.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request was not valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

function requestOrigin(req) {
  const host = req.headers.host || `localhost:${PORT}`;
  const proto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
  return `${proto}://${host}`;
}

function safeStaticPath(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  if (decoded.includes("\0")) return null;
  const relative = decoded.replace(/^\/+/, "");
  if (!/^(css|js|images)\/[A-Za-z0-9._-]+$/.test(relative)) return null;
  const full = path.resolve(ROOT, relative);
  const folder = relative.split("/")[0];
  const parent = path.resolve(ROOT, folder);
  if (!full.startsWith(parent + path.sep)) return null;
  return full;
}

function sendFile(res, filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8", connection: "close" });
    res.end("Not found");
    return;
  }
  const ext = path.extname(filePath);
  res.writeHead(200, {
    "content-type": TYPES[ext] || "application/octet-stream",
    connection: "close",
  });
  res.end(fs.readFileSync(filePath));
}

function getSession(store, code) {
  const normalized = normalizeJoinCode(code);
  if (!isValidJoinCode(normalized)) return null;
  return store.get(normalized) ?? null;
}

function hostTokenFrom(req, url) {
  return url.searchParams.get("k") || req.headers["x-host-token"] || "";
}

async function handleApi(req, res, url, store) {
  if (req.method === "POST" && url.pathname === "/api/games") {
    const quiz = await readJson(req);
    const code = unusedJoinCode(store);
    const hostToken = createHostToken();
    const created = createGameSession({ quiz, code, hostToken });
    if (!created.ok) {
      sendError(res, 400, created.errors.join(" "));
      return;
    }
    store.set(code, created.session);
    const origin = requestOrigin(req);
    sendJson(res, 201, {
      code,
      hostToken,
      playerPath: `/play/${code}`,
      hostPath: `/host/${code}?k=${hostToken}`,
      playerUrl: `${origin}/play/${code}`,
      hostUrl: `${origin}/host/${code}?k=${encodeURIComponent(hostToken)}`,
    });
    return;
  }

  const publicMatch = url.pathname.match(/^\/api\/games\/([^/]+)$/);
  if (req.method === "GET" && publicMatch) {
    const session = getSession(store, publicMatch[1]);
    if (!session) {
      sendError(res, 404, "This game was not found. Ask your teacher for a new link.");
      return;
    }
    sendJson(res, 200, publicGameView(session));
    return;
  }

  const hostMatch = url.pathname.match(/^\/api\/games\/([^/]+)\/host$/);
  if (req.method === "GET" && hostMatch) {
    const session = getSession(store, hostMatch[1]);
    if (!session) {
      sendError(res, 404, "This game was not found.");
      return;
    }
    if (hostTokenFrom(req, url) !== session.hostToken) {
      sendError(res, 401, "Open this lobby from Teacher setup after clicking Form Game.");
      return;
    }
    sendJson(res, 200, {
      ...publicGameView(session),
      playerPath: `/play/${session.code}`,
      playerUrl: `${requestOrigin(req)}/play/${session.code}`,
    });
    return;
  }

  const joinMatch = url.pathname.match(/^\/api\/games\/([^/]+)\/join$/);
  if (req.method === "POST" && joinMatch) {
    const session = getSession(store, joinMatch[1]);
    if (!session) {
      sendError(res, 404, "This game was not found. Ask your teacher for a new link.");
      return;
    }
    const body = await readJson(req);
    const joined = joinTeam(session, body);
    if (!joined.ok) {
      sendError(res, 400, joined.errors.join(" "));
      return;
    }
    sendJson(res, 200, {
      playerId: joined.playerId,
      teamId: joined.teamId,
      playerName: joined.playerName,
      game: publicGameView(session),
    });
    return;
  }

  sendError(res, 404, "Not found");
}

export function createServer({ store = createGameStore() } = {}) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);

      if (url.pathname.startsWith("/api/")) {
        await handleApi(req, res, url, store);
        return;
      }

      if (req.method !== "GET") {
        res.writeHead(405, { allow: "GET", connection: "close" });
        res.end("Method not allowed");
        return;
      }

      if (url.pathname === "/" || url.pathname === "/index.html") {
        sendFile(res, path.join(ROOT, "index.html"));
        return;
      }

      if (/^\/play\/[A-Za-z0-9]+$/.test(url.pathname) || url.pathname === "/play.html") {
        sendFile(res, path.join(ROOT, "play.html"));
        return;
      }

      if (/^\/host\/[A-Za-z0-9]+$/.test(url.pathname) || url.pathname === "/host.html") {
        sendFile(res, path.join(ROOT, "host.html"));
        return;
      }

      const staticPath = safeStaticPath(url.pathname);
      if (staticPath) {
        sendFile(res, staticPath);
        return;
      }

      res.writeHead(404, { "content-type": "text/plain; charset=utf-8", connection: "close" });
      res.end("Not found");
    } catch (error) {
      sendError(res, error.statusCode || 500, error.message || "Something went wrong.");
    }
  });
}

export function listen(server, port = PORT, host = "0.0.0.0") {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      resolve(server.address().port);
    });
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const server = createServer();
  listen(server).then((port) => {
    console.log(`Class Review is running at http://localhost:${port}`);
  });
}
