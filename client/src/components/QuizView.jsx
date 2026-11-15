import { useEffect, useRef } from "react";
import { useQuiz } from "../hooks/useQuiz.js";
import ResultsSummary from "./ResultsSummary.jsx";

export default function QuizView({ cards }) {
  const { state, start, answer, next, retestMissed } = useQuiz(cards);
  const headingRef = useRef(null);

  // Move focus to the new question, so keyboard and screen reader users aren't left behind
  useEffect(() => {
    if (state.status === "running") headingRef.current?.focus();
  }, [state.status, state.round, state.index]);

  if (state.status === "idle") {
    return (
      <section className="quiz-start">
        <h2>Ready for a quiz?</h2>
        <p>
          {cards.length} multiple-choice question{cards.length === 1 ? "" : "s"}. Anything you miss
          can be re-tested afterwards.
        </p>
        <button type="button" onClick={start}>
          Start quiz
        </button>
      </section>
    );
  }

  if (state.status === "finished") {
    return <ResultsSummary state={state} onRetest={retestMissed} onRestart={start} />;
  }

  const q = state.questions[state.index];
  const answered = state.selected !== null;
  const wasCorrect = state.selected === q.correctIndex;
  const isLast = state.index + 1 === state.questions.length;

  return (
        <section className="quiz" key={`${state.round}-${state.index}`}>
      <p className="quiz-progress">
        {state.round > 1 && `Re-test · `}Question {state.index + 1} of {state.questions.length}
      </p>
      <progress value={state.index + (answered ? 1 : 0)} max={state.questions.length} />

      <h2 ref={headingRef} tabIndex={-1}>
        {q.question}
      </h2>

      <ul className="options">
        {q.options.map((option, i) => {
          let className = "option";
          let tag = null;
          if (answered && i === q.correctIndex) {
            className += " correct";
            tag = "✓ Correct answer";
          } else if (answered && i === state.selected) {
            className += " wrong";
            tag = "✗ Your answer";
          }
          return (
            <li key={i}>
              <button
                type="button"
                className={className}
                aria-disabled={answered}
                onClick={() => answer(i)}
              >
                <span>{option}</span>
                {tag && <span className="tag">{tag}</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {answered && (
        <>
          <div className={wasCorrect ? "feedback good" : "feedback bad"} role="status">
            <strong>
              {wasCorrect ? "Correct!" : `Not quite. The answer is: ${q.options[q.correctIndex]}`}
            </strong>
            {q.explanation && <p>{q.explanation}</p>}
          </div>
          <button type="button" onClick={next} autoFocus>
            {isLast ? "See results" : "Next question"}
          </button>
        </>
      )}
    </section>
  );
}