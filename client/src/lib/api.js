import { CardSchema } from "../../../shared/schema.js";

// Not crypto.randomUUID(): it only exists on HTTPS or localhost,
// so it would crash when you test on your phone over Wi-Fi.
let counter = 0;
export const makeId = () => `c${Date.now().toString(36)}${(counter++).toString(36)}`;

// Dev only: open http://localhost:5173/?mock=messy to trigger a fake failure
function readMock() {
  if (!import.meta.env.DEV || typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get("mock") ?? undefined;
}

function parseBlock(block) {
  let event = "message";
  const dataLines = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  try {
    return { event, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return null;
  }
}

function toEvent({ event, data }) {
  switch (event) {
    case "card": {
      const parsed = CardSchema.safeParse(data);
      if (!parsed.success) return { type: "skipped" };
      return { type: "card", card: { id: makeId(), ...parsed.data } };
    }
    case "skipped":
      return { type: "skipped" };
    case "retry":
      return { type: "retry" };
    case "done":
      return { type: "done" };
    case "error":
      return {
        type: "error",
        code: typeof data?.code === "string" ? data.code : "unknown",
        message: typeof data?.message === "string" ? data.message : "Something went wrong.",
      };
    default:
      return null; // unknown event names are ignored, not crashed on
  }
}

export async function* streamGenerate({ text, count, signal }) {
  let res;
  try {
    res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, count, mock: readMock() }),
      signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    yield { type: "error", code: "network", message: "Could not reach the server. Check your connection." };
    return;
  }

  // Not a stream: a plain error from the server (or from the dev proxy)
  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok || !contentType.includes("text/event-stream")) {
    let code = `http_${res.status}`;
    let message = "The server could not handle that request.";
    try {
      const body = await res.json();
      if (typeof body?.code === "string") code = body.code;
      if (typeof body?.message === "string") message = body.message;
    } catch {
      if (res.status >= 500) message = "Could not reach the server. Check that it is running.";
    }
    yield { type: "error", code, message };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop();

      for (const block of blocks) {
        const parsed = parseBlock(block);
        const event = parsed && toEvent(parsed);
        if (!event) continue;
        yield event;
        if (event.type === "done" || event.type === "error") finished = true;
      }
    }
  } catch (err) {
    if (err.name === "AbortError") throw err;
    yield { type: "error", code: "connection_lost", message: "The connection was interrupted." };
    return;
  }

  if (!finished) {
    yield { type: "error", code: "connection_lost", message: "The connection ended before the AI finished." };
  }
}