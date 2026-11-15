import { describe, expect, it } from "vitest";
import { buildQuestion, buildQuiz, buildRetest, initialQuiz, quizReducer, shuffle } from "./quiz.js";

// Small deterministic random generator, so these tests give the same result every run
function seeded(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cards = ["a", "b", "c", "d"].map((id, n) => ({
  id,
  question: `Q${n + 1}?`,
  answer: `A${n + 1}`,
  distractors: [`x${n + 1}`, `y${n + 1}`, `z${n + 1}`],
  explanation: "",
}));

function deepFreeze(value) {
  Object.freeze(value);
  for (const inner of Object.values(value)) {
    if (inner && typeof inner === "object" && !Object.isFrozen(inner)) deepFreeze(inner);
  }
  return value;
}

const startQuiz = (questions = buildQuiz(cards, seeded(3))) => quizReducer(initialQuiz, { type: "start", questions });
const answer = (state, choice) => quizReducer(state, { type: "answer", choice });
const next = (state) => quizReducer(state, { type: "next" });
const right = (q) => q.correctIndex;
const wrong = (q) => (q.correctIndex + 1) % q.options.length;

function playRound(state, pick) {
  let s = state;
  const total = s.questions.length;
  for (let i = 0; i < total; i++) {
    s = answer(s, pick(s.questions[s.index], i));
    s = next(s);
  }
  return s;
}

describe("shuffle", () => {
  it("keeps the same items and leaves the input alone", () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    const out = shuffle(input, seeded(1));
    expect(input).toEqual(copy);
    expect([...out].sort()).toEqual(copy);
  });

  it("is repeatable with the same random source", () => {
    expect(shuffle([1, 2, 3, 4, 5, 6], seeded(5))).toEqual(shuffle([1, 2, 3, 4, 5, 6], seeded(5)));
  });

  it("handles empty and single-item lists", () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle([1])).toEqual([1]);
  });

  it("produces every ordering about equally often (no bias)", () => {
    const rng = seeded(7);
    const counts = {};
    for (let i = 0; i < 6000; i++) {
      const key = shuffle([1, 2, 3], rng).join("");
      counts[key] = (counts[key] ?? 0) + 1;
    }
    expect(Object.keys(counts)).toHaveLength(6); // all 6 orderings appear
    for (const n of Object.values(counts)) {
      expect(n).toBeGreaterThan(800); // fair would be 1000 each
      expect(n).toBeLessThan(1200);
    }
  });
});

describe("building questions", () => {
  it("makes 4 different options with the correct answer at correctIndex", () => {
    const q = buildQuestion(cards[0], seeded(2));
    expect(q.options).toHaveLength(4);
    expect(new Set(q.options).size).toBe(4);
    expect(q.options[q.correctIndex]).toBe("A1");
    expect([...q.options].sort()).toEqual(["A1", "x1", "y1", "z1"].sort());
  });

  it("does not always put the correct answer in the same place", () => {
    const positions = new Set();
    for (let seed = 1; seed <= 40; seed++) positions.add(buildQuestion(cards[0], seeded(seed)).correctIndex);
    expect(positions.size).toBeGreaterThan(1);
  });

  it("builds one question per card", () => {
    const quiz = buildQuiz(cards, seeded(4));
    expect(quiz).toHaveLength(4);
    expect(quiz.map((q) => q.cardId).sort()).toEqual(["a", "b", "c", "d"]);
  });
});

describe("quizReducer", () => {
  it("starts running at the first question", () => {
    const s = startQuiz();
    expect(s.status).toBe("running");
    expect(s.index).toBe(0);
    expect(s.selected).toBeNull();
  });

  it("counts a correct answer", () => {
    const s = startQuiz();
    const after = answer(s, right(s.questions[0]));
    expect(after.correct).toBe(1);
    expect(after.missed).toEqual([]);
  });

  it("records a wrong answer with what was picked", () => {
    const s = startQuiz();
    const choice = wrong(s.questions[0]);
    const after = answer(s, choice);
    expect(after.correct).toBe(0);
    expect(after.missed).toHaveLength(1);
    expect(after.missed[0].picked).toBe(choice);
    expect(after.missed[0].cardId).toBe(s.questions[0].cardId);
  });

  it("accepts only the first answer to a question", () => {
    const s = startQuiz();
    const q = s.questions[0];
    const first = answer(s, wrong(q));
    const second = answer(first, right(q));
    expect(second).toBe(first);
    expect(second.correct).toBe(0);
  });

  it.each([[-1], [4], [1.5], ["1"], [null], [undefined], [NaN]])("ignores the invalid choice %p", (choice) => {
    const s = startQuiz();
    expect(answer(s, choice)).toBe(s);
  });

  it("does not move on before the question is answered", () => {
    const s = startQuiz();
    expect(next(s)).toBe(s);
  });

  it("ignores answers when no quiz is running", () => {
    expect(answer(initialQuiz, 0)).toBe(initialQuiz);
  });

  it("finishes after the last question and records the round", () => {
    const first = playRound(startQuiz(), (q, i) => (i < 2 ? wrong(q) : right(q)));
    expect(first.status).toBe("finished");
    expect(first.correct).toBe(2);
    expect(first.missed).toHaveLength(2);
    expect(first.history).toEqual([{ round: 1, total: 4, correct: 2 }]);
  });

  describe("re-testing missed questions", () => {
    const finishedWithTwoMissed = () => playRound(startQuiz(), (q, i) => (i < 2 ? wrong(q) : right(q)));

    it("asks only the missed questions, with the same correct answers in a new order", () => {
      const first = finishedWithTwoMissed();
      const second = quizReducer(first, { type: "retest", questions: buildRetest(first.missed, seeded(9)) });

      expect(second.status).toBe("running");
      expect(second.round).toBe(2);
      expect(second.correct).toBe(0);
      expect(second.missed).toEqual([]);
      expect(second.history).toHaveLength(1);
      expect(second.questions.map((q) => q.cardId).sort()).toEqual(first.missed.map((q) => q.cardId).sort());

      for (const q of second.questions) {
        const original = first.missed.find((m) => m.cardId === q.cardId);
        expect(q.options[q.correctIndex]).toBe(original.options[original.correctIndex]);
        expect([...q.options].sort()).toEqual([...original.options].sort());
      }
    });

    it("can finish with a perfect second round", () => {
      const first = finishedWithTwoMissed();
      const second = quizReducer(first, { type: "retest", questions: buildRetest(first.missed, seeded(9)) });
      const done = playRound(second, (q) => right(q));
      expect(done.status).toBe("finished");
      expect(done.missed).toEqual([]);
      expect(done.history.map((h) => `${h.correct}/${h.total}`)).toEqual(["2/4", "2/2"]);
    });

    it("is ignored when nothing was missed", () => {
      const perfect = playRound(startQuiz(), (q) => right(q));
      expect(quizReducer(perfect, { type: "retest", questions: [] })).toBe(perfect);
    });

    it("is ignored while a quiz is still running", () => {
      const s = startQuiz();
      expect(quizReducer(s, { type: "retest", questions: [] })).toBe(s);
    });
  });

  it("reset returns to the beginning", () => {
    expect(quizReducer(startQuiz(), { type: "reset" })).toEqual(initialQuiz);
  });

  it("never changes the state it was given", () => {
    const frozen = deepFreeze(startQuiz());
    expect(() => answer(frozen, 0)).not.toThrow();
    expect(frozen.correct).toBe(0);
  });
});