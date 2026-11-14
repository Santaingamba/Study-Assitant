export default function ErrorBanner({ message, keptCards, onRetry, onDismiss }) {
  return (
    <div className="error-banner" role="alert">
      <p className="error-message">{message}</p>
      {keptCards > 0 && (
        <p className="error-note">
          The {keptCards} card{keptCards === 1 ? "" : "s"} that arrived before the problem
          {keptCards === 1 ? " is" : " are"} still below.
        </p>
      )}
      <div className="error-actions">
        {onRetry && (
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        )}
        <button type="button" className="secondary" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}