import { useState } from "react";
import { useGeneration } from "./hooks/useGeneration.js";
import InputPanel from "./components/InputPanel.jsx";
import ErrorBanner from "./components/ErrorBanner.jsx";
import EmptyState from "./components/EmptyState.jsx";

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
  const { state, generate, cancel, dismissError } = useGeneration();

  const busy = state.status === "loading" || state.status === "streaming";
  const hasCards = state.cards.length > 0;
  const canRetry = state.input && !NO_RETRY.has(state.error?.code);

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

      <div className="status" aria-live="polite">
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

      {state.status === "loading" && <div className="spinner" role="status" aria-label="Loading" />}

      {/* TEMPORARY: replaced by FlashcardDeck and QuizView in step 6 */}
      {hasCards && (
        <ul className="temp-list">
          {state.cards.map((card) => (
            <li key={card.id}>
              <strong>{card.question}</strong>
              <div>{card.answer}</div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}