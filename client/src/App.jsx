import { useState } from "react";
import { useGeneration } from "./hooks/useGeneration.js";
import InputPanel from "./components/InputPanel.jsx";
import ErrorBanner from "./components/ErrorBanner.jsx";
import EmptyState from "./components/EmptyState.jsx";
import FlashcardDeck from "./components/FlashcardDeck.jsx";
import QuizView from "./components/QuizView.jsx";

const NO_RETRY = new Set(["empty_input", "input_too_long"]);

function statusText(state) {
  const n = state.cards.length;
  if (state.status === "loading") {
    return state.retrying ? "The first attempt didn't work. Trying once more…" : "Asking the AI…";
  }
  if (state.status === "streaming") return `${n} card${n === 1 ? "" : "s"} so far…`;
  if (state.status === "done" && n > 0) {
    const skipped = state.skipped > 0 ? ` · ${state.skipped} skipped` : "";
    return `${n} card${n === 1 ? "" : "s"} ready${skipped}`;
  }
  return "";
}

export default function App() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState("flashcards");
  const { state, generate, cancel, dismissError } = useGeneration();

  const busy = state.status === "loading" || state.status === "streaming";
  const hasCards = state.cards.length > 0;
  const canRetry = state.input && !NO_RETRY.has(state.error?.code);

  // Derived, not stored: while cards are arriving the quiz is locked,
  // so we always show flashcards. No effect or extra state needed.
  const activeMode = busy ? "flashcards" : mode;

  return (
    <main className="app">
      <header>
        <h1>Study assistant</h1>
        <p>Paste notes or a topic. Get flashcards and a quiz.</p>
      </header>

      <InputPanel
        value={text}
        onChange={setText}
        onSubmit={(count) => generate(text, count)}
        onStop={cancel}
        busy={busy}
      />

      <div className={busy ? "status busy" : "status"} aria-live="polite">
        {statusText(state)}
      </div>

      {state.error && (
        <ErrorBanner
          message={state.error.message}
          keptCards={state.cards.length}
          onRetry={canRetry ? () => generate(state.input.text, state.input.count) : null}
          onDismiss={dismissError}
        />
      )}

      {state.status === "idle" && !hasCards && !state.error && <EmptyState onPick={setText} />}

      {state.status === "loading" && (
        <div className="skeleton-card" aria-hidden="true">
          <span className="skeleton-line w30" />
          <span className="skeleton-line w90" />
          <span className="skeleton-line w60" />
        </div>
      )}

      {hasCards && (
        <section className="study">
          <div className="segmented" role="group" aria-label="Study mode">
            <button
              type="button"
              aria-pressed={activeMode === "flashcards"}
              onClick={() => setMode("flashcards")}
            >
              Flashcards
            </button>
            <button
              type="button"
              aria-pressed={activeMode === "quiz"}
              disabled={busy}
              title={busy ? "The quiz unlocks when all cards have arrived" : undefined}
              onClick={() => setMode("quiz")}
            >
              Quiz
            </button>
          </div>

          {/* Both stay mounted so switching tabs never loses your place or quiz progress */}
          <div hidden={activeMode !== "flashcards"}>
            <FlashcardDeck cards={state.cards} />
          </div>
          <div hidden={activeMode !== "quiz"}>
            <QuizView cards={state.cards} />
          </div>
        </section>
      )}
    </main>
  );
}