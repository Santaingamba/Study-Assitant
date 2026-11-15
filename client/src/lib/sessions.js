import { CardSchema, LIMITS } from "../../../shared/schema.js";

export const STORAGE_KEY = "study-assistant:sessions";
export const STORAGE_VERSION = 1;
export const MAX_SESSIONS = 20;
const MAX_CARDS = 100;
const COUNTS = [5, 10, 15];

// Same idea as makeId in api.js. Not crypto.randomUUID, which fails on plain http (phone testing).
let idCounter = 0;
const newId = (prefix) =>
  `${prefix}${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

function defaultStorage() {
  try {
    return window.localStorage; // even reading this can throw when storage is blocked
  } catch {
    return null;
  }
}

export function titleFrom(text) {
  const firstLine = String(text ?? "").trim().split(/\r?\n/)[0] ?? "";
  const clean = firstLine.replace(/\s+/g, " ").trim();
  if (!clean) return "Untitled session";
  return clean.length > 60 ? `${clean.slice(0, 59).trimEnd()}…` : clean;
}

// Keep every card that passes the schema, repair its id if needed, drop the rest
function cleanCards(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of list.slice(0, MAX_CARDS)) {
    const parsed = CardSchema.safeParse(raw);
    if (!parsed.success) continue;
    let id = typeof raw?.id === "string" && raw.id.length > 0 && raw.id.length <= 64 ? raw.id : newId("r");
    if (seen.has(id)) id = newId("r"); // duplicate ids would break React keys
    seen.add(id);
    out.push({ id, ...parsed.data });
  }
  return out;
}

// Returns a clean session, or null if nothing usable is left
function cleanSession(raw) {
  if (!raw || typeof raw !== "object") return null;
  const cards = cleanCards(raw.cards);
  if (cards.length === 0) return null;

  const text = typeof raw.input?.text === "string" ? raw.input.text.slice(0, LIMITS.maxInput) : "";
  const count = COUNTS.includes(raw.input?.count) ? raw.input.count : 10;
  const createdAt = Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now();
  const skipped = Number.isInteger(raw.skipped) && raw.skipped >= 0 ? raw.skipped : 0;
  const id = typeof raw.id === "string" && raw.id.length > 0 && raw.id.length <= 64 ? raw.id : newId("s");
  const title =
    typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 80) : titleFrom(text);

  return { id, title, createdAt, input: { text, count }, cards, skipped };
}

// status: "ok" | "unavailable" (storage blocked) | "unreadable" (data damaged or wrong version)
export function readSessions(storage = defaultStorage()) {
  if (!storage) return { sessions: [], dropped: 0, status: "unavailable" };

  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { sessions: [], dropped: 0, status: "unavailable" };
  }
  if (raw == null) return { sessions: [], dropped: 0, status: "ok" };

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { sessions: [], dropped: 0, status: "unreadable" };
  }
  if (!data || data.version !== STORAGE_VERSION || !Array.isArray(data.sessions)) {
    return { sessions: [], dropped: 0, status: "unreadable" };
  }

  const sessions = [];
  const seen = new Set();
  let dropped = 0;
  for (const item of data.sessions) {
    const session = cleanSession(item);
    if (!session) {
      dropped++;
      continue;
    }
    if (seen.has(session.id)) session.id = newId("s");
    seen.add(session.id);
    sessions.push(session);
  }
  return { sessions: sessions.slice(0, MAX_SESSIONS), dropped, status: "ok" };
}

export function writeSessions(sessions, storage = defaultStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, sessions }));
    return true;
  } catch {
    return false; // storage full or blocked
  }
}

export function createSession({ input, cards, skipped }, now = Date.now()) {
  return {
    id: newId("s"),
    title: titleFrom(input.text),
    createdAt: now,
    input: { text: input.text.slice(0, LIMITS.maxInput), count: input.count },
    cards,
    skipped,
  };
}

// Newest first, no duplicates, capped
export function addSession(list, session, max = MAX_SESSIONS) {
  return [session, ...list.filter((s) => s.id !== session.id)].slice(0, max);
}