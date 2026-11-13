import { CardSchema } from "../shared/schema.js";

export function createCardParser(){
    // Keep parsing state isolated for each incoming stream.
    let buffer = "";
    const seenQuestions = new Set();
    let accepted = 0;
    let skipped = 0;

    // Count rejected lines and return a consistent event for the caller.
    function skip(reason, line){
        skipped++;
        return { type: "skipped", reason, line};
    }

    // Parse and validate one complete line, returning an event when it matters.
    function handleLine(rawLine){
        // Trim surrounding whitespace, then apply the trailing comma-space cleanup pattern.
        const line = rawLine.trim().replace(/,$/,"");

        // Ignore blank lines, code fences, and other text that cannot be a card object.
        if(!line.includes("{")) return null;

        // JSON.parse throws for malformed input, so convert that failure into a skipped event.
        let data;
        try{
            data = JSON.parse(line);
        }catch{
            return skip("not a valid JSON", line);
        }

        // Validate the parsed value against the expected card shape.
        const result = CardSchema.safeParse(data);
        if(!result.success){
            // Format each Zod issue as "field.path: message" for a readable reason.
            const reason = result.error.issues.map(
                (i) => `${i.path.join(".") || "card"}: ${i.message}`
            ).join(";");
            return skip(reason, line);
        }

        // Normalize questions so duplicates differing only by letter case are rejected.
        const key = result.data.question.toLocaleLowerCase();
        if(seenQuestions.has(key)) return skip("duplicate question", line);
        seenQuestions.add(key);

        accepted++;
        return {type: "card", card: result.data};
    }

    function push(chunk){
    // Add this chunk to any fragment left over from the previous call.
    buffer+=chunk;
    const lines = buffer.split("\n");
    // The final piece may be incomplete; keep it until the next chunk arrives.
    buffer = lines.pop();
    // Ignore null results from non-card lines; retain card and skipped events.
    return lines.map(handleLine).filter(Boolean);
    }

    function end(){
        // The stream is finished, so parse its final line even if it had no newline.
        const last = buffer;
        buffer = "";
        const event = handleLine(last);
        
        // Return the final event together with the parser's totals.
        return {
            events: event ? [event] : [],
            accepted,
            skipped,
        };
    }

    return {push, end};
}


