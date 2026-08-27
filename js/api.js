export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function gameCodeFromLocation() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if ((parts[0] === "play" || parts[0] === "host") && parts[1]) {
    return parts[1].toUpperCase();
  }
  return (new URLSearchParams(window.location.search).get("g") || "").toUpperCase();
}

export function hostTokenFromLocation() {
  return new URLSearchParams(window.location.search).get("k") || "";
}

export function playerStorageKey(code) {
  return `assassin.player.${code}`;
}

export function loadPlayerJoin(code) {
  try {
    const raw = sessionStorage.getItem(playerStorageKey(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.playerId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePlayerJoin(code, join) {
  sessionStorage.setItem(playerStorageKey(code), JSON.stringify(join));
}

function helpForFailedRequest(status, text) {
  const snippet = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  const looksLikeHtml = /<!doctype html|<html|cannot (get|post|put)|method not allowed/i.test(
    text || "",
  );
  if (status === 404 || status === 405 || looksLikeHtml) {
    return "The game server did not handle that action. Run npm start and open http://127.0.0.1:4173 — do not open the HTML files directly.";
  }
  if (snippet) return snippet;
  return status ? `Request failed (${status}).` : "Something went wrong.";
}

export function apiOrigins() {
  const origins = [];
  const add = (value) => {
    if (!value || origins.includes(value)) return;
    origins.push(value);
  };
  if (typeof window !== "undefined" && /^https?:$/.test(window.location.protocol)) {
    add(window.location.origin);
  }
  add("http://127.0.0.1:4173");
  add("http://localhost:4173");
  return origins;
}

async function readJson(response) {
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      const error = new Error(helpForFailedRequest(response.status, text));
      error.status = response.status;
      throw error;
    }
  }
  if (!response.ok) {
    const error = new Error(data.error || helpForFailedRequest(response.status, text));
    error.status = response.status;
    error.fromApi = Boolean(data.error);
    throw error;
  }
  return data;
}

async function apiRequest(path, options = {}) {
  let lastError;
  for (const origin of apiOrigins()) {
    try {
      const data = await readJson(await fetch(`${origin}${path}`, options));
      data.apiOrigin = origin;
      return data;
    } catch (error) {
      lastError = error;
      if (error.fromApi) throw error;
    }
  }
  throw (
    lastError ||
    new Error("Could not reach the game server. Run npm start and open http://127.0.0.1:4173.")
  );
}

export async function findGameServer() {
  for (const origin of apiOrigins()) {
    try {
      const options = { headers: { accept: "application/json" } };
      if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
        options.signal = AbortSignal.timeout(1500);
      }
      const data = await readJson(await fetch(`${origin}/api/health`, options));
      if (data?.ok) return origin;
    } catch {
      // Try the next local game server.
    }
  }
  return null;
}

export async function createGame(quiz) {
  const created = await apiRequest("/api/games", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(quiz),
  });
  if (!created.hostUrl && created.hostPath && created.apiOrigin) {
    created.hostUrl = `${created.apiOrigin}${created.hostPath}`;
  }
  return created;
}

export async function fetchPublicGame(code, playerId) {
  const query = playerId ? `?playerId=${encodeURIComponent(playerId)}` : "";
  return apiRequest(`/api/games/${encodeURIComponent(code)}${query}`);
}

export async function fetchHostGame(code, hostToken) {
  return apiRequest(
    `/api/games/${encodeURIComponent(code)}/host?k=${encodeURIComponent(hostToken)}`,
  );
}

export async function beginHostGame(code, hostToken) {
  const path = `/api/games/${encodeURIComponent(code)}/begin?k=${encodeURIComponent(hostToken)}`;
  const post = {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: "{}",
  };
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    post.signal = AbortSignal.timeout(6000);
  }
  try {
    return await apiRequest(path, post);
  } catch (error) {
    if (error.fromApi) throw error;
    return apiRequest(path, {
      method: "GET",
      headers: { accept: "application/json" },
    });
  }
}

export async function joinGame(code, body) {
  return apiRequest(`/api/games/${encodeURIComponent(code)}/join`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function submitAnswer(code, body) {
  return apiRequest(`/api/games/${encodeURIComponent(code)}/answer`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
