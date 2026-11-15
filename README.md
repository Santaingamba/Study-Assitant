# Study Assistant

Turn your notes or a topic into interactive flashcards and a multiple-choice quiz.

## Live Demo

[https://study-assistant-2hjd.onrender.com](https://study-assistant-2hjd.onrender.com)


> ## 📱 FULL MOBILE DEVICE SUPPORT
>
> **Study Assistant is fully responsive and designed to work smoothly on mobile phones and tablets, as well as desktop computers.**
>
> You can use the complete study experience directly from your mobile browser — no separate mobile app is required. The interface adapts to smaller screens, with flexible layouts, touch-friendly controls, readable form fields, and flashcards, quizzes, and saved sessions that fit mobile screens.
>
> **Whether you're studying on an Android phone, an iPhone, or a tablet, you can generate flashcards, revise answers, take quizzes, retest mistakes, and access saved sessions on the go.**

Study Assistant uses a React frontend and a small Express backend. The backend sends the prompt to Gemini, streams the response to the browser, and parses and validates each card before the UI displays it.

## Features

- **Generate flashcards:** Paste notes or enter a topic and request 5, 10, or 15 cards.
- **Stream results:** Cards appear as they are generated instead of waiting for the complete response.
- **Flip and navigate:** Reveal answers and explanations, then move between cards.
- **Take a quiz:** Answer multiple-choice questions built from the generated cards.
- **Re-test mistakes:** Review only the questions answered incorrectly.
- **Save sessions:** Completed generations are saved in browser storage and can be reopened or deleted.
- **Handle unreliable model output:** Validate card structure, ignore irrelevant text, skip malformed or duplicate cards, report errors, and retry once when no usable card was received.
- **Clear application states:** Show an initial empty state, a loading skeleton, live generation status, and actionable error messages with retry and dismiss options.
- **Safe request handling:** Cancel an earlier request when a new one starts, support manual stopping, and ignore stale events so an older response cannot overwrite newer results.
- **Keep partial progress:** Cards received before a stream or provider failure remain available while the error is displayed.
- **Responsive and accessible UI:** Adapt the interface for small screens, support flashcard arrow-key navigation, announce status updates, and move focus to new quiz questions.
- **Test without API calls:** Optional mock streams simulate normal, malformed, slow, interrupted, empty, hanging, stalled, upstream-failure, and rate-limited responses.

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

In the flashcard deck, use the **Left** and **Right** arrow keys to move between cards. You can also press **Ctrl+Enter** (or **Cmd+Enter** on macOS) in the notes field to submit.

The application accepts input between 3 and 8,000 JavaScript string-length units. The backend defaults to a 20-second idle timeout and a 45-second hard limit per generation attempt. It retries once only when the first attempt produced no accepted cards and the result is retryable (or contained no usable cards).

## Deploy to Render

The repository includes a Render Blueprint in `render.yaml` for deploying the React frontend and Express API together as one web service.

1. Push the repository to GitHub.
2. Sign in to [Render](https://render.com/) and choose **New → Blueprint**.
3. Connect the `Santaingamba/Study-Assitant` repository and deploy the Blueprint.
4. When prompted for the two secret environment variables, enter:
   - `GEMINI_API_KEY`: your Gemini API key.
   - `GEMINI_MODEL`: a model ID available to that API key.
5. Wait for the build and deployment to finish. Open the `*.onrender.com` URL shown by Render.
6. Check `/api/health` on that URL; it should return `{"ok":true}`.

The Blueprint sets `NODE_ENV=production`, disables mock mode, configures the idle timeout, builds the Vite app, and starts Express. Express serves the compiled frontend and the API from the same origin, so the client can keep using the relative `/api` endpoint. The Gemini key belongs in Render's environment settings only; never add it to the repository or a frontend variable.

**Free-instance note:** Render's free web services may spin down after inactivity. The first request after a spin-down can take longer while the service starts. Keep the app's API key private and review the current Render plan limits before relying on the service for a time-sensitive demo.

For local development, continue to use `npm start`. For a production-style local run, build the client and start only Express:

```bash
npm run build
NODE_ENV=production npm run start:prod
```

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

The server sends separate `retry`, `skipped`, `error`, and `done` events where appropriate. If an error occurs after some cards have arrived, those cards remain visible and the error is reported as a partial result. See [Features and Error Handling](./FEATURES_AND_ERROR_HANDLING.md) for the timeout policy, provider error mapping, cancellation behaviour, persistence safeguards, and the full failure-handling flow.

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
├── .node-version
├── render.yaml
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
- Authentication and cloud persistence are not included. Saved sessions remain in each visitor's browser storage.
- The repository's `npm start` command starts the local development server and Vite dev server; it is not a production process manager.

## Demo recording

Screen Recording Link: https://drive.google.com/file/d/1XMnoJeJ-dZPdsEweBH6FrjOJEWwIuhmr/view?usp=drive_link

## Time spent

**Approximately 9 hours** across November 10–15, reconstructed from development sessions, progress, and the original 23 development commits.

| Date | Work completed | Estimated time |
| --- | --- | ---: |
| **November 10** | Initial project setup: React/Vite client, Express server, npm scripts, and development workflow. | 45 min |
| **November 11** | Defined the flashcard data structure, added Zod validation, and built the prompt generator. | 1 hr |
| **November 13** | Integrated Gemini streaming, developed the line-by-line response parser, handled malformed JSON and duplicate cards, and mapped provider errors. | 2 hrs |
| **November 14** | Built the streaming API route and frontend integration, including SSE events, retries, timeouts, cancellation, mock provider modes, and generation state handling. | 2 hrs |
| **November 15** | Implemented the flashcard deck, quiz flow, results summary, missed-question retest, and study/quiz mode switching. | 1 hr 30 min |
| **November 15** | Added versioned session persistence, autosave and session reopening, automated tests, UI refinements, and a stale-response bug fix. | 1 hr 45 min |
|  | **Total estimated time** | **9 hrs** |

**Brief note:** The time above is an approximation, not an exact timesheet, because I did not track every work session. The assignment took longer than I initially expected as I had to learn and apply concepts such as SSE, Gemini streaming, incremental parsing, request cancellation, structured validation, and asynchronous React state. I also spent time testing edge cases, adding persistence and tests, and fixing bugs to make the application more reliable.
