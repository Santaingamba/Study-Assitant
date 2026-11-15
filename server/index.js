// Load values from the root .env file into process.env.
import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateHandler } from "./generate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../client/dist");

// Create the Express app and turn incoming JSON request bodies into req.body.
const app = express();
// Reject very large JSON bodies before they reach a route.
app.use(express.json({ limit: "100kb" }));

// A simple endpoint that lets you check whether the server is running.
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// Pass card-generation requests to the handler that streams results back to the client.
app.post("/api/generate", generateHandler);

// In production, serve the compiled React app from this same service.
// During local development, Vite continues to serve the frontend separately.
if (process.env.NODE_ENV === "production") {
  app.use(express.static(clientDist));

  // Send the SPA entry point for browser routes, but never turn unknown API paths into HTML.
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(clientDist, "index.html"), (err) => {
      if (err) next(err);
    });
  });
}

// Handle errors from routes, static files, and JSON parsing.
app.use((err, req, res, next) => {
  // If a response has already started, let Express handle the error instead of sending a second response.
  if (res.headersSent) return next(err);
  // Express uses status 413 when the request body exceeds the JSON size limit.
  const tooBig = err.status === 413;
  res.status(err.status || 500).json({
    code: tooBig ? "input_too_long" : "bad_request",
    message: tooBig ? "That input is too large." : "The request could not be read.",
  });
});

// Use the configured port, or 3001 when PORT is not set.
const PORT = process.env.PORT || 3001;
// Start listening for HTTP requests.
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
