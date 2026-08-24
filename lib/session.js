import { randomBytes, randomInt } from "node:crypto";
import { createId, gameIsReady, parseGameData } from "../js/questions.js";

export const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const CODE_LENGTH = 6;
export const MAX_PLAYER_NAME = 24;

export function createJoinCode(length = CODE_LENGTH) {
  let code = "";
  for (let index = 0; index < length; index += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

export function createHostToken() {
  return randomBytes(16).toString("hex");
}

export function normalizeJoinCode(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

export function isValidJoinCode(value) {
  return new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(normalizeJoinCode(value));
}

export function unusedJoinCode(store) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const code = createJoinCode();
    if (!store.has(code)) return code;
  }
  throw new Error("Could not create a unique player page.");
}

export function createGameSession({ quiz, code, hostToken, createdAt = Date.now() }) {
  const parsed = parseGameData(quiz);
  if (!parsed.ok) {
    return { ok: false, errors: parsed.errors, session: null };
  }
  if (!gameIsReady(parsed.game)) {
    return { ok: false, errors: ["Add at least one question before forming the game."], session: null };
  }

  const { teamCount, questions } = parsed.game;
  return {
    ok: true,
    errors: [],
    session: {
      code: normalizeJoinCode(code),
      hostToken,
      createdAt,
      status: "lobby",
      teamCount,
      questions,
      teams: Array.from({ length: teamCount }, (_, index) => ({
        id: index + 1,
        name: `Team ${index + 1}`,
        members: [],
      })),
      questionOrder: [],
    },
  };
}

function teamRoster(teams, { includeProgress = false } = {}) {
  return teams.map((team) => ({
    id: team.id,
    name: team.name,
    score: teamScore(team),
    members: team.members.map((member) => ({
      id: member.id,
      name: member.name,
      score: member.score ?? 0,
      ...(includeProgress ? { progress: member.questionIndex ?? 0 } : {}),
    })),
  }));
}

export function teamScore(team) {
  return team.members.reduce((sum, member) => sum + (member.score ?? 0), 0);
}

export function publicGameView(session, { playerId } = {}) {
  const view = {
    code: session.code,
    status: session.status,
    teamCount: session.teamCount,
    questionCount: session.questions.length,
    teams: teamRoster(session.teams, { includeProgress: session.status !== "lobby" }),
  };

  if (playerId) {
    const play = playerProgress(session, playerId);
    view.you = play.you;
    view.question = play.question;
    view.finished = play.finished;
  }

  return view;
}

export function joinTeam(session, { teamId, playerName, playerId }) {
  const errors = [];
  const name = String(playerName ?? "").trim();
  if (!name) errors.push("Enter your name.");
  if (name.length > MAX_PLAYER_NAME) {
    errors.push(`Keep names to ${MAX_PLAYER_NAME} characters or fewer.`);
  }

  const parsedTeamId = Number.parseInt(teamId, 10);
  const team = session.teams.find((item) => item.id === parsedTeamId);
  if (!team) errors.push("Pick a team.");

  if (errors.length > 0) {
    return { ok: false, errors, playerId: null, teamId: null };
  }

  const existing = session.teams
    .flatMap((item) => item.members)
    .find((member) => member.id === playerId);

  if (existing && session.status !== "lobby") {
    return { ok: false, errors: ["The game has already begun."], playerId: existing.id, teamId: null };
  }

  const nextPlayerId = existing ? existing.id : createId("p");

  session.teams.forEach((item) => {
    item.members = item.members.filter((member) => member.id !== nextPlayerId);
  });
  team.members.push({
    id: nextPlayerId,
    name,
    score: 0,
    questionIndex: 0,
    answers: {},
  });

  return { ok: true, errors: [], playerId: nextPlayerId, teamId: team.id, playerName: name };
}

export function findPlayer(session, playerId) {
  for (const team of session.teams) {
    const member = team.members.find((item) => item.id === playerId);
    if (member) return { team, member };
  }
  return null;
}

export function shuffledCopy(items, pick = (max) => randomInt(max)) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapWith = pick(index + 1);
    [copy[index], copy[swapWith]] = [copy[swapWith], copy[index]];
  }
  return copy;
}

export function toPublicQuestion(question, number, total) {
  const view = {
    id: question.id,
    type: question.type,
    prompt: question.prompt,
    number,
    total,
  };
  if (question.type === "multiple_choice") {
    view.choices = [...question.choices];
  }
  return view;
}

export function playerProgress(session, playerId) {
  const found = findPlayer(session, playerId);
  if (!found) {
    return { you: null, question: null, finished: false };
  }

  const { team, member } = found;
  const you = {
    playerId: member.id,
    teamId: team.id,
    name: member.name,
    score: member.score ?? 0,
    teamScore: teamScore(team),
  };

  if (session.status === "lobby") {
    return { you, question: null, finished: false };
  }

  const total = session.questionOrder.length;
  if (member.questionIndex >= total) {
    return { you, question: null, finished: true };
  }

  const questionId = session.questionOrder[member.questionIndex];
  const question = session.questions.find((item) => item.id === questionId);
  return {
    you,
    question: question ? toPublicQuestion(question, member.questionIndex + 1, total) : null,
    finished: false,
  };
}

export function beginGame(session, { pick } = {}) {
  if (session.status === "playing") {
    return { ok: true, errors: [], alreadyStarted: true };
  }
  if (session.status !== "lobby") {
    return { ok: false, errors: ["The game has already begun."] };
  }

  session.questionOrder = shuffledCopy(
    session.questions.map((question) => question.id),
    pick,
  );
  session.status = "playing";
  session.teams.forEach((team) => {
    team.members.forEach((member) => {
      member.score = 0;
      member.questionIndex = 0;
      member.answers = {};
    });
  });
  return { ok: true, errors: [] };
}

export function gradeAnswer(question, { choiceIndex, answer }) {
  if (question.type === "true_false") {
    if (answer !== true && answer !== false) {
      return { ok: false, errors: ["Select True or False."], correct: false };
    }
    return { ok: true, errors: [], correct: answer === question.correctAnswer };
  }

  const index = Number.parseInt(choiceIndex, 10);
  if (!Number.isInteger(index) || index < 0 || index >= question.choices.length) {
    return { ok: false, errors: ["Pick an answer."], correct: false };
  }
  return { ok: true, errors: [], correct: index === question.correctIndex };
}

export function submitAnswer(session, { playerId, questionId, choiceIndex, answer }) {
  if (session.status !== "playing") {
    return { ok: false, errors: ["Wait for the teacher to click Start Game."] };
  }

  const found = findPlayer(session, playerId);
  if (!found) {
    return { ok: false, errors: ["Join a team first."] };
  }

  const { member } = found;
  const currentId = session.questionOrder[member.questionIndex];
  if (!currentId) {
    return { ok: false, errors: ["There are no more questions."] };
  }
  if (questionId !== currentId) {
    return { ok: false, errors: ["That question is not on the screen."] };
  }
  if (member.answers[questionId]) {
    return { ok: false, errors: ["You already answered this one."] };
  }

  const question = session.questions.find((item) => item.id === questionId);
  const graded = gradeAnswer(question, { choiceIndex, answer });
  if (!graded.ok) return graded;

  const delta = graded.correct ? 1 : -1;
  member.score = (member.score ?? 0) + delta;
  member.answers[questionId] = { correct: graded.correct };
  member.questionIndex += 1;

  return {
    ok: true,
    errors: [],
    correct: graded.correct,
    delta,
    score: member.score,
    game: publicGameView(session, { playerId }),
  };
}
