import { useState } from "react";
import { LIMITS } from "../../../shared/schema.js";

export default function InputPanel({ value, onChange, onSubmit, onStop, busy }) {
  const [count, setCount] = useState(10);

  const tooShort = value.trim().length < LIMITS.minInput;
  const tooLong = value.length > LIMITS.maxInput;
  const canSubmit = !tooShort && !tooLong;

  function submit(e) {
    e.preventDefault();
    if (canSubmit) onSubmit(count);
  }

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submit(e);
  }

  return (
    <form className="input-panel" onSubmit={submit}>
      <label htmlFor="notes">Your notes or topic</label>
      <textarea
        id="notes"
        rows={6}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Paste your notes here, or just type a topic like “How vaccines work”"
        aria-describedby="notes-count"
      />
      <div className="input-row">
        <span id="notes-count" className={tooLong ? "count over" : "count"}>
          {value.length} / {LIMITS.maxInput}
          {tooLong && " – too long"}
        </span>
        <label className="count-select">
          Cards
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={15}>15</option>
          </select>
        </label>
        {busy && (
          <button type="button" className="secondary" onClick={onStop}>
            Stop
          </button>
        )}
        <button type="submit" disabled={!canSubmit}>
          {busy ? "Start over" : "Generate cards"}
        </button>
      </div>
    </form>
  );
}