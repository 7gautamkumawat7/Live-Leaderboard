import { sql, redis } from "../db";

interface ScorePayload {
  username?: string;
  points?: number;
}

export async function handleScoreSubmit(req: Request): Promise<Response> {
  let body: ScorePayload;
  try {
    body = (await req.json()) as ScorePayload;
  } catch {
    return Response.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  const { username, points } = body;
  const cleanUsername = typeof username === "string" ? username.trim() : "";

  if (!cleanUsername) {
    return Response.json({ error: "Username is required and cannot be blank" }, { status: 400 });
  }

  if (cleanUsername.length > 50) {
    return Response.json({ error: "Username cannot exceed 50 characters" }, { status: 400 });
  }

  if (typeof points !== "number" || !Number.isInteger(points) || points <= 0) {
    return Response.json({ error: "Points must be a positive integer" }, { status: 400 });
  }

  try {
    // 1. Persistent write to PostgreSQL (source of truth)
    const result = await sql<{ score: number }[]>`
      INSERT INTO leaderboard_users (username, score)
      VALUES (${cleanUsername}, ${points})
      ON CONFLICT (username) 
      DO UPDATE SET score = leaderboard_users.score + ${points}
      RETURNING score;
    `;

    const newTotalScore = result[0]?.score ?? points;

    // 2. Update Redis Sorted Set for fast ranking lookups
    if (redis.isOpen) {
      await redis.zAdd("global_leaderboard", {
        score: newTotalScore,
        value: cleanUsername,
      });
    } else {
      console.warn("[cache] Redis unavailable, score saved to database only");
    }

    return Response.json({
      success: true,
      username: cleanUsername,
      newTotalScore,
    });
  } catch (error) {
    console.error("Error submitting score:", error);
    return Response.json(
      { error: "Failed to submit score: " + (error as Error).message },
      { status: 500 }
    );
  }
}

export async function handleGetLeaderboard(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const limitParam = parseInt(url.searchParams.get("limit") || "10", 10);
    const limit = Math.min(Math.max(isNaN(limitParam) ? 10 : limitParam, 1), 100);

    // Fast path: retrieve from Redis Sorted Set
    if (redis.isOpen) {
      const topPlayers = await redis.zRangeWithScores("global_leaderboard", 0, limit - 1, {
        REV: true,
      });
      return Response.json({ leaderboard: topPlayers });
    }

    // Fallback: query database directly if cache is temporarily offline
    console.warn("[leaderboard] Cache unavailable, querying database fallback");
    const fallbackRows = await sql<{ value: string; score: number }[]>`
      SELECT username AS value, score
      FROM leaderboard_users
      ORDER BY score DESC
      LIMIT ${limit};
    `;

    return Response.json({ leaderboard: fallbackRows });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    return Response.json(
      { error: "Failed to fetch leaderboard: " + (error as Error).message },
      { status: 500 }
    );
  }
}