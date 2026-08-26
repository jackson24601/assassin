import {
  MAX_MC_CHOICES,
  MIN_MC_CHOICES,
  MIN_TEAMS,
  MAX_TEAMS,
  createDefaultGame,
  createQuestionFromDraft,
  emptyMultipleChoiceDraft,
  emptyTrueFalseDraft,
  gameIsReady,
  parseGameData,
  questionToDraft,
  summarizeQuestion,
} from "./questions.js";
import { createGame } from "./api.js";
import { downloadJson, loadGame, saveGame } from "./storage.js";

const teamGrid = document.querySelector("#team-grid");
const checklist = document.querySelector("#checklist");
const questionList = document.querySelector("#question-list");
const addQuestionBtn = document.querySelector("#add-question");
const exportBtn = document.querySelector("#export-btn");
const importBtn = document.querySelector("#import-btn");
const importInput = document.querySelector("#import-input");
const editor = document.querySelector("#editor");
const editorTitle = document.querySelector("#editor-title");
const editorErrors = document.querySelector("#editor-errors");
const typeMc = document.querySelector("#type-mc");
const typeTf = document.querySelector("#type-tf");
const promptInput = document.querySelector("#prompt-input");
const mcFields = document.querySelector("#mc-fields");
const tfFields = document.querySelector("#tf-fields");
const choicesEl = document.querySelector("#choices");
const addChoiceBtn = document.querySelector("#add-choice");
const tfTrue = document.querySelector("#tf-true");
const tfFalse = document.querySelector("#tf-false");
const editorForm = document.querySelector("#editor-form");
const closeEditorBtn = document.querySelector("#close-editor");
const cancelEditorBtn = document.querySelector("#cancel-editor");
const createGameBtn =
  document.querySelector("#create-game") || document.querySelector(".questions-panel #start-game");
const leftoverStart = document.querySelector(".questions-panel #start-game");
if (leftoverStart && leftoverStart !== createGameBtn) leftoverStart.remove();
if (createGameBtn) {
  createGameBtn.id = "create-game";
  createGameBtn.textContent = "Create Game";
}
const createGameError = document.querySelector("#create-game-error");
const createGameHint = document.querySelector("#create-game-hint");

const LETTERS = "ABCDEF";

let game = restoreGame();
let draft = emptyMultipleChoiceDraft();
let editingId = null;
let creating = false;

function restoreGame() {
  const stored = loadGame(createDefaultGame);
  const parsed = parseGameData(stored);
  return parsed.ok ? parsed.game : createDefaultGame();
}

function persist() {
  saveGame(game);
  render();
}

function render() {
  renderTeams();
  renderChecklist();
  renderQuestions();
  renderCreateGame();
}

function renderCreateGame() {
  if (creating || !createGameBtn) return;
  const ready = gameIsReady(game);
  createGameBtn.disabled = !ready;
  createGameBtn.textContent = "Create Game";
  if (createGameHint) {
    createGameHint.textContent = ready
      ? "Click Create Game to generate a player URL you can send to your students."
      : "Add at least one question, then click Create Game to generate a URL you can send to your students.";
  }
}

function renderTeams() {
  teamGrid.innerHTML = "";
  for (let count = MIN_TEAMS; count <= MAX_TEAMS; count += 1) {
    const button = document.createElement("button");
    button.className = "team-btn";
    button.type = "button";
    button.textContent = String(count);
    button.setAttribute("aria-pressed", String(game.teamCount === count));
    button.setAttribute("aria-label", `${count} teams`);
    button.addEventListener("click", () => {
      game.teamCount = count;
      persist();
    });
    teamGrid.append(button);
  }
}

function renderChecklist() {
  const ready = gameIsReady(game);
  checklist.innerHTML = `
    <li><span>Teams</span><span class="pill ready">${game.teamCount} selected</span></li>
    <li>
      <span>Questions</span>
      <span class="pill ${ready ? "ready" : "wait"}">${game.questions.length} added</span>
    </li>
  `;
}

