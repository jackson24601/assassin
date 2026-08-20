import { escapeHtml, fetchHostGame, gameCodeFromLocation, hostTokenFromLocation } from "./api.js";

const hostError = document.querySelector("#host-error");
const hostApp = document.querySelector("#host-app");
const joinCodeEl = document.querySelector("#join-code");
const playerUrlInput = document.querySelector("#player-url");
const copyLinkBtn = document.querySelector("#copy-link");
const copyStatus = document.querySelector("#copy-status");
const joinSummary = document.querySelector("#join-summary");
const roster = document.querySelector("#roster");

const code = gameCodeFromLocation();
const hostToken = hostTokenFromLocation();
let timer = null;

function showError(message) {
  hostError.hidden = false;
  hostError.textContent = message;
  hostApp.hidden = true;
}

function render(game) {
  hostError.hidden = true;
  hostApp.hidden = false;
  joinCodeEl.textContent = game.code;
  playerUrlInput.value = game.playerUrl;
  const joined = game.teams.reduce((sum, team) => sum + team.members.length, 0);
  joinSummary.textContent =
    joined === 0
      ? "Waiting for the first player."
      : `${joined} ${joined === 1 ? "player has" : "players have"} joined.`;

  roster.innerHTML = game.teams
    .map((team) => {
      const names =
        team.members.length === 0
          ? `<p class="hint">Waiting for players</p>`
          : `<ul class="member-list">${team.members
              .map((member) => `<li>${escapeHtml(member.name)}</li>`)
              .join("")}</ul>`;
      return `
        <article class="roster-card">
          <div class="roster-head">
            <h3>${escapeHtml(team.name)}</h3>
            <span class="pill ${team.members.length ? "ready" : "wait"}">${team.members.length} joined</span>
          </div>
          ${names}
        </article>
      `;
    })
    .join("");
}

async function refresh() {
  const game = await fetchHostGame(code, hostToken);
  render(game);
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

if (!code || !hostToken) {
  showError("Click Form Game on Teacher setup to get a unique player page.");
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
