# Features and Error Handling

This document describes the behaviour implemented in the current codebase. It is intended as a deeper technical companion to the project overview in [README.md](./README.md).

## 1. Generation request lifecycle

The application uses a React client, an Express API, Gemini's streaming generation endpoint, and Server-Sent Events (SSE) to deliver validated flashcards incrementally.

1. The client submits the notes and requested card count to `POST /api/generate`.
2. The server trims and validates the input before opening an SSE response.
3. The server builds a prompt that asks Gemini for one JSON object per line (JSON Lines).
4. Gemini text is read incrementally. The parser buffers incomplete lines, parses complete lines, validates each card, and forwards accepted cards as SSE events.
5. The browser reads SSE blocks and validates each received card again before adding it to React state.
6. The server emits a terminal `done` or `error` event and closes the stream.

The API key and model configuration are read only by the server. The browser does not receive the Gemini API key.

## 2. Input validation and request limits

The shared schema defines these text limits:

| Rule | Behaviour |
| --- | --- |
| Minimum input | 3 characters after trimming |
| Maximum input | 8,000 JavaScript string-length units |
| Default card count | 10 |
| Server-side card count | Clamped to the range 3–15 |
| UI card-count choices | 5, 10, or 15 |
| Express JSON body limit | 100 KB |

The server returns a normal JSON HTTP error before starting SSE when the trimmed input is too short or too long:

- `400 empty_input`: asks the user to paste notes or enter a topic.
- `400 input_too_long`: asks the user to keep the notes within the configured limit.
- An oversized JSON request body is handled by Express and mapped to `input_too_long` with a 413 status.

The input field also shows a live character count and disables submission when the input is outside the client-side limits. Server validation remains authoritative.

## 3. Timeout policy

Each generation attempt has two independent server-side timers.

| Timer | Default | What it does |
| --- | ---: | --- |
| Idle timeout | 20 seconds | Aborts an attempt if no new text chunk arrives during the idle window. |
| Hard timeout | 45 seconds | Aborts an attempt once the total attempt duration reaches the cap, even if text is still arriving. |

The idle timeout is configurable with the root `.env` setting `IDLE_MS`. If it is not set to a usable positive number, the code falls back to 20,000 ms. The 45-second hard cap is currently a constant in `server/generate.js`, not an environment setting.

The idle timer is restarted whenever the provider/mock stream yields another text piece. The hard timer is not restarted. Both timers are cleared in the attempt's `finally` block, including after success, failure, timeout, or cancellation.

A timeout is represented as a provider-style `timeout` error with a user-facing message that the AI took too long to respond. It is eligible for the single retry only if no card has been accepted yet.

## 4. Retry policy

The server makes at most **two attempts total**: the initial attempt and, when eligible, one retry.

A retry is considered only when the first attempt accepted zero cards, and one of the following is true:

- The attempt completed without an error but produced no usable cards.
- The error code is one of `network`, `upstream`, or `timeout`.

Before retrying, the server sends an SSE `retry` event and appends an instruction to the prompt asking Gemini to return only the required JSON lines.

Important boundaries:

- The server does not retry after at least one valid card has arrived.
- Configuration, authentication, model-not-found, blocked-input, bad-request, rate-limit, and other non-retriable errors are not retried.
- The retry is attempted only once; it is not an unbounded loop.
- If both attempts produce no accepted cards and no more specific terminal provider error, the client receives `no_valid_cards`.

The UI displays a retrying status while the second attempt is underway.

## 5. Provider error mapping

The Gemini provider adapter converts upstream failures into a consistent `ProviderError` with a short code, a safe user-facing message, and optional diagnostic detail. Diagnostic detail is kept for server logs rather than sent as the user-facing message.

### HTTP response mapping

| Gemini HTTP response | Error code | App behaviour |
| --- | --- | --- |
| 400 | `bad_request` | Reports that the service rejected the request; check the key and model configuration. |
| 401 or 403 | `auth` | Reports that the API key was rejected. |
| 404 | `model_not_found` | Advises checking `GEMINI_MODEL`. |
| 429 | `rate_limited` | Advises waiting and trying again; this code is not in the automatic retry allow-list. |
| 5xx | `upstream` | Reports a temporary AI-service problem; eligible for retry if no cards were accepted. |
| Other status | `unknown` | Reports an unexpected provider response. |

### Other provider failures

| Condition | Error code | Handling |
| --- | --- | --- |
| Missing `GEMINI_API_KEY` or `GEMINI_MODEL` | `config` | Fails before the provider request; not automatically retried. |
| Fetch/network failure reaching Gemini | `network` | Converted to a safe connection message; retry-eligible when no cards were accepted. |
| Provider stream reports an error | `upstream` | Converted to a provider error. |
| Gemini prompt feedback or candidate finish reason indicates a safety block | `blocked` | Reports that the service declined or stopped processing the input; not automatically retried. |
| Unexpected server-side exception | `internal` | Returns a generic server message and retains diagnostic detail for server logs. |
| Server-side attempt timeout | `timeout` | Aborts the attempt; retry-eligible when no cards were accepted. |

