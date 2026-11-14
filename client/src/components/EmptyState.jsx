const EXAMPLES = [
  {
    label: "Photosynthesis notes",
    text: "Photosynthesis: plants turn light, water and carbon dioxide into sugar and oxygen. It happens in the chloroplasts, where chlorophyll absorbs light. The light reactions make ATP and NADPH; the Calvin cycle uses them to build glucose.",
  },
  {
    label: "Just a topic",
    text: "How the internet works",
  },
  {
    label: "French Revolution",
    text: "The French Revolution began in 1789 with the storming of the Bastille. The monarchy was abolished in 1792, Louis XVI was executed in 1793, and the Reign of Terror followed under Robespierre. Napoleon took power in 1799.",
  },
];

export default function EmptyState({ onPick }) {
  return (
    <section className="empty-state">
      <h2>Turn anything into flashcards and a quiz</h2>
      <p>Paste your notes or type a topic above. Not sure? Try an example:</p>
      <div className="examples">
        {EXAMPLES.map((ex) => (
          <button key={ex.label} type="button" className="secondary" onClick={() => onPick(ex.text)}>
            {ex.label}
          </button>
        ))}
      </div>
    </section>
  );
}