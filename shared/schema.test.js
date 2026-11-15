import { describe, expect, it } from "vitest";
import { CardSchema, LIMITS } from "./schema.js";

const good = {
  question: "What is the capital of France?",
  answer: "Paris",
  distractors: ["Lyon", "Marseille", "Nice"],
  explanation: "Paris is the capital and largest city of France.",
};

describe("CardSchema", () => {
  it("accepts a well-formed card", () => {
    expect(CardSchema.safeParse(good).success).toBe(true);
  });

  it("keeps the explanation when the model spells the key correctly", () => {
    // Regression: a misspelled key in the schema once dropped every explanation silently
    const line = '{"question":"Q?","answer":"A","distractors":["B","C","D"],"explanation":"Because."}';
    const result = CardSchema.safeParse(JSON.parse(line));
    expect(result.success).toBe(true);
    expect(result.data.explanation).toBe("Because.");
  });

  it("defaults a missing explanation to an empty string", () => {
    const { explanation, ...withoutExplanation } = good;
    const result = CardSchema.safeParse(withoutExplanation);
    expect(result.success).toBe(true);
    expect(result.data.explanation).toBe("");
  });

  it("accepts very short answers such as a single digit", () => {
    // Regression: an "answer too short" rule once rejected cards like 2 + 2 = 4
    const card = { question: "What is 2 + 2?", answer: "4", distractors: ["3", "5", "6"] };
    expect(CardSchema.safeParse(card).success).toBe(true);
  });

  it("trims whitespace around text", () => {
    const result = CardSchema.safeParse({ ...good, question: "  What is the capital of France?  " });
    expect(result.data.question).toBe("What is the capital of France?");
  });

  it("drops unknown fields instead of rejecting the card", () => {
    const result = CardSchema.safeParse({ ...good, difficulty: "hard" });
    expect(result.success).toBe(true);
    expect("difficulty" in result.data).toBe(false);
  });

  it("reports which field failed", () => {
    const result = CardSchema.safeParse({ ...good, distractors: ["a", "b"] });
    expect(result.success).toBe(false);
    expect(result.error.issues.some((issue) => issue.path[0] === "distractors")).toBe(true);
  });

  it.each([
    ["only two distractors", { ...good, distractors: ["Lyon", "Marseille"] }],
    ["four distractors", { ...good, distractors: ["Lyon", "Marseille", "Nice", "Lille"] }],
    ["distractors that are not an array", { ...good, distractors: "Lyon, Marseille, Nice" }],
    ["the answer repeated in different case", { ...good, distractors: ["paris", "Marseille", "Nice"] }],
    ["duplicate distractors", { ...good, distractors: ["Lyon", "lyon", "Nice"] }],
    ["a blank question", { ...good, question: "   " }],
    ["a missing answer", { ...good, answer: undefined }],
    ["a non-text answer", { ...good, answer: 42 }],
    ["an overlong question", { ...good, question: "x".repeat(5000) }],
    ["an overlong explanation", { ...good, explanation: "x".repeat(5000) }],
  ])("rejects %s", (_name, card) => {
    expect(CardSchema.safeParse(card).success).toBe(false);
  });

  it.each([[null], [undefined], [42], ["text"], [[]], [{}]])("does not throw on junk input (%j)", (junk) => {
    expect(CardSchema.safeParse(junk).success).toBe(false);
  });
});

describe("LIMITS", () => {
  it("has a sensible range", () => {
    expect(LIMITS.minInput).toBeGreaterThan(0);
    expect(LIMITS.maxInput).toBeGreaterThan(LIMITS.minInput);
  });
});