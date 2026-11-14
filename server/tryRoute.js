const text = process.argv[2] ?? "Photosynthesis: plants turn light, water and CO2 into sugar and oxygen.";
const abortAfterCards = Number(process.argv[3]) || 0;

const controller = new AbortController();
const res = await fetch("http://localhost:3001/api/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text, count: 5 }),
  signal: controller.signal,
});

console.log("HTTP", res.status, res.headers.get("content-type"));

if (!res.headers.get("content-type")?.includes("text/event-stream")) {
  console.log(await res.json());
  process.exit(0);
}

const decoder = new TextDecoder();
let buffer = "";
let cards = 0;

try {
  for await (const bytes of res.body) {
    buffer += decoder.decode(bytes, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop();

    for (const block of blocks) {
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = JSON.parse(/^data: (.*)$/m.exec(block)[1]);
      console.log(event.padEnd(8), event === "card" ? data.question : JSON.stringify(data));
      if (event === "card" && ++cards === abortAfterCards) {
        console.log("-- aborting now --");
        controller.abort();
      }
    }
  }
} catch (err) {
  if (err.name !== "AbortError") throw err;
}