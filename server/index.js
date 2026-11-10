import "dotenv/config";
import express from "express";

const app = express();
app.use(express.json({ limit: "200kb" }));  //200kb as a limit for req body size

app.get("/api/ping", (req, res) => {    //server "live or not" status check
    res.json({ ok: true});
});

const PORT = process.env.PORT || 3001;  //fallback system for port if process.env.PORT is not available
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
