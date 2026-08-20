export const MIN_TEAMS = 2;
export const MAX_TEAMS = 8;
export const MIN_MC_CHOICES = 2;
export const MAX_MC_CHOICES = 6;
export const DEFAULT_MC_CHOICES = 4;
export const GAME_DATA_VERSION = 1;

export function createId(prefix = "id") {
  const unique =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${unique}`;
}

export function clampTeamCount(value) {
  const count = Number.parseInt(value, 10);
  if (!Number.isInteger(count)) return MIN_TEAMS;
  return Math.min(MAX_TEAMS, Math.max(MIN_TEAMS, count));
}

export function emptyMultipleChoiceDraft() {
  return {
    type: "multiple_choice",
    prompt: "",
    choices: Array.from({ length: DEFAULT_MC_CHOICES }, () => ""),
    correctIndex: null,
  };
}

export function emptyTrueFalseDraft() {
  return {
    type: "true_false",
    prompt: "",
    correctAnswer: null,
  };
}

export function questionToDraft(question) {
  if (question.type === "true_false") {
    return {
      type: "true_false",
      prompt: question.prompt,
      correctAnswer: question.correctAnswer,
    };
  }

  return {
    type: "multiple_choice",
    prompt: question.prompt,
    choices: [...question.choices],
    correctIndex: question.correctIndex,
  };
}

function compactChoices(choices, correctIndex) {
  const kept = [];
  let nextCorrect = null;

  choices.forEach((choice, index) => {
    const text = String(choice ?? "").trim();
    if (!text) return;
    if (index === correctIndex) nextCorrect = kept.length;
    kept.push(text);
  });

  return { choices: kept, correctIndex: nextCorrect };
}

export function validateMultipleChoiceDraft(draft) {
  const errors = [];
  const prompt = String(draft?.prompt ?? "").trim();
  if (!prompt) errors.push("Enter a question.");

  const { choices, correctIndex } = compactChoices(
    Array.isArray(draft?.choices) ? draft.choices : [],
    draft?.correctIndex,
  );

  if (choices.length < MIN_MC_CHOICES) {
    errors.push("Add at least two answer choices.");
  }

  if (choices.length > MAX_MC_CHOICES) {
    errors.push(`Keep the number of choices at ${MAX_MC_CHOICES} or fewer.`);
  }

  if (correctIndex === null) {
    errors.push("Mark the correct choice.");
  }

  return {
    ok: errors.length === 0,
    errors,
    question: {
      type: "multiple_choice",
      prompt,
      choices,
      correctIndex,
    },
  };
}

export function validateTrueFalseDraft(draft) {
  const errors = [];
  const prompt = String(draft?.prompt ?? "").trim();
  if (!prompt) errors.push("Enter a question.");

  if (draft?.correctAnswer !== true && draft?.correctAnswer !== false) {
    errors.push("Select True or False as the correct answer.");
  }

  return {
    ok: errors.length === 0,
    errors,
    question: {
      type: "true_false",
      prompt,
      correctAnswer: draft?.correctAnswer === true,
    },
  };
}

export function validateDraft(draft) {
  if (draft?.type === "true_false") return validateTrueFalseDraft(draft);
  return validateMultipleChoiceDraft(draft);
}

export function createQuestionFromDraft(draft, existingId) {
  const result = validateDraft(draft);
  if (!result.ok) return result;

  return {
    ok: true,
    errors: [],
    question: {
      id: existingId || createId("q"),
      ...result.question,
    },
  };
}

export function summarizeQuestion(question) {
  if (question.type === "true_false") {
    return {
      typeLabel: "True / False",
      answerLabel: question.correctAnswer ? "True" : "False",
    };
  }

  const letter = String.fromCharCode(65 + question.correctIndex);
  const text = question.choices[question.correctIndex] ?? "";
  return {
    typeLabel: "Multiple choice",
    answerLabel: `${letter}. ${text}`,
  };
}

export function createDefaultGame() {
  return {
    version: GAME_DATA_VERSION,
    teamCount: 4,
    questions: [],
  };
}

export function parseGameData(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["This file is not a valid quiz."], game: null };
  }

  const hasTeamCount = Number.isInteger(Number(raw.teamCount));
  const teamCount = hasTeamCount ? clampTeamCount(raw.teamCount) : 4;
  if (!hasTeamCount) {
    errors.push("Team count was missing, so 4 teams were used.");
  }

  const questions = [];
  const incoming = Array.isArray(raw.questions) ? raw.questions : [];
  if (!Array.isArray(raw.questions)) {
    return { ok: false, errors: ["This file does not contain a question list."], game: null };
  }

  incoming.forEach((item, index) => {
    const label = `Question ${index + 1}`;
    if (!item || typeof item !== "object") {
      errors.push(`${label} could not be read.`);
      return;
    }

    const draft =
      item.type === "true_false"
        ? {
            type: "true_false",
            prompt: item.prompt,
            correctAnswer: item.correctAnswer,
          }
        : {
            type: "multiple_choice",
            prompt: item.prompt,
            choices: Array.isArray(item.choices) ? item.choices : [],
            correctIndex: item.correctIndex,
          };

    const result = createQuestionFromDraft(draft, typeof item.id === "string" ? item.id : undefined);
    if (!result.ok) {
      errors.push(`${label}: ${result.errors.join(" ")}`);
      return;
    }
    questions.push(result.question);
  });

  if (questions.length === 0 && incoming.length > 0) {
    return { ok: false, errors, game: null };
  }

  return {
    ok: true,
    errors,
    game: {
      version: GAME_DATA_VERSION,
      teamCount,
      questions,
    },
  };
}

export function gameIsReady(game) {
  return clampTeamCount(game?.teamCount) >= MIN_TEAMS && Array.isArray(game?.questions) && game.questions.length > 0;
}
