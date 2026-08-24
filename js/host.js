import { beginHostGame, escapeHtml, fetchHostGame, gameCodeFromLocation, hostTokenFromLocation } from "./api.js";

const hostError = document.querySelector("#host-error");
const hostApp = document.querySelector("#host-app");
const joinCodeEl = document.querySelector("#join-code");
const playerUrlInput = document.querySelector("#player-url");
const copyLinkBtn = document.querySelector("#copy-link");
const copyStatus = document.querySelector("#copy-status");
const joinSummary = document.querySelector("#join-summary");
const roster = document.querySelector("#roster");
const startGameBtn = document.querySelector("#start-game");
const startHint = document.querySelector("#start-hint");
const startError = document.querySelector("#start-error");
const rosterTitle = document.querySelector("#host-app .questions-head h2");

const code = gameCodeFromLocation();
const hostToken = hostTokenFromLocation();
let timer = null;
let starting = false;
let applyId = 0;
let liveStarted = false;

function showError(message) {
  hostError.hidden = false;
  hostError.textContent = message;
  hostApp.hidden = true;
}

function showStartError(message) {
  startError.hidden = !message;
  startError.textContent = message || "";
}

function startErrorMessage(error) {
  const message = error?.message || "Something went wrong.";
  if (/failed to fetch|networkerror|abort|timeout/i.test(message)) {
    return "Could not reach the game server. Run npm start and open http://127.0.0.1:4173.";
  }
  return message;
}

function applyGame(game) {
  if (liveStarted && game.status === "lobby") return;
  if (game.status === "playing") liveStarted = true;
  render(game);
}

function render(game) {
  hostError.hidden = true;
  hostApp.hidden = false;
  joinCodeEl.textContent = game.code;
  playerUrlInput.value = game.playerUrl;
  const joinedCount = game.teams.reduce((sum, team) => sum + team.members.length, 0);
  const live = game.status !== "lobby";
  const members = game.teams.flatMap((team) => team.members);
  const allDone =
    live &&
    members.length > 0 &&
    members.every((member) => (member.progress ?? 0) >= game.questionCount);

  if (!live) {
    rosterTitle.textContent = "Teams joining";
    joinSummary.textContent =
      joinedCount === 0
        ? "Waiting for the first player."
        : `${joinedCount} ${joinedCount === 1 ? "player has" : "players have"} joined.`;
    startGameBtn.hidden = false;
    startGameBtn.disabled = starting;
    startGameBtn.textContent = starting ? "Starting…" : "Start Game";
    startHint.hidden = false;
  } else {
    rosterTitle.textContent = allDone ? "Final scores" : "Live scores";
    joinSummary.textContent = allDone
      ? "Every player has finished the round."
      : "Questions are on student screens in random order.";
    startGameBtn.hidden = true;
    startHint.hidden = true;
    showStartError("");
  }

  roster.innerHTML = game.teams
    .map((team) => {
      const names =
        team.members.length === 0
          ? `<p class="hint">Waiting for players</p>`
          : `<ul class="member-list">${team.members
              .map((member) => {
                const extra = live ? ` · ${member.score} pts` : "";
                return `<li>${escapeHtml(member.name)}${extra}</li>`;
              })
              .join("")}</ul>`;
      const pill = live
        ? `<span class="pill ready">${team.score} pts</span>`
        : `<span class="pill ${team.members.length ? "ready" : "wait"}">${team.members.length} joined</span>`;
      return `
        <article class="roster-card">
          <div class="roster-head">
            <h3>${escapeHtml(team.name)}</h3>
            ${pill}
          </div>
          ${names}
        </article>
      `;
    })
    .join("");
}

async function refresh() {
  const id = ++applyId;
  const game = await fetchHostGame(code, hostToken);
  if (id !== applyId) return;
  applyGame(game);
}

copyLinkBtn.addEventListener("click", async () => {
  const url = playerUrlInput.value;
  try {
    await navigator.clipboard.writeText(url);
    copyStatus.textContent = "Link copied. Send it to your teams.";
  } catch {
    playerUrlInput.select();
    copyStatus.textContent = "Copy the highlighted address and send it to your teams.";
  }
});

playerUrlInput.addEventListener("click", () => playerUrlInput.select());

startGameBtn.addEventListener("click", async () => {
  if (starting) return;
  starting = true;
  startGameBtn.disabled = true;
  startGameBtn.textContent = "Starting…";
  showStartError("");
  const id = ++applyId;
  try {
    const game = await beginHostGame(code, hostToken);
    starting = false;
    if (id !== applyId) return;
    applyGame(game);
  } catch (error) {
    starting = false;
    startGameBtn.disabled = false;
    startGameBtn.textContent = "Start Game";
    showStartError(startErrorMessage(error));
  }
});

if (!code || !hostToken) {
  showError("Click Create Game on Teacher setup to get a unique player page.");
} else {
  refresh()
    .then(() => {
      timer = window.setInterval(() => {
        refresh().catch((error) => showError(error.message));
      }, 2000);
    })
    .catch((error) => showError(error.message));
}

window.addEventListener("beforeunload", () => {
  if (timer) window.clearInterval(timer);
});
