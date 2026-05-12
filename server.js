const express = require("express");
const path = require("path");

const app = express();
const PORT = 6728;

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// // API to pass user data
// app.get("/user", (req, res) => {
//   const email = req.query.email || "guest@example.com";

//   res.json({
//     email: email,
//     name: email.split("@")[0]
//   });
// });

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});