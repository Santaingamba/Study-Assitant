// Load values from the root .env file into process.env.
import "dotenv/config";
import express from "express";
import { generateHandler } from "./generate.js";

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

// Handle errors from routes and JSON parsing. Keep this middleware after the routes.
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