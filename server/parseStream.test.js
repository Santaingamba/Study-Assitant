import { describe, expect, it } from "vitest";
import { createCardParser } from "./parseStream.js";

const card = (question, answer = "A") =>
  JSON.stringify({ question, answer, distractors: ["x", "y", "z"], explanation: "Because." });

// Feeds text to a fresh parser in chunks of `size` characters
function run(text, size = text.length || 1) {
  const parser = createCardParser();
  const events = [];
  for (let i = 0; i < text.length; i += size) events.push(...parser.push(text.slice(i, i + size)));
  const final = parser.end();
  events.push(...final.events);
  return { events, accepted: final.accepted, skipped: final.skipped };
}

const types = (events) => events.map((e) => e.type);

describe("createCardParser", () => {
  it("turns good lines into card events", () => {
    const { events, accepted, skipped } = run(`${card("Q1?")}\n${card("Q2?")}\n`);
    expect(types(events)).toEqual(["card", "card"]);
    expect(events[0].card.question).toBe("Q1?");
    expect(accepted).toBe(2);
    expect(skipped).toBe(0);
  });

  it("silently ignores chatter, code fences and blank lines", () => {
    const text = ["Sure! Here are your cards:", "```json", "", "   ", card("Q1?"), "```", ""].join("\n");
    const { events, skipped } = run(text);
    expect(types(events)).toEqual(["card"]);
    expect(skipped).toBe(0); // chatter is not a failed card
  });

  it("skips a line that is not valid JSON, with a reason", () => {
    const { events, skipped } = run("{this is not json}\n");
    expect(types(events)).toEqual(["skipped"]);
    expect(events[0].reason).toMatch(/json/i);
    expect(skipped).toBe(1);
  });

  it("skips a card with the wrong shape and names the field", () => {
    const badShape = JSON.stringify({ question: "Q?", answer: "A", distractors: ["a", "b"] });
    const { events } = run(`${badShape}\n`);
    expect(types(events)).toEqual(["skipped"]);
    expect(events[0].reason).toContain("distractors");
  });

  it("forgives one trailing comma", () => {
    const { events } = run(`${card("Q1?")},\n`);
    expect(types(events)).toEqual(["card"]);
  });

  it("skips a repeated question, ignoring letter case", () => {
    const { events, accepted, skipped } = run(`${card("What is 2+2?", "4")}\n${card("what is 2+2?", "4")}\n`);
    expect(types(events)).toEqual(["card", "skipped"]);
    expect(events[1].reason).toMatch(/duplicate/i);
    expect(accepted).toBe(1);
    expect(skipped).toBe(1);
  });

  it("copes with Windows line endings", () => {
    const { events } = run([card("Q1?"), card("Q2?")].join("\r\n"));
    expect(types(events)).toEqual(["card", "card"]);
  });

  it("delivers the last line even without a trailing newline", () => {
    const { events } = run(`${card("Q1?")}\n${card("Q2?")}`);
    expect(types(events)).toEqual(["card", "card"]);
  });

  it("skips a final line that was cut off mid-card", () => {
    const { events, accepted, skipped } = run(`${card("Q1?")}\n{"question":"Cut off mid`);
    expect(types(events)).toEqual(["card", "skipped"]);
    expect(accepted).toBe(1);
    expect(skipped).toBe(1);
  });

  it("keeps accented and non-Latin text intact", () => {
    const { events } = run(`${card("Qu'est-ce que l'énergie ?", "ऊर्जा")}\n`);
    expect(events[0].card.question).toBe("Qu'est-ce que l'énergie ?");
    expect(events[0].card.answer).toBe("ऊर्जा");
  });

  it("known limit: two cards on one line are skipped, not repaired", () => {
    const { events } = run(`${card("Q1?")}${card("Q2?")}\n`);
    expect(types(events)).toEqual(["skipped"]);
  });

  it("gives the same result however the text is cut into chunks", () => {
    const badShape = JSON.stringify({ question: "Only two?", answer: "yes", distractors: ["a", "b"] });
    const text = [
      "Sure! Here are your cards:",
      "```json",
      card("What is 2+2?", "4"),
      "{this is not json}",
      badShape,
      `${card("What is 3+3?", "6")},`,
      card("what is 2+2?", "4"),
      "```",
      card("What is 5+5?", "10"),
    ].join("\r\n");

    const baseline = run(text); // the whole text in one piece
    expect(types(baseline.events)).toEqual(["card", "skipped", "skipped", "card", "skipped", "card"]);
    expect(baseline.accepted).toBe(3);
    expect(baseline.skipped).toBe(3);

    for (const size of [1, 2, 3, 5, 8, 13, 17, 50, 1000]) {
      expect(run(text, size)).toEqual(baseline);
    }
  });

  it("end() always returns an events array, and never repeats the last line", () => {
    const parser = createCardParser();
    parser.push(card("Q1?")); // no newline yet, so it waits in the buffer
    const first = parser.end();
    const second = parser.end();
    expect(first.events).toHaveLength(1);
    expect(second.events).toEqual([]);
    expect(second.accepted).toBe(1);
    expect(createCardParser().end().events).toEqual([]);
  });
});