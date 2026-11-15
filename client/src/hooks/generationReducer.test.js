import { describe, expect, it } from "vitest";
import { generationReducer, initialState } from "./generationReducer.js";

const c = (n) => ({ id: `c${n}`, question: `Q${n}?`, answer: "A", distractors: ["x", "y", "z"], explanation: "" });
const input = { text: "notes", count: 5 };

const run = (actions, from = initialState) => actions.reduce(generationReducer, from);
const start = (requestId) => ({ type: "start", requestId, input });
const card = (n, requestId) => ({ type: "card", card: c(n), requestId });

function deepFreeze(value) {
  Object.freeze(value);
  for (const inner of Object.values(value)) {
    if (inner && typeof inner === "object" && !Object.isFrozen(inner)) deepFreeze(inner);
  }
  return value;
}

describe("generationReducer", () => {
  it("start moves to loading and remembers the input", () => {
    const state = run([start(1)]);
    expect(state.status).toBe("loading");
    expect(state.requestId).toBe(1);
    expect(state.input).toEqual(input);
    expect(state.cards).toEqual([]);
  });

  it("start clears the cards of an earlier request", () => {
    const state = run([start(1), card(1, 1), start(2)]);
    expect(state.cards).toEqual([]);
    expect(state.requestId).toBe(2);
    expect(state.source).toBe("ai");
  });

  it("collects cards while streaming and counts skipped lines", () => {
    const state = run([start(1), card(1, 1), card(2, 1), { type: "skipped", requestId: 1 }]);
    expect(state.status).toBe("streaming");
    expect(state.cards.map((x) => x.id)).toEqual(["c1", "c2"]);
    expect(state.skipped).toBe(1);
  });

  it("finishes with done", () => {
    const state = run([start(1), card(1, 1), { type: "done", requestId: 1 }]);
    expect(state.status).toBe("done");
  });

  it("shows the retry state, and clears it once a card arrives", () => {
    const retrying = run([start(1), { type: "retry", requestId: 1 }]);
    expect(retrying.retrying).toBe(true);
    expect(retrying.status).toBe("loading");
    const after = run([card(1, 1)], retrying);
    expect(after.retrying).toBe(false);
  });

  describe("stale responses", () => {
    it("ignores every kind of event from an older request", () => {
      const current = run([start(1), start(2), card(5, 2)]);
      const stale = [
        card(1, 1),
        { type: "skipped", requestId: 1 },
        { type: "retry", requestId: 1 },
        { type: "done", requestId: 1 },
        { type: "error", requestId: 1, code: "x", message: "late failure" },
      ];
      for (const action of stale) {
        expect(generationReducer(current, action)).toBe(current); // same object: nothing changed
      }
    });

    it("a late error from the old request cannot hide the new request's cards", () => {
      const state = run([
        start(1),
        start(2),
        { type: "error", requestId: 1, code: "x", message: "old" },
        card(7, 2),
      ]);
      expect(state.error).toBeNull();
      expect(state.status).toBe("streaming");
      expect(state.cards).toHaveLength(1);
    });
  });

  describe("errors", () => {
    it("keeps the cards that arrived and marks the error as partial", () => {
      const state = run([start(1), card(1, 1), card(2, 1), { type: "error", requestId: 1, code: "upstream", message: "boom" }]);
      expect(state.status).toBe("error");
      expect(state.cards).toHaveLength(2);
      expect(state.error).toEqual({ code: "upstream", message: "boom", partial: true });
    });

    it("marks the error as not partial when nothing arrived", () => {
      const state = run([start(1), { type: "error", requestId: 1, code: "empty", message: "nothing" }]);
      expect(state.error.partial).toBe(false);
    });

    it("dismissing keeps the cards, or goes back to idle when there are none", () => {
      const withCards = run([start(1), card(1, 1), { type: "error", requestId: 1, code: "x", message: "m" }, { type: "dismiss", requestId: 1 }]);
      expect(withCards.error).toBeNull();
      expect(withCards.status).toBe("done");
      expect(withCards.cards).toHaveLength(1);

      const without = run([start(1), { type: "error", requestId: 1, code: "x", message: "m" }, { type: "dismiss", requestId: 1 }]);
      expect(without.status).toBe("idle");
    });
    it("dismiss works whatever request id it carries", () => {
      const failed = run([start(1), card(1, 1), { type: "error", requestId: 1, code: "x", message: "m" }]);
      const dismissed = generationReducer(failed, { type: "dismiss", requestId: 99 });
      expect(dismissed.error).toBeNull();
      expect(dismissed.status).toBe("done");
    });

    it("dismiss does nothing when there is no error", () => {
      const state = run([start(1), card(1, 1)]);
      expect(generationReducer(state, { type: "dismiss", requestId: 1 })).toBe(state);
    });
  });

  describe("cancel", () => {
    it("keeps the cards received so far, and ignores the cancelled stream afterwards", () => {
      const cancelled = run([start(1), card(1, 1), { type: "cancel", requestId: 2 }]);
      expect(cancelled.status).toBe("done");
      expect(cancelled.cards).toHaveLength(1);
      expect(generationReducer(cancelled, card(2, 1))).toBe(cancelled);
    });

    it("goes back to idle when nothing had arrived", () => {
      expect(run([start(1), { type: "cancel", requestId: 2 }]).status).toBe("idle");
    });
    it("does nothing when no request is running", () => {
      const finished = run([start(1), card(1, 1), { type: "done", requestId: 1 }]);
      expect(generationReducer(finished, { type: "cancel", requestId: 2 })).toBe(finished);
      expect(generationReducer(initialState, { type: "cancel", requestId: 1 })).toBe(initialState);
    });
  });

  describe("opening a saved session", () => {
    const load = (requestId) => ({ type: "load", requestId, input, cards: [c(1), c(2)], skipped: 1 });

    it("shows the saved cards at once and marks them as saved", () => {
      const state = run([load(1)]);
      expect(state.status).toBe("done");
      expect(state.source).toBe("saved");
      expect(state.cards).toHaveLength(2);
      expect(state.skipped).toBe(1);
    });

    it("cuts off a stream that was still running", () => {
      const state = run([start(1), card(9, 1), load(2)]);
      expect(state.cards.map((x) => x.id)).toEqual(["c1", "c2"]);
      expect(generationReducer(state, card(10, 1))).toBe(state);
    });

    it("a new generation afterwards counts as fresh AI output again", () => {
      expect(run([load(1), start(2)]).source).toBe("ai");
    });
  });

  it("reset returns to the empty state under a new request id", () => {
    const state = run([start(1), card(1, 1), { type: "reset", requestId: 5 }]);
    expect(state).toEqual({ ...initialState, requestId: 5 });
  });

  it("ignores unknown actions", () => {
    const state = run([start(1)]);
    expect(generationReducer(state, { type: "nope", requestId: 1 })).toBe(state);
  });

  it("never changes the state it was given", () => {
    const frozen = deepFreeze(run([start(1), card(1, 1)]));
    expect(() => generationReducer(frozen, card(2, 1))).not.toThrow();
    expect(frozen.cards).toHaveLength(1);
  });
});