function formatWhen(timestamp) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
  } catch {
    return ""; // a damaged date must never break the list
  }
}

export default function SessionList({ sessions, notice, onDismissNotice, onOpen, onDelete }) {
  if (sessions.length === 0 && !notice) return null;

  function confirmDelete(session) {
    if (window.confirm(`Delete "${session.title}"? This can't be undone.`)) onDelete(session.id);
  }

  return (
    <section className="sessions" aria-label="Saved sessions">
      <h2>Saved sessions</h2>

      {notice && (
        <p className="notice" role="status">
          <span>{notice}</span>
          <button type="button" className="secondary" onClick={onDismissNotice}>
            Dismiss
          </button>
        </p>
      )}

      {sessions.length > 0 && (
        <ul className="session-list">
          {sessions.map((session) => (
            <li key={session.id} className="session-item">
              <div className="session-info">
                <strong>{session.title}</strong>
                <span className="muted">
                  {session.cards.length} card{session.cards.length === 1 ? "" : "s"} ·{" "}
                  {formatWhen(session.createdAt)}
                </span>
              </div>
              <div className="session-actions">
                <button
                  type="button"
                  className="secondary"
                  aria-label={`Open ${session.title}`}
                  onClick={() => onOpen(session)}
                >
                  Open
                </button>
                <button
                  type="button"
                  className="secondary"
                  aria-label={`Delete ${session.title}`}
                  onClick={() => confirmDelete(session)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}