require("dotenv").config();
const express  = require("express");
const path     = require("path");
const crypto   = require("crypto");
const { Pool } = require("pg");

const app  = express();
const PORT = 6728;

const pool = new Pool({
  host:     process.env.PG_HOST     || "localhost",
  port:     process.env.PG_PORT     || 5432,
  database: process.env.PG_DATABASE || "crispy",
  user:     process.env.PG_USER     || "postgres",
  password: process.env.PG_PASSWORD || "",
});

pool.connect()
  .then(() => console.log("✅ PostgreSQL connected to 'crispy'"))
  .catch(err => console.error("❌ DB connection error:", err.message));

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// ── HMAC auth token for Crisp identity ──────────────────────────────────────
app.get("/auth", (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ error: "Email required" });

  const secret = process.env.CRISP_SECRET_KEY || "";
  const token  = crypto.createHmac("sha256", secret).update(email).digest("hex");
  res.json({ email, token });
});

// ── Save a message ────────────────────────────────────────────────────────────
app.post("/messages", async (req, res) => {
  const { email, session_id, sender, message } = req.body;
  if (!email || !message) return res.status(400).json({ error: "Missing fields" });

  try {
    await pool.query(
      `INSERT INTO chat_messages (email, session_id, sender, message)
       VALUES ($1, $2, $3, $4)`,
      [email, session_id || null, sender || "customer", message]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Save message error:", err.message);
    res.status(500).json({ error: "DB error" });
  }
});

// ── Get chat history for an email ─────────────────────────────────────────────
app.get("/messages", async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: "Email required" });

  try {
    const result = await pool.query(
      `SELECT sender, message, created_at
       FROM chat_messages
       WHERE email = $1
       ORDER BY created_at ASC`,
      [email]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Fetch messages error:", err.message);
    res.status(500).json({ error: "DB error" });
  }
});

// ── Crisp Webhook — auto-saves operator replies ───────────────────────────────
app.post("/crisp-webhook", async (req, res) => {
  try {
    const event = req.body;
    if (event.event === "message:send" && event.data?.type === "text") {
      const email   = event.data?.meta?.email || event.data?.user?.email;
      const message = event.data?.content;
      const session = event.data?.session_id;
      const from    = event.data?.from === "operator" ? "operator" : "customer";

      if (email && message) {
        await pool.query(
          `INSERT INTO chat_messages (email, session_id, sender, message)
           VALUES ($1, $2, $3, $4)`,
          [email, session || null, from, message]
        );
      }
    }
  } catch (err) {
    console.error("Webhook error:", err.message);
  }
  res.sendStatus(200);
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));