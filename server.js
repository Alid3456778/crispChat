const express = require("express");
const path = require("path");
const crypto = require("crypto"); // built-in Node.js, no install needed

const app = express();
const PORT = 6728;

const CRISP_SECRET_KEY = "YOUR_CRISP_HMAC_SECRET"; // from Crisp dashboard

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Endpoint: frontend calls this with the user's email
app.get("/auth", (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ error: "Email required" });

  // Generate HMAC token — this is what Crisp uses to verify identity
  const token = crypto
    .createHmac("sha256", CRISP_SECRET_KEY)
    .update(email)
    .digest("hex");

  res.json({ email, token });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});