import {
  escapeHtml,
  fetchPublicGame,
  gameCodeFromLocation,
  joinGame,
  loadPlayerJoin,
  savePlayerJoin,
  submitAnswer,
} from "./api.js";

const playerError = document.querySelector("#player-error");
const joinPanel = document.querySelector("#join-panel");
const beginMsg = document.querySelector("#begin-msg");
const questionPanel = document.querySelector("#question-panel");
const donePanel = document.querySelector("#done-panel");
const joinForm = document.querySelector("#join-form");
const playerNameInput = document.querySelector("#player-name");
const teamPicks = document.querySelector("#team-picks");
const joinErrors = document.querySelector("#join-errors");
const questionProgress = document.querySelector("#question-progress");
const questionPrompt = document.querySelector("#question-prompt");
const answerChoices = document.querySelector("#answer-choices");
const answerFeedback = document.querySelector("#answer-feedback");
const scoreLine = document.querySelector("#score-line");
const finalScore = document.querySelector("#final-score");

const code = gameCodeFromLocation();
let game = null;
let selectedTeamId = null;
let joined = loadPlayerJoin(code);
let timer = null;
let displayedQuestionId = null;
let answering = false;
let applyId = 0;
let liveStarted = false;

function hidePlaySurfaces() {
  joinPanel.hidden = true;
  beginMsg.hidden = true;
  questionPanel.hidden = true;
  donePanel.hidden = true;
}

function showFatal(message) {
  playerError.hidden = false;
  playerError.textContent = message;
  hidePlaySurfaces();
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

function setScoreText(score, teamScore) {
  const teamBit = Number.isFinite(teamScore) ? ` · Team ${teamScore}` : "";
  const text = `Score: ${score}${teamBit}`;
  scoreLine.textContent = text;
  finalScore.textContent = text;
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

function renderWaiting() {
  document.body.classList.remove("is-playing");
  hidePlaySurfaces();
  beginMsg.hidden = false;
}

function renderJoin() {
  document.body.classList.remove("is-playing");
  hidePlaySurfaces();
  joinPanel.hidden = false;
  if (joined?.playerName) playerNameInput.value = joined.playerName;
  if (joined?.teamId) selectedTeamId = joined.teamId;
  if (selectedTeamId == null) selectedTeamId = game.teams[0]?.id ?? null;
  renderTeamPicks();
}

function renderChoices(question) {
  answerChoices.innerHTML = "";
  answerFeedback.hidden = true;
  answering = false;

  if (question.type === "true_false") {
    [
      { label: "True", answer: true },
      { label: "False", answer: false },
    ].forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "answer-btn";
      button.textContent = option.label;
      button.addEventListener("click", () => sendAnswer({ answer: option.answer }));
      answerChoices.append(button);
    });
    return;
  }

  question.choices.forEach((choice, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "answer-btn";
    button.textContent = `${String.fromCharCode(65 + index)}. ${choice}`;
    button.addEventListener("click", () => sendAnswer({ choiceIndex: index }));
    answerChoices.append(button);
  });
}

function renderQuestion() {
  document.body.classList.add("is-playing");
  hidePlaySurfaces();
  questionPanel.hidden = false;
  const question = game.question;
  questionProgress.textContent = `Question ${question.number} of ${question.total}`;
  questionPrompt.textContent = question.prompt;
  setScoreText(game.you?.score ?? 0, game.you?.teamScore);
  if (displayedQuestionId !== question.id) {
    displayedQuestionId = question.id;
    renderChoices(question);
  }
}

function renderDone() {
  document.body.classList.add("is-playing");
  hidePlaySurfaces();
  donePanel.hidden = false;
  setScoreText(game.you?.score ?? 0, game.you?.teamScore);
}

function applyGame(next) {
  if (liveStarted && next.status === "lobby") return;
  if (next.status && next.status !== "lobby") liveStarted = true;
  game = next;
  if (joined?.playerId && !currentMembership()) {
    joined = null;
  }
  render();
}

function render() {
  playerError.hidden = true;
  if (!currentMembership()) {
    displayedQuestionId = null;
    renderJoin();
    return;
  }
  if (game.status === "lobby") {
    displayedQuestionId = null;
    renderWaiting();
    return;
  }
  if (game.question) {
    renderQuestion();
    return;
  }
  renderDone();
}

async function refresh() {
  const id = ++applyId;
  const next = await fetchPublicGame(code, joined?.playerId);
  if (id !== applyId) return;
  applyGame(next);
}

async function sendAnswer(payload) {
  if (answering || !game?.question || !joined?.playerId) return;
  answering = true;
  for (const button of answerChoices.querySelectorAll("button")) button.disabled = true;
  try {
    const result = await submitAnswer(code, {
      playerId: joined.playerId,
      questionId: game.question.id,
      ...payload,
    });
    answerFeedback.hidden = false;
    answerFeedback.className = `answer-feedback ${result.correct ? "good" : "bad"}`;
    answerFeedback.textContent = result.correct ? "Correct. +1" : "Wrong. -1";
    game = result.game;
    liveStarted = true;
    setScoreText(result.score, game.you?.teamScore);
    window.setTimeout(() => {
      displayedQuestionId = null;
      answering = false;
      render();
    }, 900);
  } catch (error) {
    answering = false;
    for (const button of answerChoices.querySelectorAll("button")) button.disabled = false;
    answerFeedback.hidden = false;
    answerFeedback.className = "answer-feedback bad";
    answerFeedback.textContent = error.message;
  }
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
    applyGame(result.game);
  } catch (error) {
    showJoinError(error.message);
  }
});

if (!code) {
  showFatal("This player page is missing a game code. Ask your teacher for the link.");
} else {
  refresh()
    .then(() => {
      timer = window.setInterval(() => {
        if (answering) return;
        refresh().catch((error) => showFatal(error.message));
      }, 1500);
    })
    .catch((error) => showFatal(error.message));
}

window.addEventListener("beforeunload", () => {
  if (timer) window.clearInterval(timer);
});