The application does not expose raw provider response bodies as user-facing messages.

## 6. Model-output parsing and validation

The model is instructed to return exactly the requested number of JSON objects, one object per line. Each card must contain:

- `question`: non-empty text, at most 500 characters.
- `answer`: non-empty text, at most 500 characters.
- `distractors`: exactly three non-empty text options, each at most 500 characters.
- `explanation`: optional text, at most 500 characters; defaults to an empty string.

The shared Zod schema also checks that the answer and distractors are distinct after text normalization, and that a distractor does not contain the answer.

The stream parser:

- Buffers partial text until a newline completes a candidate line.
- Handles Windows and Unix line endings.
- Parses the final buffered line when the stream ends, even if it has no trailing newline.
- Ignores blank lines, ordinary introductory text, and code-fence lines that do not look like card objects.
- Skips malformed JSON and schema-invalid card objects, with a reason for each skipped candidate.
- Skips duplicate questions using normalized question text, so case and formatting differences do not trivially bypass duplicate detection.
- Tolerates a trailing comma after a JSON object by removing that final comma before parsing.
- Counts accepted and skipped candidates.

A valid card is sent as a `card` SSE event. Rejected candidates are reported through `skipped` events. The browser validates card payloads again before adding them to state.

**Known parser boundary:** the parser expects one complete JSON object per line. Two objects concatenated on the same line are not split or repaired. A truncated final JSON object is skipped as malformed input.

## 7. SSE event contract

The server uses these named events:

| Event | Purpose |
| --- | --- |
| `card` | Carries one schema-valid flashcard. |
| `skipped` | Reports a candidate line that was ignored, with a reason. |
| `retry` | Indicates that the server is starting its one permitted retry. |
| `error` | Carries an error code, safe message, and whether the result is partial. |
| `done` | Indicates successful completion and includes accepted/skipped counts. |

Before SSE headers are sent, request validation and JSON parsing errors use ordinary HTTP status codes and JSON bodies. Once the SSE response has started, the server cannot change the HTTP status; it reports generation failures as an SSE `error` event instead.

## 8. Client-side network and stream error handling

The browser's SSE client handles failures at several stages:

| Failure | Client error code | Behaviour |
| --- | --- | --- |
| Cannot reach the Express API | `network` | Shows a connection message and ends the client generator. |
| API responds with a non-success status or not an SSE content type | `http_<status>` or the server's JSON code | Reads a JSON error body when available; otherwise uses a safe fallback message. |
| SSE block contains malformed JSON | — | Ignores that block. |
| Unknown SSE event name | — | Ignores the event rather than crashing. |
| Card event has an invalid card shape | `skipped` client event | Does not add the invalid card to the UI. |
| Stream read fails after the response begins | `connection_lost` | Shows that the connection was interrupted. |
| Stream ends without a terminal `done` or `error` event | `connection_lost` | Reports that the connection ended before generation completed. |
| User/request abort | — | Preserves abort semantics; does not display it as an ordinary failure. |

If the server reports an error after cards have arrived, the cards remain in the deck. The error banner explains that the received cards are still available and provides retry/dismiss actions where applicable.

## 9. Cancellation and stale-response protection

Cancellation is handled on both sides:

- **Starting a new generation:** the React hook aborts the previous request before starting the next one.
- **Stop button:** aborts the active browser request. Cards already received remain in the UI.
- **Opening a saved session:** aborts any active generation before loading the selected session.
- **Leaving the page:** the generation hook aborts its active request during effect cleanup.
- **Browser disconnect:** the server observes the closed response and aborts the active Gemini/mock request.
- **Server timeout:** the server aborts the provider request using an `AbortController`.

The reducer associates stream events with a monotonically increasing request ID. Events from an older request are ignored, preventing a late card, completion, or error from overwriting the state of a newer request.

## 10. UI states and recovery

The app exposes the following generation states:

- **Idle:** the initial empty state provides example topics/notes.
- **Loading:** a skeleton card and live status message appear while the request starts or the retry is running.
- **Streaming:** accepted cards are added as they arrive; the status reports the number received so far.
- **Done:** the completed deck is available, with the number of accepted cards and skipped candidates.
- **Error:** an actionable error banner appears. If partial cards exist, they remain available beneath the banner.

The error banner supports dismissing the message without deleting already received cards. Retry is hidden for the two input errors that cannot be fixed by repeating the same request: `empty_input` and `input_too_long`.

The quiz is locked while generation is in progress. The user can switch between flashcards and quiz after generation is no longer busy.

