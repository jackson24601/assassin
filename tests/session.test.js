import assert from "node:assert/strict";
import { test } from "node:test";
import {
  beginGame,
  createGameSession,
  createHostToken,
  createJoinCode,
  isValidJoinCode,
  joinTeam,
  publicGameView,
  shuffledCopy,
  submitAnswer,
} from "../lib/session.js";

const quiz = {
  teamCount: 3,
  questions: [
    {
      type: "true_false",
      prompt: "The Nile is in Africa.",
      correctAnswer: true,
    },
    {
      type: "multiple_choice",
      prompt: "Who wrote The Republic?",
      choices: ["Plato", "Homer"],
      correctIndex: 0,
    },
  ],
};

test("join codes are short and unambiguous", () => {
  const code = createJoinCode();
  assert.equal(isValidJoinCode(code), true);
  assert.equal(code.includes("O"), false);
  assert.equal(code.includes("I"), false);
});

test("a ready quiz becomes a lobby with named teams", () => {
  const created = createGameSession({
    quiz,
    code: "AB2345",
    hostToken: createHostToken(),
  });
  assert.equal(created.ok, true);
  assert.equal(created.session.teams.length, 3);
  assert.equal(created.session.teams[0].name, "Team 1");
  assert.equal(created.session.status, "lobby");
});

test("the public player view hides answers and the host token", () => {
  const created = createGameSession({
    quiz,
    code: "AB2345",
    hostToken: "secret-token",
  });
  const view = publicGameView(created.session);
  assert.equal("questions" in view, false);
  assert.equal("hostToken" in view, false);
  assert.equal(JSON.stringify(view).includes("secret-token"), false);
  assert.equal(JSON.stringify(view).includes("correctIndex"), false);
  assert.equal(JSON.stringify(view).includes("correctAnswer"), false);
  assert.equal(view.questionCount, 2);
});

test("players can join and later switch teams", () => {
  const created = createGameSession({
    quiz,
    code: "AB2345",
    hostToken: createHostToken(),
  });
  const first = joinTeam(created.session, { teamId: 2, playerName: "Maya" });
  assert.equal(first.ok, true);
  assert.equal(created.session.teams[1].members[0].name, "Maya");

  const moved = joinTeam(created.session, {
    teamId: 1,
    playerName: "Maya",
    playerId: first.playerId,
  });
  assert.equal(moved.ok, true);
  assert.equal(moved.playerId, first.playerId);
  assert.equal(created.session.teams[1].members.length, 0);
  assert.equal(created.session.teams[0].members[0].name, "Maya");
});

test("joining requires a name and a real team", () => {
  const created = createGameSession({
    quiz,
    code: "AB2345",
    hostToken: createHostToken(),
  });
  const missingName = joinTeam(created.session, { teamId: 1, playerName: "  " });
  assert.equal(missingName.ok, false);
  const missingTeam = joinTeam(created.session, { teamId: 99, playerName: "Jordan" });
  assert.equal(missingTeam.ok, false);
});

test("a shuffled order keeps every question exactly once", () => {
  const ids = ["q1", "q2", "q3", "q4"];
  const shuffled = shuffledCopy(ids, () => 0);
  assert.deepEqual([...shuffled].sort(), ids);
  assert.notDeepEqual(shuffled, ids);
});

test("begin game shuffles questions and scores +1 / -1", () => {
  const created = createGameSession({
    quiz,
    code: "AB2345",
    hostToken: createHostToken(),
  });
  const joined = joinTeam(created.session, { teamId: 1, playerName: "Maya" });
  const started = beginGame(created.session, { pick: () => 0 });
  assert.equal(started.ok, true);
  assert.equal(created.session.status, "playing");
  assert.equal(created.session.questionOrder.length, 2);

  const firstId = created.session.questionOrder[0];
  const firstQuestion = created.session.questions.find((question) => question.id === firstId);
  const firstPayload =
    firstQuestion.type === "true_false"
      ? { answer: firstQuestion.correctAnswer }
      : { choiceIndex: firstQuestion.correctIndex };
  const right = submitAnswer(created.session, {
    playerId: joined.playerId,
    questionId: firstId,
    ...firstPayload,
  });
  assert.equal(right.ok, true);
  assert.equal(right.correct, true);
  assert.equal(right.score, 1);

  const secondId = created.session.questionOrder[1];
  const secondQuestion = created.session.questions.find((question) => question.id === secondId);
  const wrongPayload =
    secondQuestion.type === "true_false"
      ? { answer: !secondQuestion.correctAnswer }
      : { choiceIndex: secondQuestion.correctIndex === 0 ? 1 : 0 };
  const wrong = submitAnswer(created.session, {
    playerId: joined.playerId,
    questionId: secondId,
    ...wrongPayload,
  });
  assert.equal(wrong.ok, true);
  assert.equal(wrong.correct, false);
  assert.equal(wrong.score, 0);

  const view = publicGameView(created.session, { playerId: joined.playerId });
  assert.equal(view.finished, true);
  assert.equal(view.question, null);
  assert.equal(JSON.stringify(view).includes("correctIndex"), false);
  assert.equal(JSON.stringify(view).includes("correctAnswer"), false);
});

