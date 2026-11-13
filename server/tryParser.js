import { createCardParser } from "./parseStream.js";

const card = (q, a) =>
  JSON.stringify({ question: q, answer: a, distractors: ["x", "y", "z"], explanation: "Because." });

const fakeModelText = [
  "Sure! Here are your cards:",                 // chatter
  "```json",                                    // code fence
  card("What is 2+2?", "4"),                    // good
  "{this is not json}",                         // broken JSON
  JSON.stringify({ question: "Only two options?", answer: "yes", distractors: ["a", "b"] }), // bad shape
  card("What is 3+3?", "6") + ",",              // trailing comma
  card(" WHAT is 2 + 2 ? ", "4"),               // duplicate despite case, spacing, and punctuation
  card("ＷＨＡＴ　ＩＳ ２＋２？", "4"),            // duplicate despite Unicode width differences
  "```",                                        // closing fence
  card("What is 5+5?", "10"),                   // last line, no newline after it
].join("\r\n");

const parser = createCardParser();
const events = [];

// Feed the text in awkward 17-character chunks, like a real stream would
for (let i = 0; i < fakeModelText.length; i += 17) {
  events.push(...parser.push(fakeModelText.slice(i, i + 17)));
}
const final = parser.end();
events.push(...final.events);

for (const e of events) {
  if (e.type === "card") console.log("CARD    ", e.card.question);
  else console.log("SKIPPED ", e.reason, " <-", e.line.slice(0, 35));
}
console.log(`\naccepted: ${final.accepted}, skipped: ${final.skipped}`);