## 11. Saved-session persistence safeguards

Completed AI generations with at least one valid card are automatically saved in the browser's local storage. Opening an existing saved session does not create another copy.

The session layer includes these safeguards:

- Uses a versioned storage envelope (`STORAGE_VERSION = 1`).
- Keeps at most 20 sessions and at most 100 cards per session.
- Validates stored cards against the shared Zod schema when reading.
- Drops invalid cards and sessions that contain no usable cards.
- Repairs missing/duplicate card IDs and duplicate session IDs.
- Repairs invalid timestamps and empty titles.
- Handles unavailable, blocked, full, malformed, or unsupported-version browser storage without crashing the app.
- Shows a notice when saved data cannot be read or a write/delete operation fails.
- Listens for the browser `storage` event to refresh the list when another tab changes saved sessions.

Sessions are local to the browser profile; they are not synced to an account or across devices. Quiz progress and quiz history are not persisted as part of a saved session.

## 12. Quiz behaviour

The quiz is generated from the accepted flashcards:

- Question order is shuffled.
- The four answer options (one correct answer and three distractors) are shuffled independently.
- A question can be answered only once in a round.
- The UI shows whether the selected answer is correct and displays the explanation when one exists.
- The results view shows the score and the questions answered incorrectly.
- A missed-question retest shuffles the missed questions and reshuffles their options.
- The user can restart the full quiz.

The quiz reducer keeps round history while the quiz component remains mounted. Switching between flashcards and quiz hides one view rather than unmounting it, so the current quiz progress is retained while switching modes.

## 13. Development-only mock streams

Mock streams let the developer exercise generation and error states without making Gemini requests. They are disabled unless the server environment contains:

```dotenv
ALLOW_MOCK=1
```

In the Vite development environment, append a supported mode to the page URL, for example `?mock=messy`.

| Mock mode | What it exercises |
| --- | --- |
| `good` | Valid cards and successful completion. |
| `slow` | Slower incremental delivery. |
| `messy` | Introductory text, code fences, malformed JSON, invalid shape, trailing comma, and duplicate question handling. |
| `flaky` | An unusable first attempt followed by valid cards on retry. |
| `empty` | Empty output and the no-valid-cards retry path. |
| `hang` | Idle/hard timeout and abort behaviour. |
| `stall` | Partial cards followed by a stalled stream, exercising idle timeout with partial progress. |
| `dies` | Partial cards followed by an upstream error; verifies partial-result handling without retry. |
| `ratelimit` | Rate-limit error mapping and non-retry behaviour. |

Mock mode is for local development and demonstrations only. Do not enable it in a public deployment.

## 14. Accessibility and responsive behaviour

The UI includes several usability and accessibility details:

- Responsive layout rules for screens at or below 520px.
- Reduced-motion CSS support for users who prefer less animation.
- A live region for generation status updates.
- An alert role for generation errors and status roles for quiz feedback/session notices.
- Focus moves to the current quiz question when the question changes.
- Flashcard navigation supports the Left and Right arrow keys.
- The notes form supports Ctrl+Enter (Cmd+Enter on macOS) to submit.

## 15. Operational notes and limitations

- The backend requires a valid Gemini API key and model ID for live generation.
- The hard timeout is currently fixed at 45 seconds in code; only the idle timeout is configurable.
- Rate-limit errors are shown to the user but are not automatically retried.
- Automatic retry is intentionally conservative and only happens once, before any valid card has been accepted, for empty output or the selected transient error codes.
- Schema validation checks structure and option consistency, not factual correctness.
- The JSON-lines parser does not repair multiple card objects on one line.
- Saved data depends on browser local storage and can be lost if browser data is cleared.
- There is no user authentication, cloud session sync, or production process manager in this project.

## Relevant implementation files

- `server/index.js` — Express setup, health endpoint, JSON body limit, and HTTP error middleware.
- `server/generate.js` — input checks, SSE lifecycle, idle/hard timeouts, cancellation, retry policy, and partial-result reporting.
- `server/provider.js` — Gemini request, provider stream parsing, and provider error mapping.
- `server/parseStream.js` — line buffering, JSON parsing, schema validation, duplicate detection, and skipped-line reasons.
- `server/prompt.js` — structured JSON-lines prompt.
- `server/mock.js` — development-only stream and failure simulations.
- `shared/schema.js` — shared card schema and input limits.
- `client/src/lib/api.js` — browser SSE parsing, HTTP/network/stream error handling, and client-side card validation.
- `client/src/hooks/useGeneration.js` and `client/src/hooks/generationReducer.js` — request cancellation and stale-event protection.
- `client/src/lib/sessions.js` and `client/src/hooks/useSessions.js` — local persistence and storage recovery.
- `client/src/lib/quiz.js` and `client/src/hooks/useQuiz.js` — quiz generation, scoring, and retest state.
