import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — copy .env.example to .env and fill it in.");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Managed Postgres (Supabase/Neon/Render) requires SSL; local dev usually doesn't.
  // rejectUnauthorized:false because these providers use certs not in Node's default CA bundle.
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});
