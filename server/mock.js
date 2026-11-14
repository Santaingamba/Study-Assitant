import { ProviderError } from "./provider.js";

const QA = [
  ["What is 2 + 2?", "4", ["3", "5", "6"]],
  ["What is the capital of France?", "Paris", ["Lyon", "Nice", "Lille"]],
  ["Which planet is closest to the Sun?", "Mercury", ["Venus", "Mars", "Earth"]],
  ["Which gas do plants absorb?", "Carbon dioxide", ["Oxygen", "Nitrogen", "Helium"]],
  ["How many days are in a week?", "7", ["5", "6", "8"]],
  ["What is H2O commonly called?", "Water", ["Salt", "Sugar", "Air"]],
  ["Which ocean is the largest?", "Pacific", ["Atlantic", "Indian", "Arctic"]],
  ["What is the largest mammal?", "Blue whale", ["Elephant", "Giraffe", "Hippo"]],
  ["How many sides does a triangle have?", "3", ["2", "4", "5"]],
  ["What do bees make?", "Honey", ["Milk", "Silk", "Cotton"]],
];

const line = (i) => {
  const [question, answer, distractors] = QA[i];
  return JSON.stringify({ question, answer, distractors, explanation: "Mock card." });
};
const lines = (from, to) => QA.slice(from, to).map((_, k) => line(from + k));

function abortError() {
  const e = new Error("aborted");
  e.name = "AbortError";
  return e;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// Sends text in small pieces, like a real stream. 23 is deliberately an awkward size.
async function* emit(text, signal, { size = 23, delay = 60 } = {}) {
  for (let i = 0; i < text.length; i += size) {
    await sleep(delay, signal);
    yield text.slice(i, i + size);
  }
}

export async function* mockStream(mode, prompt, signal) {
  const isRetry = prompt.includes("previous reply could not be read");
  const good = lines(0, 5).join("\n") + "\n";

  switch (mode) {
    case "good":
      yield* emit(good, signal);
      return;

    case "slow":
      yield* emit(lines(0, 10).join("\n") + "\n", signal, { delay: 150 });
      return;

    case "messy": {
      const badShape = JSON.stringify({ question: "Only two options?", answer: "yes", distractors: ["a", "b"] });
      const text = [
        "Sure! Here are your cards:",
        "```json",
        line(0),
        "{this is not json}",
        badShape,
        line(1) + ",",
        line(0).replace("What is 2 + 2?", "what is 2 + 2?"),
        "```",
        line(2),
      ].join("\r\n");
      yield* emit(text, signal);
      return;
    }

    case "flaky":
      if (!isRetry) {
        yield* emit("Sorry, I can't format that as requested.\n", signal);
        return;
      }
      yield* emit(good, signal);
      return;

    case "empty":
      return;

    case "hang":
      await sleep(10 * 60_000, signal);
      return;

    case "stall":
      yield* emit(lines(0, 2).join("\n") + "\n", signal);
      await sleep(10 * 60_000, signal);
      return;

    case "dies":
      yield* emit(lines(0, 2).join("\n") + "\n", signal);
      throw new ProviderError("upstream", "The AI service had a problem. Please try again.", "mock: stream died");

    case "ratelimit":
      throw new ProviderError(
        "rate_limited",
        "The AI service is busy or the free limit was reached. Wait a minute and try again.",
        "mock: 429"
      );

    default:
      throw new ProviderError("config", `Unknown mock mode "${mode}".`);
  }
}