function renderQuestions() {
  if (game.questions.length === 0) {
    questionList.innerHTML = `
      <div class="empty">
        <h3>No questions yet</h3>
        <p class="hint">Add a multiple-choice item or a true/false statement, then mark the correct answer.</p>
      </div>
    `;
    return;
  }

  questionList.innerHTML = "";
  game.questions.forEach((question, index) => {
    const summary = summarizeQuestion(question);
    const card = document.createElement("article");
    card.className = "question-card";
    card.innerHTML = `
      <div class="index">${index + 1}</div>
      <div>
        <span class="badge ${question.type === "true_false" ? "tf" : "mc"}">${summary.typeLabel}</span>
        <p class="prompt"></p>
        <p class="meta">Correct: ${escapeHtml(summary.answerLabel)}</p>
      </div>
      <div class="card-actions">
        <button class="icon-btn" type="button" data-move="up" aria-label="Move up" ${index === 0 ? "disabled" : ""}>↑</button>
        <button class="icon-btn" type="button" data-move="down" aria-label="Move down" ${index === game.questions.length - 1 ? "disabled" : ""}>↓</button>
        <button class="icon-btn" type="button" data-edit aria-label="Edit">Edit</button>
        <button class="icon-btn" type="button" data-delete aria-label="Delete">Delete</button>
      </div>
    `;
    card.querySelector(".prompt").textContent = question.prompt;
    card.querySelector("[data-move='up']").addEventListener("click", () => moveQuestion(index, -1));
    card.querySelector("[data-move='down']").addEventListener("click", () => moveQuestion(index, 1));
    card.querySelector("[data-edit]").addEventListener("click", () => openEditor(question));
    card.querySelector("[data-delete]").addEventListener("click", () => deleteQuestion(question.id));
    questionList.append(card);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function moveQuestion(index, delta) {
  const next = index + delta;
  if (next < 0 || next >= game.questions.length) return;
  const copy = [...game.questions];
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item);
  game.questions = copy;
  persist();
}

function deleteQuestion(id) {
  game.questions = game.questions.filter((question) => question.id !== id);
  persist();
}

function openEditor(question) {
  editingId = question?.id ?? null;
  draft = question ? questionToDraft(question) : emptyMultipleChoiceDraft();
  editorTitle.textContent = question ? "Edit question" : "Add question";
  promptInput.value = draft.prompt;
  hideErrors();
  syncEditorType();
  renderChoices();
  syncTrueFalse();
  editor.showModal();
  promptInput.focus();
}

function syncEditorType() {
  const isTf = draft.type === "true_false";
  typeMc.setAttribute("aria-pressed", String(!isTf));
  typeTf.setAttribute("aria-pressed", String(isTf));
  mcFields.hidden = isTf;
  tfFields.hidden = !isTf;
}

function renderChoices() {
  choicesEl.innerHTML = "";
  draft.choices.forEach((choice, index) => {
    const row = document.createElement("div");
    row.className = "choice-row";
    row.innerHTML = `
      <input type="radio" name="correct-choice" aria-label="Mark choice ${LETTERS[index]} correct" />
      <input type="text" maxlength="180" placeholder="Choice ${LETTERS[index]}" />
      <button class="icon-btn" type="button" aria-label="Remove choice">✕</button>
    `;
    const radio = row.querySelector("input[type='radio']");
    const text = row.querySelector("input[type='text']");
    const remove = row.querySelector("button");
    radio.checked = draft.correctIndex === index;
    text.value = choice;
    radio.addEventListener("change", () => {
      draft.correctIndex = index;
    });
    text.addEventListener("input", () => {
      draft.choices[index] = text.value;
    });
    remove.disabled = draft.choices.length <= MIN_MC_CHOICES;
    remove.addEventListener("click", () => {
      if (draft.choices.length <= MIN_MC_CHOICES) return;
      draft.choices.splice(index, 1);
      if (draft.correctIndex === index) draft.correctIndex = null;
      else if (draft.correctIndex > index) draft.correctIndex -= 1;
      renderChoices();
    });
    choicesEl.append(row);
  });
  addChoiceBtn.hidden = draft.choices.length >= MAX_MC_CHOICES;
}

function syncTrueFalse() {
  tfTrue.setAttribute("aria-pressed", String(draft.correctAnswer === true));
  tfFalse.setAttribute("aria-pressed", String(draft.correctAnswer === false));
}

function setType(type) {
  const prompt = promptInput.value;
  draft = type === "true_false" ? emptyTrueFalseDraft() : emptyMultipleChoiceDraft();
  draft.prompt = prompt;
  promptInput.value = prompt;
  hideErrors();
  syncEditorType();
  renderChoices();
  syncTrueFalse();
}

function hideErrors() {
  editorErrors.hidden = true;
  editorErrors.className = "";
  editorErrors.textContent = "";
}

function showErrors(errors) {
  editorErrors.hidden = false;
  editorErrors.className = "errors";
  editorErrors.textContent = errors.join(" ");
}

function saveQuestion() {
  draft.prompt = promptInput.value;
  const result = createQuestionFromDraft(draft, editingId);
  if (!result.ok) {
    showErrors(result.errors);
    return;
  }

  if (editingId) {
    game.questions = game.questions.map((question) =>
      question.id === editingId ? result.question : question,
    );
  } else {
    game.questions.push(result.question);
  }

  persist();
  editor.close();
}

addQuestionBtn.addEventListener("click", () => openEditor(null));
typeMc.addEventListener("click", () => setType("multiple_choice"));
typeTf.addEventListener("click", () => setType("true_false"));
addChoiceBtn.addEventListener("click", () => {
  if (draft.choices.length >= MAX_MC_CHOICES) return;
  draft.choices.push("");
  renderChoices();
});
tfTrue.addEventListener("click", () => {
  draft.correctAnswer = true;
  syncTrueFalse();
});
tfFalse.addEventListener("click", () => {
  draft.correctAnswer = false;
  syncTrueFalse();
});
editorForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveQuestion();
});
closeEditorBtn.addEventListener("click", () => editor.close());
cancelEditorBtn.addEventListener("click", () => editor.close());
if (createGameBtn) {
  createGameBtn.addEventListener("click", async () => {
    if (!gameIsReady(game) || creating) return;
    creating = true;
    if (createGameError) {
      createGameError.hidden = true;
      createGameError.textContent = "";
    }
    createGameBtn.disabled = true;
    createGameBtn.textContent = "Creating game…";
    try {
      const created = await createGame(game);
      window.location.href = created.hostPath;
    } catch (error) {
      creating = false;
      if (createGameError) {
        createGameError.hidden = false;
        createGameError.textContent =
          error.message === "Failed to fetch"
            ? "Could not create the game. Run npm start so the class can join from a shared link."
            : error.message;
      }
      renderCreateGame();
    }
  });
}
exportBtn.addEventListener("click", () => {
  downloadJson("class-review-quiz.json", game);
});
importBtn.addEventListener("click", () => importInput.click());
importInput.addEventListener("change", async () => {
  const file = importInput.files?.[0];
  importInput.value = "";
  if (!file) return;
  try {
    const parsed = parseGameData(JSON.parse(await file.text()));
    if (!parsed.ok) {
      window.alert(parsed.errors.join("\n"));
      return;
    }
    game = parsed.game;
    persist();
  } catch {
    window.alert("That file could not be read as a quiz.");
  }
});

render();
