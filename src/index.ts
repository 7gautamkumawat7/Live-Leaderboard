import { handleScoreSubmit, handleGetLeaderboard } from "./routes/score";
import { redis } from "./db";

const PORT = Number(process.env.PORT) || 3000;

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (req.method === "POST" && url.pathname === "/score") {
      const res = await handleScoreSubmit(req);
      res.headers.set("Access-Control-Allow-Origin", "*");
      return res;
    }

    if (req.method === "GET" && url.pathname === "/leaderboard") {
      const res = await handleGetLeaderboard(req);
      res.headers.set("Access-Control-Allow-Origin", "*");
      return res;
    }

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const accept = req.headers.get("accept") || "";
      if (accept.includes("application/json") && url.pathname === "/") {
        return Response.json({
          status: "ok",
          services: {
            redis: redis.isOpen ? "connected" : "disconnected",
            postgres: "connected",
          },
          endpoints: [
            { method: "POST", path: "/score", body: "{ username: string, points: number }" },
            { method: "GET", path: "/leaderboard", query: "?limit=10" },
            { method: "GET", path: "/health" },
          ],
        });
      }

      const file = Bun.file("./public/index.html");
      if (await file.exists()) {
        return new Response(file, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
    }

    if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/api")) {
      return Response.json({
        status: "ok",
        services: {
          redis: redis.isOpen ? "connected" : "disconnected",
          postgres: "connected",
        },
        endpoints: [
          { method: "POST", path: "/score", body: "{ username: string, points: number }" },
          { method: "GET", path: "/leaderboard", query: "?limit=10" },
          { method: "GET", path: "/health" },
        ],
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Server listening on http://localhost:${PORT}`);