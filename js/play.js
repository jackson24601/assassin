import {
  escapeHtml,
  fetchPublicGame,
  gameCodeFromLocation,
  joinGame,
  loadPlayerJoin,
  savePlayerJoin,
} from "./api.js";

const playerError = document.querySelector("#player-error");
const playerLede = document.querySelector("#player-lede");
const joinPanel = document.querySelector("#join-panel");
const waitingPanel = document.querySelector("#waiting-panel");
const joinForm = document.querySelector("#join-form");
const playerNameInput = document.querySelector("#player-name");
const teamPicks = document.querySelector("#team-picks");
const joinErrors = document.querySelector("#join-errors");
const waitingTeam = document.querySelector("#waiting-team");
const teammates = document.querySelector("#teammates");
const changeTeamBtn = document.querySelector("#change-team");

const code = gameCodeFromLocation();
let game = null;
let selectedTeamId = null;
let joined = loadPlayerJoin(code);
let pickingTeam = false;
let timer = null;

function showFatal(message) {
  playerError.hidden = false;
  playerError.textContent = message;
  joinPanel.hidden = true;
  waitingPanel.hidden = true;
}

function hideJoinError() {
  joinErrors.hidden = true;
  joinErrors.textContent = "";
}

function showJoinError(message) {
  joinErrors.hidden = false;
  joinErrors.textContent = message;
}

function currentMembership() {
  if (!game || !joined?.playerId) return null;
  for (const team of game.teams) {
    if (team.members.some((member) => member.id === joined.playerId)) {
      return team;
    }
  }
  return null;
}

function renderTeamPicks() {
  teamPicks.innerHTML = "";
  game.teams.forEach((team) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "team-pick";
    button.setAttribute("aria-pressed", String(selectedTeamId === team.id));
    button.innerHTML = `
      <strong>${escapeHtml(team.name)}</strong>
      <span>${team.members.length} joined</span>
    `;
    button.addEventListener("click", () => {
      selectedTeamId = team.id;
      renderTeamPicks();
    });
    teamPicks.append(button);
  });
}

function renderWaiting(team) {
  joinPanel.hidden = true;
  waitingPanel.hidden = false;
  playerLede.textContent = "Stay on this page. Your teacher will start the round from the lobby.";
  waitingTeam.textContent = team.name;
  const others = team.members.filter((member) => member.id !== joined.playerId).map((member) => member.name);
  teammates.textContent = others.length
    ? `With you: ${others.join(", ")}`
    : "You're the first one on this team.";
}

function renderJoin() {
  waitingPanel.hidden = true;
  joinPanel.hidden = false;
  playerLede.textContent = `Game ${game.code}. Enter your name and pick a team.`;
  if (joined?.playerName) playerNameInput.value = joined.playerName;
  if (joined?.teamId) selectedTeamId = joined.teamId;
  if (selectedTeamId == null) selectedTeamId = game.teams[0]?.id ?? null;
  renderTeamPicks();
}

function render() {
  playerError.hidden = true;
  const team = currentMembership();
  if (team && !pickingTeam) renderWaiting(team);
  else renderJoin();
}

async function refresh() {
  game = await fetchPublicGame(code);
  if (joined?.playerId && !currentMembership()) {
    joined = null;
  }
  render();
}

joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideJoinError();
  if (!selectedTeamId) {
    showJoinError("Pick a team.");
    return;
  }
  try {
    const result = await joinGame(code, {
      teamId: selectedTeamId,
      playerName: playerNameInput.value,
      playerId: joined?.playerId,
    });
    joined = {
      playerId: result.playerId,
      teamId: result.teamId,
      playerName: result.playerName,
    };
    savePlayerJoin(code, joined);
    game = result.game;
    pickingTeam = false;
    render();
  } catch (error) {
    showJoinError(error.message);
  }
});

changeTeamBtn.addEventListener("click", () => {
  pickingTeam = true;
  selectedTeamId = joined?.teamId ?? selectedTeamId;
  renderJoin();
});

if (!code) {
  showFatal("This player page is missing a game code. Ask your teacher for the link.");
} else {
  refresh()
    .then(() => {
      timer = window.setInterval(() => {
        refresh().catch((error) => showFatal(error.message));
      }, 2000);
    })
    .catch((error) => showFatal(error.message));
}

window.addEventListener("beforeunload", () => {
  if (timer) window.clearInterval(timer);
});
