import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createQuestionFromDraft,
  emptyMultipleChoiceDraft,
  emptyTrueFalseDraft,
  gameIsReady,
  parseGameData,
  validateDraft,
} from "../js/questions.js";

test("multiple choice requires a prompt, two choices, and a correct answer", () => {
  const draft = emptyMultipleChoiceDraft();
  const empty = validateDraft(draft);
  assert.equal(empty.ok, false);
  assert.match(empty.errors.join(" "), /question/i);

  draft.prompt = "Which river runs through Egypt?";
  draft.choices = ["Nile", "", "Amazon", ""];
  const missingCorrect = validateDraft(draft);
  assert.equal(missingCorrect.ok, false);
  assert.match(missingCorrect.errors.join(" "), /correct/i);

  draft.correctIndex = 0;
  const saved = createQuestionFromDraft(draft);
  assert.equal(saved.ok, true);
  assert.deepEqual(saved.question.choices, ["Nile", "Amazon"]);
  assert.equal(saved.question.correctIndex, 0);
});

test("true/false requires a selected correct answer", () => {
  const draft = emptyTrueFalseDraft();
  draft.prompt = "The Roman Republic came before the Roman Empire.";
  const missing = validateDraft(draft);
  assert.equal(missing.ok, false);

  draft.correctAnswer = true;
  const saved = createQuestionFromDraft(draft);
  assert.equal(saved.ok, true);
  assert.equal(saved.question.type, "true_false");
  assert.equal(saved.question.correctAnswer, true);
});

test("game data import keeps valid questions and team counts", () => {
  const parsed = parseGameData({
    teamCount: 6,
    questions: [
      {
        type: "multiple_choice",
        prompt: "Who wrote The Republic?",
        choices: ["Plato", "Homer", "Virgil"],
        correctIndex: 0,
      },
      {
        type: "true_false",
        prompt: "Athens was a democracy.",
        correctAnswer: true,
      },
    ],
  });

  assert.equal(parsed.ok, true);
  assert.equal(parsed.game.teamCount, 6);
  assert.equal(parsed.game.questions.length, 2);
  assert.equal(gameIsReady(parsed.game), true);
});

test("invalid import files are rejected", () => {
  const parsed = parseGameData({ questions: [{ type: "multiple_choice", prompt: "" }] });
  assert.equal(parsed.ok, false);
});
