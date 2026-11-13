// Give provider failures a safe message for the app and separate details for server logs.
export class ProviderError extends Error{
    constructor(code, message, detail = ""){
        super(message);
        this.name = "ProviderError";
        this.code = code;       // A short label that code can check, such as "auth".
        this.detail = detail;   // Raw provider info; keep this in server logs, not user responses.
    }
}

// Turn an HTTP status into a useful, app-friendly error.
function errorFromStatus(status, detail){
    if(status === 429)
        return new ProviderError("rate_limited", "The AI service is busy or the free tier limit has been reached. Wait for a while and try again.", detail);
    if(status === 401 || status === 403)
        return new ProviderError("auth", "Ther server's API key was rejected.", detail);
    if(status === 404)
        return new ProviderError("model_not_found", "The AI model was not found. Check GEMINI_MODEL in .env", detail);
    if(status === 400)
        return new ProviderError("bad_request", "The service rejected the request. Check the API key and model name.", detail);
    if(status >=500)
        return new ProviderError("upstream", "The AI service had a problem. PLease try again.", detail);
    return new ProviderError("unknown", `Unexpected response from the AI service (${status}).`, detail);
}

// Read one parsed event from Gemini's stream and return any text it contains.
function readEvent(event){
    // Provider errors and safety blocks are different from ordinary text responses.
    if(event.error)
        throw new ProviderError("upstream", "The AI service reported an error.", JSON.stringify(event.error));
    if(event.promptFeedback?.blockReason)
        throw new ProviderError("blocked", "The AI service declined to process this input", event.promptFeedback.blockReason);
    
    // A response can contain no candidates; optional chaining avoids an error in that case.
    const candidate = event.candidates?.[0];
    if(!candidate) return "";

    if(candidate.finishReason === "SAFETY")
        throw new ProviderError("blocked", "The AI service stopped due to safety rules.", "finishReason = SAFETY");

    // Use an empty list when content or parts are missing, then keep only visible text parts.
    const parts = candidate.content?.parts ?? [];
    return parts.filter((p)=> typeof p.text === "string" && !p.thought).map((p)=> p.text).join("");
}

// Yield generated text a piece at a time instead of waiting for the whole answer.
export async function* streamGemini(prompt, { signal } = {}){
    // These values stay on the server; the API key should never be sent to the browser.
    const key = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL;
    // Stop before making a request if either required setting is missing.
    if(!key || !model)
        throw new ProviderError("config", "The server is missing API key or model");

    // Encode the model name so it is safe to place in the URL path.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;

    let res;
    try{
        // Send the prompt as JSON and pass through the signal so callers can cancel the request.
        res = await fetch(url, {
            method: "POST",
            headers: {"Content-Type": "application/json", "x-goog-api-key": key},
            body: JSON.stringify({
                contents: [{role: "user", parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
            }),
            signal,
        });
    } catch(err){
        // Keep cancellation recognizable; wrap other connection failures in our own error type.
        if (err.name === "AbortError") throw err;
        throw new ProviderError("network", "Could not reach the AI service.", String(err));
    }

    if(!res.ok){
        // Keep a short provider response detail for logs, then map the status to a safe error.
        const detail = (await res.text().catch(()=> "")).slice(0, 500);
        throw errorFromStatus(res.status, detail);
    }

    // TextDecoder handles characters that may be split across network chunks.
    const decoder = new TextDecoder();
    let buffer = "";

    // Read each network chunk as it arrives; a chunk may end halfway through an SSE line.
    for await (const bytes of res.body) {
        // Add this text to the saved fragment so a line split across chunks can be completed.
        buffer += decoder.decode(bytes, { stream: true });
        const lines = buffer.split("\n");
        // Keep the last piece because it may not be a complete line yet.
        buffer = lines.pop();

        // SSE sends event data on lines that begin with "data:"; other lines are metadata.
        for(const raw of lines){
            const line = raw.trim();
            if(!line.startsWith("data:")) continue;
            let event;
            try{
                // The text after "data:" is JSON for one provider event.
                event = JSON.parse(line.slice(5));
            }catch{
                // Ignore malformed event lines and continue reading the stream.
                continue;
            }
            const text = readEvent(event);
            // Yield only non-empty text; the caller can process it immediately.
            if(text) yield text;
        }
    }

}