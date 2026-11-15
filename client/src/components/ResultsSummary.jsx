export default function ResultsSummary({ state, onRetest, onRestart }) {
  const last = state.history[state.history.length - 1];
  const perfect = state.missed.length === 0;
  const n = state.missed.length;

  return (
    <section className="results">
      <h2>{state.round > 1 ? `Re-test round ${state.round} complete` : "Quiz complete"}</h2>
      <p className="score">
        You got {last.correct} of {last.total} right{perfect ? ". Perfect!" : "."}
      </p>

      {state.history.length > 1 && (
        <p className="muted">
          {state.history.map((h) => `Round ${h.round}: ${h.correct}/${h.total}`).join(" · ")}
        </p>
      )}

      {!perfect && (
        <>
          <h3>To review</h3>
          <ul className="missed-list">
            {state.missed.map((q) => (
              <li key={q.cardId} className="missed-item">
                <strong>{q.question}</strong>
                <div>Your answer: {q.options[q.picked]}</div>
                <div>Correct answer: {q.options[q.correctIndex]}</div>
                {q.explanation && <div className="muted">{q.explanation}</div>}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="results-actions">
        {!perfect && (
          <button type="button" onClick={onRetest}>
            Re-test {n} missed question{n === 1 ? "" : "s"}
          </button>
        )}
        <button type="button" className="secondary" onClick={onRestart}>
          Restart full quiz
        </button>
      </div>
    </section>
  );
}