import "dotenv/config";
import { streamGemini, ProviderError } from "./provider.js";
import { buildGeneratePrompt } from "./prompt.js";
import { createCardParser } from "./parseStream.js";

const notes = process.argv[2] ?? "Photosynthesis: plants turn light, water and CO2 into sugar and oxygen.";
const prompt = buildGeneratePrompt(notes, 5);
const parser = createCardParser();
const started = Date.now();
let pieces = 0;

try {
  for await (const piece of streamGemini(prompt)) {
    pieces++;
    console.log(`[+${Date.now() - started}ms] piece ${pieces} (${piece.length} chars): ${JSON.stringify(piece.slice(0, 40))}...`);
    for (const e of parser.push(piece)) {
      if (e.type === "card") console.log("   CARD   ->", e.card.question);
      else console.log("   SKIPPED->", e.reason);
    }
  }
  const final = parser.end();
  for (const e of final.events) console.log(e.type === "card" ? "   CARD   ->" : "   SKIPPED->", e.card?.question ?? e.reason);
  console.log(`\nDone in ${Date.now() - started}ms. pieces: ${pieces}, accepted: ${final.accepted}, skipped: ${final.skipped}`);
} catch (err) {
  if (err instanceof ProviderError) {
    console.log(`\nProviderError [${err.code}]: ${err.message}`);
    if (err.detail) console.log("  detail (server log only):", err.detail);
  } else {
    throw err;
  }
}