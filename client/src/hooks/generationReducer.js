export const initialState = {
  status: "idle", // idle | loading | streaming | done | error
  requestId: 0,
  source: "ai",   // "ai" = just generated, "saved" = opened from the saved list (never auto-saved again)
  input: null,    // { text, count } of the latest request, kept for "Try again"
  cards: [],
  skipped: 0,
  retrying: false,
  error: null,    // { code, message, partial }
};

export function generationReducer(state, action) {
  // User actions and fresh starts don't belong to any stream, so they skip the stale check
  if (action.type === "start") {
    return { ...initialState, status: "loading", requestId: action.requestId, input: action.input };
  }
  if (action.type === "load") {
    return {
      ...initialState,
      status: "done",
      requestId: action.requestId,
      source: "saved",
      input: action.input,
      cards: action.cards,
      skipped: action.skipped,
    };
  }
  if (action.type === "reset") {
    return { ...initialState, requestId: action.requestId };
  }
  if (action.type === "cancel") {
    // Only meaningful while a request is running
    if (state.status !== "loading" && state.status !== "streaming") return state;
    return {
      ...state,
      requestId: action.requestId, // from now on, events of the cancelled stream are ignored
      status: state.cards.length > 0 ? "done" : "idle",
      retrying: false,
    };
  }
  if (action.type === "dismiss") {
    if (!state.error) return state;
    return { ...state, error: null, status: state.cards.length > 0 ? "done" : "idle" };
  }

  // Everything else comes from a stream. Ignore it if it's from an old request.
  if (action.requestId !== state.requestId) return state;

  switch (action.type) {
    case "card":
      return { ...state, status: "streaming", retrying: false, cards: [...state.cards, action.card] };
    case "skipped":
      return { ...state, skipped: state.skipped + 1 };
    case "retry":
      return { ...state, retrying: true };
    case "done":
      return { ...state, status: "done", retrying: false };
    case "error":
      return {
        ...state,
        status: "error",
        retrying: false,
        error: { code: action.code, message: action.message, partial: state.cards.length > 0 },
      };
    default:
      return state;
  }
}