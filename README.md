# Study Assistant

Turn your notes or a topic into interactive flashcards and a multiple-choice quiz.

Study Assistant uses a React frontend and a small Express backend. The backend sends the prompt to Gemini, streams the response to the browser, and parses and validates each card before the UI displays it.

## Features

- **Generate flashcards:** Paste notes or enter a topic and request 5, 10, or 15 cards.
- **Stream results:** Cards appear as they are generated instead of waiting for the complete response.
- **Flip and navigate:** Reveal answers and explanations, then move between cards.
- **Take a quiz:** Answer multiple-choice questions built from the generated cards.
- **Re-test mistakes:** Review only the questions answered incorrectly.
- **Save sessions:** Completed generations are saved in browser storage and can be reopened or deleted.
- **Handle unreliable model output:** Validate card structure, ignore irrelevant text, skip malformed or duplicate cards, report errors, and retry once when no usable card was received.
- **Test without API calls:** Optional mock streams simulate normal, malformed, slow, interrupted, empty, and rate-limited responses.

## Tech stack

- React 19 and Vite
- Node.js and Express
- Gemini API (server-side)
- Server-Sent Events (SSE) for streaming
- Zod for shared card-schema validation
- Vitest for automated tests

## Requirements

- Node.js **20.19.0 or newer**, or **22.12.0 or newer**. This matches the Vite version recorded in `client/package-lock.json`.
- npm
- A Gemini API key and a Gemini model ID for live generation

## Setup

Clone the repository and enter its directory:

```bash
git clone https://github.com/Santaingamba/Study-Assitant.git
cd Study-Assitant
```

Install dependencies from the repository root:

```bash
npm install
```

The root package's `postinstall` script also installs the client dependencies.

Create a local environment file:

**macOS / Linux**
```bash
cp .env.example .env
```

**Windows PowerShell**
```powershell
Copy-Item .env.example .env
```

Add your Gemini credentials and model ID to the root `.env` file:

```dotenv
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=your_available_gemini_model_id
PORT=3001
ALLOW_MOCK=0
IDLE_MS=20000
```

Keep `.env` private. It is ignored by Git and the API key is read only by the backend; do not put it in frontend code or commit it.

Start both the backend and frontend:

```bash
npm start
```

Open the Vite development URL shown in the terminal (normally [http://localhost:5173](http://localhost:5173)). The Express API listens on port 3001 by default. You can check it at [http://localhost:3001/api/health](http://localhost:3001/api/health).

The root command requested in the assignment is supported:

```bash
npm install && npm start
```

Run it after creating and configuring `.env`. If you leave `PORT` empty, the backend defaults to 3001.

## Usage

1. Paste study notes or enter a topic.
2. Choose 5, 10, or 15 cards.
3. Select **Generate cards**.
4. Flip cards to reveal answers and explanations, then use Previous and Next to navigate.
5. Switch to **Quiz** after generation finishes.
6. Answer each multiple-choice question. At the end, review the score and re-test missed questions.
7. Reopen or delete completed sessions from **Saved sessions**.

The application accepts input between 3 and 8,000 JavaScript string-length units. The backend defaults to a 20-second idle timeout and a 45-second hard limit per generation attempt. It retries once only when the first attempt produced no accepted cards and the result is retryable (or contained no usable cards).

## Development and tests

Run the automated test suite:

```bash
npm test
```

Create a production frontend build:

```bash
npm run build --prefix client
```

Run the frontend linter:

```bash
npm run lint --prefix client
```

## Mock streams (development only)

Mock mode helps test UI and failure handling without consuming Gemini API requests. It is disabled unless the backend environment contains:

```dotenv
ALLOW_MOCK=1
```

When running the Vite development server, add a supported mock name to the page URL. For example:

```text
http://localhost:5173/?mock=messy
```

Available modes:

| Mode | Behaviour |
| --- | --- |
| `good` | Streams valid sample cards |
| `slow` | Streams cards more slowly |
| `messy` | Mixes valid cards with chatter, malformed JSON, invalid shapes, and a duplicate |
| `flaky` | First response is unusable; the retry returns valid cards |
| `empty` | Completes without output |
| `hang` | Waits until the server timeout aborts it |
| `stall` | Sends some cards and then stops producing output |
| `dies` | Sends partial output and then raises an upstream error |
| `ratelimit` | Simulates a rate-limit error |

Mock mode is intended for local development and demonstrations. Do not enable it in a public deployment.

## How the AI output is handled

The model is instructed to return one JSON card per line. The server does not render raw model text as a chat transcript:

1. Gemini response text is streamed from the backend.
2. The parser buffers partial lines until a complete line is available.
3. Each candidate line is parsed as JSON and checked against the shared Zod card schema.
4. Malformed JSON, invalid card shapes, and duplicate questions are skipped.
5. Valid cards are sent to the browser as SSE `card` events.
6. The client validates incoming card data again before adding it to React state.

The server sends separate `retry`, `skipped`, `error`, and `done` events where appropriate. If an error occurs after some cards have arrived, those cards remain visible and the error is reported as a partial result.

## Project structure

```text
.
├── client/                 # React application and Vite configuration
│   └── src/
│       ├── components/     # Input, flashcards, quiz, errors, sessions
│       ├── hooks/          # Generation, quiz, and session state
│       └── lib/            # SSE client, quiz logic, session storage
├── server/
│   ├── index.js            # Express app and API routes
│   ├── generate.js         # Validation, streaming, timeouts, retry logic
│   ├── provider.js         # Gemini API integration
│   ├── prompt.js           # Structured-output prompt
│   ├── parseStream.js      # JSON-lines parser and card validation
│   └── mock.js             # Development-only mock streams
├── shared/
│   └── schema.js           # Shared Zod schema and input limits
├── .env.example
├── package.json
└── README.md
```

## AI usage

Claude and ChatGPT were used during development for implementation guidance, code explanations, debugging support, and ideas for edge cases and tests. AI suggestions were reviewed and adapted while building the application. The app treats model output as untrusted input and validates its structure before displaying cards.

## Known limitations

- Generated facts can still be incorrect or misleading. Schema validation checks the card's structure and option consistency, not factual truth.
- The parser expects one JSON object per line. It ignores ordinary introductory text and code fences, but two card objects combined on one line are not automatically repaired.
- Generation is limited by the configured idle and hard timeouts. A retry is attempted at most once and only when no valid cards were accepted in the first attempt.
- Saved sessions use the current browser's local storage. They are not synced across devices or accounts and may be unavailable if browser storage is blocked or cleared.
- The session store keeps at most 20 sessions and up to 100 cards per session.
- Authentication, cloud persistence, and a production deployment configuration are not included.
- The repository's `npm start` command starts the local development server and Vite dev server; it is not a production process manager.

## Demo recording

Add the link to the short screen recording here after uploading it.

## Time spent

**Update this value before submitting:** `[enter your actual total hours]`.

The assignment suggests aiming for approximately eight hours and asks that the actual time spent be reported honestly.
