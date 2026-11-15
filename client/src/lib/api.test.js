import { afterEach, describe, expect, it, vi } from "vitest";
import { streamGenerate } from "./api.js";

afterEach(() => vi.unstubAllGlobals());

const goodCard = {
  question: "Qu'est-ce que l'énergie ?",
  answer: "Énergie",
  distractors: ["Force", "Masse", "Temps"],
  explanation: "é",
};

const sse = (events) => events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join("");
const abortError = () => Object.assign(new Error("aborted"), { name: "AbortError" });

function streamFrom(text, size = 1_000_000) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += size) controller.enqueue(bytes.slice(i, i + size));
      controller.close();
    },
  });
}

const sseResponse = (text, size) =>
  new Response(streamFrom(text, size), { status: 200, headers: { "content-type": "text/event-stream" } });

const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function stubFetch(implementation) {
  const fetchMock = vi.fn(implementation);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function collect(generator) {
  const events = [];
  for await (const event of generator) events.push(event);
  return events;
}

const types = (events) => events.map((e) => e.type);
const withoutIds = (events) =>
  events.map((e) => (e.type === "card" ? { ...e, card: { ...e.card, id: "ID" } } : e));
const generate = (overrides = {}) => streamGenerate({ text: "notes", count: 5, ...overrides });

describe("streamGenerate", () => {
  describe("reading the stream", () => {
    const text = sse([
      ["card", goodCard],
      ["card", { ...goodCard, question: "Second ?" }],
      ["done", { accepted: 2, skipped: 0 }],
    ]);

    it("turns server events into cards with their own ids, then done", async () => {
      stubFetch(async () => sseResponse(text));
      const events = await collect(generate());
      expect(types(events)).toEqual(["card", "card", "done"]);
      const ids = events.filter((e) => e.type === "card").map((e) => e.card.id);
      expect(new Set(ids).size).toBe(2);
      expect(events[0].card.question).toBe("Qu'est-ce que l'énergie ?");
    });

    it("gives the same result however the bytes are cut up", async () => {
      stubFetch(async () => sseResponse(text));
      const baseline = withoutIds(await collect(generate()));
      for (const size of [1, 2, 7, 64]) {
        stubFetch(async () => sseResponse(text, size)); // small sizes cut accented letters in half
        expect(withoutIds(await collect(generate()))).toEqual(baseline);
      }
    });

    it("sends the notes and count, passes the abort signal, and sends no mock field", async () => {
      const controller = new AbortController();
      const fetchMock = stubFetch(async () => sseResponse(sse([["done", {}]])));
      await collect(generate({ text: "hello", count: 7, signal: controller.signal }));
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/generate");
      expect(options.method).toBe("POST");
      expect(JSON.parse(options.body)).toEqual({ text: "hello", count: 7 });
      expect(options.signal).toBe(controller.signal);
    });

    it("checks cards again and skips one that doesn't fit the shape", async () => {
      stubFetch(async () =>
        sseResponse(sse([["card", { question: "Q?", answer: "A" }], ["card", goodCard], ["done", {}]]))
      );
      expect(types(await collect(generate()))).toEqual(["skipped", "card", "done"]);
    });

    it("passes the server's skipped and retry events along", async () => {
      stubFetch(async () => sseResponse(sse([["retry", { attempt: 2 }], ["skipped", { reason: "x" }], ["done", {}]])));
      expect(types(await collect(generate()))).toEqual(["retry", "skipped", "done"]);
    });

    it("ignores event names it does not know", async () => {
      stubFetch(async () => sseResponse(sse([["mystery", { a: 1 }], ["done", {}]])));
      expect(types(await collect(generate()))).toEqual(["done"]);
    });
  });

  describe("failures", () => {
    it("passes a server error event along, once", async () => {
      stubFetch(async () =>
        sseResponse(sse([["card", goodCard], ["error", { code: "rate_limited", message: "Slow down" }]]))
      );
      const events = await collect(generate());
      expect(types(events)).toEqual(["card", "error"]);
      expect(events[1]).toEqual({ type: "error", code: "rate_limited", message: "Slow down" });
    });

    it("fills in defaults when an error event is missing its fields", async () => {
      stubFetch(async () => sseResponse(sse([["error", {}]])));
      const [event] = await collect(generate());
      expect(event).toEqual({ type: "error", code: "unknown", message: "Something went wrong." });
    });

    it("reports a lost connection when the stream ends without done or error", async () => {
      stubFetch(async () => sseResponse(sse([["card", goodCard]])));
      const events = await collect(generate());
      expect(types(events)).toEqual(["card", "error"]);
      expect(events[1].code).toBe("connection_lost");
    });

    it("reports a lost connection when the stream breaks halfway", async () => {
      let sent = false;
      const broken = new ReadableStream({
        pull(controller) {
          if (!sent) {
            sent = true;
            controller.enqueue(new TextEncoder().encode(sse([["card", goodCard]])));
          } else {
            controller.error(new TypeError("network error"));
          }
        },
      });
      stubFetch(async () => new Response(broken, { status: 200, headers: { "content-type": "text/event-stream" } }));
      const events = await collect(generate());
      expect(types(events)).toEqual(["card", "error"]);
      expect(events[1].code).toBe("connection_lost");
    });

    it("uses the message and code from a JSON error such as 400", async () => {
      stubFetch(async () => jsonResponse(400, { code: "empty_input", message: "Paste some notes first." }));
      const events = await collect(generate());
      expect(events).toEqual([{ type: "error", code: "empty_input", message: "Paste some notes first." }]);
    });

    it("says the server can't be reached when a proxy returns an HTML error page", async () => {
      stubFetch(async () => new Response("<html>Bad gateway</html>", { status: 502, headers: { "content-type": "text/html" } }));
      const [event] = await collect(generate());
      expect(event.code).toBe("http_502");
      expect(event.message).toMatch(/reach the server/i);
    });

    it("does not mistake a 200 page that isn't a stream for success", async () => {
      stubFetch(async () => new Response("<html>app</html>", { status: 200, headers: { "content-type": "text/html" } }));
      const events = await collect(generate());
      expect(types(events)).toEqual(["error"]);
      expect(events[0].code).toBe("http_200");
    });

    it("reports a network failure when fetch itself fails", async () => {
      stubFetch(async () => {
        throw new TypeError("Failed to fetch");
      });
      const [event] = await collect(generate());
      expect(event.type).toBe("error");
      expect(event.code).toBe("network");
    });
  });

  describe("cancelling", () => {
    it("rethrows an abort before the response, instead of showing an error", async () => {
      stubFetch(async () => {
        throw abortError();
      });
      await expect(collect(generate())).rejects.toMatchObject({ name: "AbortError" });
    });

    it("rethrows an abort in the middle of the stream, after delivering earlier cards", async () => {
      let sent = false;
      const aborted = new ReadableStream({
        pull(controller) {
          if (!sent) {
            sent = true;
            controller.enqueue(new TextEncoder().encode(sse([["card", goodCard]])));
          } else {
            controller.error(abortError());
          }
        },
      });
      stubFetch(async () => new Response(aborted, { status: 200, headers: { "content-type": "text/event-stream" } }));

      const seen = [];
      const consume = (async () => {
        for await (const event of generate()) seen.push(event);
      })();
      await expect(consume).rejects.toMatchObject({ name: "AbortError" });
      expect(types(seen)).toEqual(["card"]);
    });
  });
});