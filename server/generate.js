import { streamGemini, ProviderError } from "./provider.js";
import { buildGeneratePrompt } from "./prompt.js";
import { createCardParser } from "./parseStream.js";
import { mockStream } from "./mock.js";
import { LIMITS } from "../shared/schema.js";

const MAX_INPUT = LIMITS.maxInput;
const IDLE_MS = Number(process.env.IDLE_MS) || 20_000;
const HARD_CAP_MS = 45_000;
// If the first reply has no usable cards, tell Gemini to return only the required JSON lines.
const RETRY_NOTE =
  "\n\nIMPORTANT: your previous reply could not be read. Reply with ONLY the JSON lines, nothing else.";
// Only these provider failures are considered temporary enough to retry.
const RETRIABLE = new Set(["network", "upstream", "timeout"]);

export async function generateHandler(req, res) {
  // 1. Check the request before starting the stream, so errors can still use a normal HTTP status.
  // `?.` safely reads body fields even if the request has no body.
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  // Use 10 by default and keep the requested number between 3 and 15.
  const count = Math.min(15, Math.max(3, Number(req.body?.count) || 10));
  const mock =
    process.env.ALLOW_MOCK === "1" && typeof req.body?.mock === "string" ? req.body.mock : null;

  if (text.length < LIMITS.minInput)
    return res.status(400).json({ code: "empty_input", message: "Paste some notes or type a topic first." });
  if (text.length > MAX_INPUT)
    return res.status(400).json({ code: "input_too_long", message: `Please keep your notes under ${MAX_INPUT} characters.` });

  // 2. Start a Server-Sent Events (SSE) response for sending cards as they are ready.
  // After these headers are sent, errors must be sent as events instead of changing the HTTP status.
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const send = (event, data) => {
    // SSE uses an event name and JSON data, followed by a blank line for each event.
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // 3. Stop spending time on the AI request if the browser disconnects.
  let clientGone = false;
  let current = null;
  res.on("close", () => {
    if (!res.writableEnded) {
      clientGone = true;
      console.log("[generate] client disconnected, aborting AI request");
      current?.abort();
    }
  });

  // 4. Make one Gemini request, parse its reply, and forward each result to the browser.
  async function runAttempt(prompt) {
    const controller = new AbortController();
    current = controller;
    if (clientGone) controller.abort();

    let timedOut = false;
    let accepted = 0;
    let skipped = 0;
    // Mark this as a timeout before aborting so it can be told apart from a browser disconnect.
    const stop = () => {
      timedOut = true;
      controller.abort();
    };
    let idle;
    // Restart the idle timer whenever Gemini sends another piece of text.
    const resetIdle = () => {
      clearTimeout(idle);
      idle = setTimeout(stop, IDLE_MS);
    };
    // This timer is a total limit; unlike the idle timer, new text does not restart it.
    const hardCap = setTimeout(stop, HARD_CAP_MS);

    const forward = (events) => {
      for (const e of events) {
        if (e.type === "card") {
          accepted++;
          send("card", e.card);
        } else {
          skipped++;
          console.log("[generate] skipped line:", e.reason);
          send("skipped", { reason: e.reason });
        }
      }
    };

    const parser = createCardParser();
    try {
      resetIdle();
      const source = mock
        ? mockStream(mock, prompt, controller.signal)
        : streamGemini(prompt, { signal: controller.signal });
      for await (const piece of source) {
        resetIdle();
        // The parser keeps partial lines between pieces and returns complete card events.
        forward(parser.push(piece));
      }
      // Process the final line, which may not have ended with a newline.
      forward(parser.end().events);
      return { accepted, skipped, error: null, cancelled: false };
    } catch (err) {
      if (err.name === "AbortError") {
        // An abort without our timeout flag means the browser disconnected.
        if (!timedOut) return { accepted, skipped, error: null, cancelled: true };
        return { accepted, skipped, cancelled: false,
          error: new ProviderError("timeout", "The AI took too long to respond.") };
      }
      // Convert unexpected errors to the same shape used for provider errors.
      const error = err instanceof ProviderError
        ? err
        : new ProviderError("internal", "Something went wrong on the server.", String(err));
      return { accepted, skipped, error, cancelled: false };
    } finally {
      // Clear timers on success, failure, timeout, or cancellation.
      clearTimeout(idle);
      clearTimeout(hardCap);
    }
  }

  // 5. Try at most twice. A second attempt is useful only if the first produced no cards.
  let result;
  for (let attempt = 1; attempt <= 2; attempt++) {
    // Add the extra instruction only to the retry prompt.
    const prompt = buildGeneratePrompt(text, count) + (attempt === 2 ? RETRY_NOTE : "");
    result = await runAttempt(prompt);
    if (result.cancelled || clientGone) break;

    // Retry an empty result or a temporary provider failure, but never retry after cards arrived.
    const worthRetrying =
      attempt === 1 &&
      result.accepted === 0 &&
      (!result.error || RETRIABLE.has(result.error.code));
    if (!worthRetrying) break;

    console.log("[generate] retrying, reason:", result.error?.code ?? "no valid cards");
    send("retry", { attempt: 2 });
  }

  // 6. Send one final status event unless the browser has already disconnected.
  if (!result.cancelled && !clientGone) {
    if (result.error) {
      console.error(`[generate] ${result.error.code}:`, result.error.detail || result.error.message);
      // `partial` tells the client whether some cards arrived before the error.
      send("error", { code: result.error.code, message: result.error.message, partial: result.accepted > 0 });
    } else if (result.accepted === 0) {
      send("error", {
        code: "no_valid_cards",
        message: "The AI's reply couldn't be turned into cards. Try again, or rephrase your notes.",
        partial: false,
      });
    } else {
      send("done", { accepted: result.accepted, skipped: result.skipped });
    }
  }
  // Close the SSE response so the browser knows there will be no more events.
  res.end();
}