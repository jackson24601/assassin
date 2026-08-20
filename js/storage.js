const STORAGE_KEY = "assassin.teacher-setup.v1";

export function loadGame(fallbackFactory) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallbackFactory();
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallbackFactory();
  } catch {
    return fallbackFactory();
  }
}

export function saveGame(game) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
