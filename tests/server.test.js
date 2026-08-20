import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer, listen } from "../server.js";

const quiz = {
  teamCount: 2,
  questions: [
    {
      type: "true_false",
      prompt: "Athens was a democracy.",
      correctAnswer: true,
    },
  ],
};

async function withServer(run) {
  const server = createServer();
  const port = await listen(server, 0, "127.0.0.1");
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("starting a game creates a unique player page teams can join", async () => {
  await withServer(async (origin) => {
    const created = await fetch(`${origin}/api/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(quiz),
    });
    assert.equal(created.status, 201);
    const session = await created.json();
    assert.match(session.playerPath, /^\/play\/[A-Z0-9]{6}$/);
    assert.equal(session.playerUrl, `${origin}${session.playerPath}`);

    const second = await fetch(`${origin}/api/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(quiz),
    });
    const other = await second.json();
    assert.notEqual(other.code, session.code);

    const art = await fetch(`${origin}/images/noir-alley.png`);
    assert.equal(art.status, 200);
    const playCss = await fetch(`${origin}/css/play.css`);
    assert.equal(playCss.status, 200);
    assert.match(await playCss.text(), /noir-alley/);

    const teacherPage = await fetch(`${origin}/`);
    assert.equal(teacherPage.status, 200);
    assert.match(await teacherPage.text(), /Form Game/);

    const playerPage = await fetch(`${origin}${session.playerPath}`);
    assert.equal(playerPage.status, 200);
    const html = await playerPage.text();
    assert.match(html, /Assassin/);
    assert.match(html, /Game About To Begin/);

    const publicGame = await fetch(`${origin}/api/games/${session.code}`);
    assert.equal(publicGame.status, 200);
    const view = await publicGame.json();
    assert.equal("questions" in view, false);
    assert.equal(JSON.stringify(view).includes("correctAnswer"), false);

    const blockedHost = await fetch(`${origin}/api/games/${session.code}/host`);
    assert.equal(blockedHost.status, 401);

    const host = await fetch(`${origin}/api/games/${session.code}/host?k=${session.hostToken}`);
    assert.equal(host.status, 200);
    const lobby = await host.json();
    assert.equal(lobby.playerUrl, session.playerUrl);

    const joined = await fetch(`${origin}/api/games/${session.code}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamId: 2, playerName: "Sam" }),
    });
    assert.equal(joined.status, 200);
    const membership = await joined.json();
    assert.equal(membership.teamId, 2);
    assert.equal(membership.game.teams[1].members[0].name, "Sam");
  });
});

test("an empty quiz cannot start a player page", async () => {
  await withServer(async (origin) => {
    const created = await fetch(`${origin}/api/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamCount: 4, questions: [] }),
    });
    assert.equal(created.status, 400);
  });
});

test("begin game serves shuffled questions and scores answers", async () => {
  const round = {
    teamCount: 2,
    questions: [
      { type: "true_false", prompt: "Athens was a democracy.", correctAnswer: true },
      { type: "multiple_choice", prompt: "2 + 2?", choices: ["3", "4"], correctIndex: 1 },
    ],
  };

  await withServer(async (origin) => {
    const created = await fetch(`${origin}/api/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(round),
    });
    const session = await created.json();

    const joined = await fetch(`${origin}/api/games/${session.code}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamId: 1, playerName: "Sam" }),
    });
    const membership = await joined.json();

    const blocked = await fetch(`${origin}/api/games/${session.code}/begin`, { method: "POST" });
    assert.equal(blocked.status, 401);

    const tooSoon = await fetch(`${origin}/api/games/${session.code}/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: membership.playerId, questionId: "q_x", answer: true }),
    });
    assert.equal(tooSoon.status, 400);

    const began = await fetch(`${origin}/api/games/${session.code}/begin?k=${session.hostToken}`, {
      method: "POST",
    });
    assert.equal(began.status, 200);
    const live = await began.json();
    assert.equal(live.status, "playing");

    const play = await fetch(
      `${origin}/api/games/${session.code}?playerId=${encodeURIComponent(membership.playerId)}`,
    );
    const view = await play.json();
    assert.equal(view.question.number, 1);
    assert.equal("correctAnswer" in view.question, false);
    assert.equal("correctIndex" in view.question, false);

    const payload =
      view.question.type === "true_false"
        ? { answer: true }
        : { choiceIndex: view.question.choices.indexOf("4") };
    const answered = await fetch(`${origin}/api/games/${session.code}/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        playerId: membership.playerId,
        questionId: view.question.id,
        ...payload,
      }),
    });
    assert.equal(answered.status, 200);
    const result = await answered.json();
    assert.equal(typeof result.correct, "boolean");
    assert.equal(result.delta === 1 || result.delta === -1, true);
    assert.equal(result.game.question.number, 2);
  });
});
