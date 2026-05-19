require("dotenv").config();
const express  = require("express");
const path     = require("path");
const crypto   = require("crypto");
const fs       = require("fs");
const multer   = require("multer");
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

// Serve uploaded files (stored under ./public/uploads)
app.use("/uploads", express.static(path.join(__dirname, "public", "uploads")));

const uploadDir = path.join(__dirname, "public", "uploads");
try { fs.mkdirSync(uploadDir, { recursive: true }); } catch (_) {}

const upload = multer({
  storage: multer.diskStorage({
    destination: function (_req, _file, cb) {
      cb(null, uploadDir);
    },
    filename: function (_req, file, cb) {
      const safeBase = (file.originalname || "upload")
        .replace(/[^a-zA-Z0-9._-]+/g, "_")
        .slice(0, 80);
      const ext = path.extname(safeBase);
      const base = ext ? safeBase.slice(0, -ext.length) : safeBase;
      const unique = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
      cb(null, `${base || "file"}-${unique}${ext || ""}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Upload a file and return a public URL suitable for Crisp "file" messages
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const publicPath = `/uploads/${req.file.filename}`;
  const url = `${req.protocol}://${req.get("host")}${publicPath}`;
  res.json({
    url,
    name: req.file.originalname || req.file.filename,
    type: req.file.mimetype || "application/octet-stream"
  });
});

// ── HMAC auth token for Crisp identity ──────────────────────────────────────
app.get("/auth", (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ error: "Email required" });

  const secret = process.env.CRISP_SECRET_KEY || "";
  const token  = crypto.createHmac("sha256", secret).update(email).digest("hex");
  res.json({ email, token });
});


app.post("/api/get-or-create-user", async (req, res) => {

    try {

        const { email, name } = req.body;

        if (!email) {
            return res.status(400).json({
                error: "Email required"
            });
        }

        // Check existing visitor
        const existingUser = await pool.query(
            `
            SELECT * FROM visitors
            WHERE email = $1
            `,
            [email]
        );

        // EXISTING USER
        if (existingUser.rows.length > 0) {

            return res.json({
                success: true,
                visitor: existingUser.rows[0]
            });
        }

        // CREATE NEW USER
        const crispToken = crypto.randomUUID();

        const newUser = await pool.query(
            `
            INSERT INTO visitors
            (email, name, crisp_token)

            VALUES ($1, $2, $3)

            RETURNING *
            `,
            [
                email,
                name || "Guest",
                crispToken
            ]
        );

        return res.json({
            success: true,
            visitor: newUser.rows[0]
        });

    } catch (err) {

        console.error(err);

        return res.status(500).json({
            error: "Server error"
        });
    }
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
    if (event.event === "message:send") {
      const email   = event.data?.meta?.email || event.data?.user?.email;
      const session = event.data?.session_id;
      const from    = event.data?.from === "operator" ? "operator" : "customer";
      const msgType = event.data?.type;

      let message = null;

      if (msgType === "text") {
        message = event.data?.content;
      } else if (msgType === "file" && event.data?.content) {
        // Save file messages in the same [FILE] format used by the frontend
        const content = event.data.content;
        const name = content.name || "Attachment";
        const url  = content.url  || "";
        if (url) message = `[FILE] ${name} -> ${url}`;
      }

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