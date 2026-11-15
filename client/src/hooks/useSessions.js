import { useCallback, useEffect, useState } from "react";
import {
  addSession,
  createSession,
  MAX_SESSIONS,
  readSessions,
  STORAGE_KEY,
  writeSessions,
} from "../lib/sessions.js";

function noticeFor(result) {
  if (result.status === "unavailable") {
    return "Saving isn't available in this browser, so your sessions won't be kept.";
  }
  if (result.status === "unreadable") {
    return "Your saved sessions couldn't be read, so they were skipped.";
  }
  if (result.dropped > 0) {
    const n = result.dropped;
    return `${n} saved session${n === 1 ? "" : "s"} could not be read and ${n === 1 ? "was" : "were"} skipped.`;
  }
  return null;
}

export function useSessions() {
  const [loaded] = useState(readSessions); // read once, when the app starts
  const [sessions, setSessions] = useState(loaded.sessions);
  const [notice, setNotice] = useState(() => noticeFor(loaded));

  const save = useCallback((data) => {
    const current = readSessions(); // read again: another tab may have saved since we started
    const next = addSession(current.sessions, createSession(data), MAX_SESSIONS);
    if (writeSessions(next)) {
      setSessions(next);
      setNotice(null);
    } else {
      setNotice("Couldn't save this session. Browser storage may be full or blocked.");
    }
  }, []);

  const remove = useCallback((id) => {
    const current = readSessions();
    const next = current.sessions.filter((s) => s.id !== id);
    if (writeSessions(next)) {
      setSessions(next);
    } else {
      setNotice("Couldn't delete that session. Browser storage may be blocked.");
    }
  }, []);

  const dismissNotice = useCallback(() => setNotice(null), []);

  // Another tab changed the saved sessions: refresh our list. (This event never fires in the tab that wrote.)
  useEffect(() => {
    function onStorage(e) {
      if (e.key === STORAGE_KEY || e.key === null) setSessions(readSessions().sessions);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { sessions, notice, save, remove, dismissNotice };
}