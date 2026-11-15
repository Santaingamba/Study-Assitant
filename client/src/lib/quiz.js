// Fisher-Yates shuffle. Returns a new array and never changes the input.
export function shuffle(items, rng = Math.random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildQuestion(card, rng = Math.random) {
  const options = shuffle([card.answer, ...card.distractors], rng);
  return {
    cardId: card.id,
    question: card.question,
    options,
    correctIndex: options.indexOf(card.answer), // safe: the schema guarantees all 4 are different
    explanation: card.explanation,
  };
}

export function buildQuiz(cards, rng = Math.random) {
  return shuffle(cards, rng).map((card) => buildQuestion(card, rng));
}

// Same question, options in a new order, so the student can't just remember "it was the third one"
function reshuffle(question, rng) {
  const correctText = question.options[question.correctIndex];
  const options = shuffle(question.options, rng);
  return {
    cardId: question.cardId,
    question: question.question,
    options,
    correctIndex: options.indexOf(correctText),
    explanation: question.explanation,
  };
}

export function buildRetest(missed, rng = Math.random) {
  return shuffle(missed, rng).map((q) => reshuffle(q, rng));
}

export const initialQuiz = {
  status: "idle",   // idle | running | finished
  round: 1,
  questions: [],
  index: 0,
  selected: null,   // option the student picked for the current question, or null
  correct: 0,
  missed: [],       // questions answered wrongly in the current round
  history: [],      // [{ round, total, correct }]
};

export function quizReducer(state, action) {
  switch (action.type) {
    case "start":
      return { ...initialQuiz, status: "running", questions: action.questions };

    case "answer": {
      if (state.status !== "running" || state.selected !== null) return state; // one answer per question
      const q = state.questions[state.index];
      const choice = action.choice;
      if (!q || !Number.isInteger(choice) || choice < 0 || choice >= q.options.length) return state;

      const isCorrect = choice === q.correctIndex;
      return {
        ...state,
        selected: choice,
        correct: state.correct + (isCorrect ? 1 : 0),
        missed: isCorrect ? state.missed : [...state.missed, { ...q, picked: choice }],
      };
    }

    case "next": {
      if (state.status !== "running" || state.selected === null) return state; // must answer first
      if (state.index + 1 < state.questions.length) {
        return { ...state, index: state.index + 1, selected: null };
      }
      return {
        ...state,
        status: "finished",
        selected: null,
        history: [...state.history, { round: state.round, total: state.questions.length, correct: state.correct }],
      };
    }

    case "retest":
      if (state.status !== "finished" || state.missed.length === 0) return state;
      return {
        ...state,
        status: "running",
        round: state.round + 1,
        questions: action.questions,
        index: 0,
        selected: null,
        correct: 0,
        missed: [],
      };

    case "reset":
      return initialQuiz;

    default:
      return state;
  }
}