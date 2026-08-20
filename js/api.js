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

async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Something went wrong.");
  }
  return data;
}

export async function createGame(quiz) {
  return readJson(
    await fetch("/api/games", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(quiz),
    }),
  );
}

export async function fetchPublicGame(code, playerId) {
  const query = playerId ? `?playerId=${encodeURIComponent(playerId)}` : "";
  return readJson(await fetch(`/api/games/${encodeURIComponent(code)}${query}`));
}

export async function fetchHostGame(code, hostToken) {
  return readJson(
    await fetch(`/api/games/${encodeURIComponent(code)}/host?k=${encodeURIComponent(hostToken)}`),
  );
}

export async function beginHostGame(code, hostToken) {
  return readJson(
    await fetch(`/api/games/${encodeURIComponent(code)}/begin?k=${encodeURIComponent(hostToken)}`, {
      method: "POST",
    }),
  );
}

export async function joinGame(code, body) {
  return readJson(
    await fetch(`/api/games/${encodeURIComponent(code)}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function submitAnswer(code, body) {
  return readJson(
    await fetch(`/api/games/${encodeURIComponent(code)}/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}
