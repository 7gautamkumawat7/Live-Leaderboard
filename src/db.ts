import postgres from "postgres";
import { createClient } from "redis";

const PG_HOST = process.env.PG_HOST || "localhost";
const PG_PORT = Number(process.env.PG_PORT) || 5433;
const PG_DATABASE = process.env.PG_DATABASE || "leaderboard_db";
const PG_USER = process.env.PG_USER || "postgres";
const PG_PASSWORD = process.env.PG_PASSWORD || "@56aK1234";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const sql = postgres({
  host: PG_HOST,
  port: PG_PORT,
  database: PG_DATABASE,
  username: PG_USER,
  password: PG_PASSWORD,
  onnotice: () => {}, // Suppress non-critical postgres notices
  connect_timeout: 5,
});

export const redis = createClient({
  url: REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 8) {
        return new Error("Redis reconnection limit reached");
      }
      return Math.min(retries * 250, 2000);
    },
  },
});

redis.on("error", (err) => {
  if (redis.isOpen) {
    console.error("[redis] Client error:", err.message);
  }
});

redis.on("reconnecting", () => {
  console.log("[redis] Reconnecting to server...");
});

redis.on("ready", () => {
  console.log("[redis] Connection established");
});

export async function warmLeaderboardCache() {
  if (!redis.isOpen) return;

  try {
    const cachedCount = await redis.zCard("global_leaderboard");
    if (cachedCount === 0) {
      const rows = await sql<{ username: string; score: number }[]>`
        SELECT username, score FROM leaderboard_users ORDER BY score DESC LIMIT 100
      `;

      if (rows.length > 0) {
        await redis.zAdd(
          "global_leaderboard",
          rows.map((row) => ({ score: row.score, value: row.username }))
        );
        console.log(`[cache] Populated leaderboard with ${rows.length} players from database`);
      }
    }
  } catch (err: any) {
    console.warn("[cache] Cache warm-up skipped:", err.message);
  }
}

export async function initStorage() {
  // Connect Redis
  try {
    await redis.connect();
    console.log(`[redis] Connected to ${REDIS_URL}`);
  } catch (err: any) {
    console.warn(`[redis] Connection failed (${REDIS_URL}):`, err.message);
  }

  // Ensure Postgres table exists
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS leaderboard_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        score INT DEFAULT 0
      );
    `;
    console.log(`[postgres] Connected to ${PG_HOST}:${PG_PORT}/${PG_DATABASE}`);
  } catch (err: any) {
    console.warn(`[postgres] Connection failed (${PG_HOST}:${PG_PORT}):`, err.message);
  }

  // Warm Redis cache if empty
  await warmLeaderboardCache();
}

// Kick off initialization
await initStorage();