import { describe, expect, it } from "vitest";
import { LIMITS } from "../../../shared/schema.js";
import {
  addSession,
  createSession,
  MAX_SESSIONS,
  readSessions,
  STORAGE_KEY,
  titleFrom,
  writeSessions,
} from "./sessions.js";

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

const card = (n) => ({
  id: `id${n}`,
  question: `Question ${n}?`,
  answer: `A${n}`,
  distractors: [`x${n}`, `y${n}`, `z${n}`],
  explanation: "",
});

const make = (text, cardCount = 2) =>
  createSession({
    input: { text, count: 10 },
    cards: Array.from({ length: cardCount }, (_, i) => card(i + 1)),
    skipped: 0,
  });

const stored = (sessions, version = 1) => ({ [STORAGE_KEY]: JSON.stringify({ version, sessions }) });

describe("titleFrom", () => {
  it("uses the first line, with spaces tidied", () => {
    expect(titleFrom("Line one\nLine two")).toBe("Line one");
    expect(titleFrom("  lots   of    space  ")).toBe("lots of space");
  });

  it("falls back to a default title", () => {
    expect(titleFrom("   ")).toBe("Untitled session");
    expect(titleFrom(undefined)).toBe("Untitled session");
  });

  it("shortens long titles to 60 characters", () => {
    const title = titleFrom("A".repeat(100));
    expect(title).toHaveLength(60);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("readSessions", () => {
  it("reads nothing from empty storage", () => {
    expect(readSessions(fakeStorage())).toEqual({ sessions: [], dropped: 0, status: "ok" });
  });

  it("reports storage as unavailable instead of throwing", () => {
    expect(readSessions(null).status).toBe("unavailable");
    expect(readSessions({ getItem() { throw new Error("blocked"); } }).status).toBe("unavailable");
  });

  it("reports damaged JSON as unreadable", () => {
    const result = readSessions(fakeStorage({ [STORAGE_KEY]: "{not json" }));
    expect(result.status).toBe("unreadable");
    expect(result.sessions).toEqual([]);
  });

  it("reports an unknown format version as unreadable", () => {
    expect(readSessions(fakeStorage(stored([make("x")], 2))).status).toBe("unreadable");
  });

  it("reports a wrong top-level shape as unreadable", () => {
    expect(readSessions(fakeStorage(stored("nope"))).status).toBe("unreadable");
  });

  it("keeps good sessions and drops unusable ones", () => {
    const badCards = { ...make("Bad cards"), cards: [{ ...card(1), distractors: ["only", "two"] }] };
    const noCards = { ...make("No cards"), cards: [] };
    const result = readSessions(fakeStorage(stored([make("Good session"), badCards, noCards, 42])));
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].title).toBe("Good session");
    expect(result.dropped).toBe(3);
  });

  it("removes only the broken cards of a session and keeps the rest", () => {
    const mixed = { ...make("Mixed"), cards: [card(1), { ...card(2), distractors: ["only", "two"] }, card(3)] };
    const [session] = readSessions(fakeStorage(stored([mixed]))).sessions;
    expect(session.cards.map((c) => c.id)).toEqual(["id1", "id3"]);
  });

  it("repairs missing and duplicate ids, trims text, and drops unknown fields", () => {
    const messy = {
      ...make("Repair me"),
      cards: [
        { ...card(1), id: undefined },
        { ...card(2), id: "dup" },
        { ...card(3), id: "dup" },
        { ...card(4), question: "  Padded?  ", extra: "gone" },
      ],
    };
    const [session] = readSessions(fakeStorage(stored([messy]))).sessions;
    const ids = session.cards.map((c) => c.id);
    expect(session.cards).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    expect(ids[0].startsWith("r")).toBe(true);
    expect(ids[1]).toBe("dup");
    expect(session.cards[3].question).toBe("Padded?");
    expect("extra" in session.cards[3]).toBe(false);
  });

  it("gives sessions with duplicate ids separate ids", () => {
    const a = make("A");
    const b = { ...make("B"), id: a.id };
    const { sessions } = readSessions(fakeStorage(stored([a, b])));
    expect(sessions).toHaveLength(2);
    expect(sessions[0].id).not.toBe(sessions[1].id);
  });

  it("repairs an invalid date and an empty title", () => {
    const broken = { ...make("Some notes here"), createdAt: "yesterday", title: "" };
    const [session] = readSessions(fakeStorage(stored([broken]))).sessions;
    expect(typeof session.createdAt).toBe("number");
    expect(session.title).toBe("Some notes here");
  });

  it("applies its limits: 20 sessions, 100 cards each", () => {
    const many = Array.from({ length: 25 }, (_, i) => make(`S${i}`));
    expect(readSessions(fakeStorage(stored(many))).sessions).toHaveLength(MAX_SESSIONS);

    const huge = { ...make("Huge"), cards: Array.from({ length: 150 }, (_, i) => card(i + 1)) };
    const [session] = readSessions(fakeStorage(stored([huge]))).sessions;
    expect(session.cards).toHaveLength(100);
  });
});

describe("writeSessions", () => {
  it("writes versioned data and reads it back, newest first", () => {
    const storage = fakeStorage();
    let list = addSession([], make("First notes"));
    list = addSession(list, make("Second notes"));
    expect(writeSessions(list, storage)).toBe(true);
    expect(JSON.parse(storage.getItem(STORAGE_KEY)).version).toBe(1);
    expect(readSessions(storage).sessions.map((s) => s.title)).toEqual(["Second notes", "First notes"]);
  });

  it("returns false instead of throwing when storage is full or missing", () => {
    expect(writeSessions([], { setItem() { throw new Error("QuotaExceededError"); } })).toBe(false);
    expect(writeSessions([], null)).toBe(false);
  });
});

describe("addSession and createSession", () => {
  it("puts the newest first and caps the list", () => {
    let list = [];
    for (let i = 0; i < 5; i++) list = addSession(list, make(`S${i}`), 3);
    expect(list.map((s) => s.title)).toEqual(["S4", "S3", "S2"]);
  });

  it("replaces a session with the same id instead of duplicating it", () => {
    const first = make("One");
    const other = make("Two");
    const list = addSession(addSession([], first), other);
    const again = addSession(list, { ...first, title: "One (updated)" });
    expect(again).toHaveLength(2);
    expect(again[0].title).toBe("One (updated)");
  });

  it("cuts very long notes down to the input limit and builds the title from them", () => {
    const session = createSession({
      input: { text: `Photosynthesis\n${"x".repeat(LIMITS.maxInput + 500)}`, count: 5 },
      cards: [card(1)],
      skipped: 0,
    });
    expect(session.input.text.length).toBe(LIMITS.maxInput);
    expect(session.title).toBe("Photosynthesis");
    expect(session.id.startsWith("s")).toBe(true);
  });
});