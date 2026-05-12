require("dotenv").config();

const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
});

async function test() {
  try {
    const res = await pool.query("SELECT NOW()");
    console.log("Connected!");
    console.log(res.rows[0]);
  } catch (err) {
    console.error(err);
  }
}

test();