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
    return { ok: false, errors: ["Add at least one question before starting the game."], session: null };
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
    },
  };
}

function teamRoster(teams) {
  return teams.map((team) => ({
    id: team.id,
    name: team.name,
    members: team.members.map((member) => ({ id: member.id, name: member.name })),
  }));
}

export function publicGameView(session) {
  return {
    code: session.code,
    status: session.status,
    teamCount: session.teamCount,
    questionCount: session.questions.length,
    teams: teamRoster(session.teams),
  };
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
  const nextPlayerId = existing ? existing.id : createId("p");

  session.teams.forEach((item) => {
    item.members = item.members.filter((member) => member.id !== nextPlayerId);
  });
  team.members.push({ id: nextPlayerId, name });

  return { ok: true, errors: [], playerId: nextPlayerId, teamId: team.id, playerName: name };
}

export function findPlayer(session, playerId) {
  for (const team of session.teams) {
    const member = team.members.find((item) => item.id === playerId);
    if (member) return { team, member };
  }
  return null;
}
