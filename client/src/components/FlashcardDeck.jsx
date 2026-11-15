import { useState } from "react";

export default function FlashcardDeck({ cards }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const total = cards.length;
  if (total === 0) return null;

  const position = Math.min(index, total - 1); // cards can still be arriving
  const card = cards[position];

  function go(delta) {
    setIndex(Math.min(Math.max(position + delta, 0), total - 1));
    setFlipped(false);
  }

  function handleKeyDown(e) {
    if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
  }

  return (
    <section className="deck" onKeyDown={handleKeyDown} aria-label="Flashcards">
      <button
        type="button"
        className={flipped ? "flashcard flipped" : "flashcard"}
        onClick={() => setFlipped((f) => !f)}
      >
        <span className="flashcard-inner">
          <span className="face face-front" aria-hidden={flipped}>
            <span className="face-label">Question</span>
            <span>{card.question}</span>
            <span className="face-hint">Tap to see the answer</span>
          </span>
          <span className="face face-back" aria-hidden={!flipped}>
            <span className="face-label">Answer</span>
            <strong>{card.answer}</strong>
            {card.explanation && <span className="face-note">{card.explanation}</span>}
            <span className="face-hint">Tap to see the question</span>
          </span>
        </span>
      </button>

      <div className="deck-nav">
        <button
          type="button"
          className="secondary"
          onClick={() => go(-1)}
          aria-disabled={position === 0}
        >
          Previous
        </button>
        <span className="deck-count" aria-live="polite">
          {position + 1} of {total}
        </span>
        <button
          type="button"
          className="secondary"
          onClick={() => go(1)}
          aria-disabled={position === total - 1}
        >
          Next
        </button>
      </div>
    </section>
  );
}