# Live Leaderboard Service

A fast, low-latency leaderboard service built with Bun, Redis Sorted Sets, and PostgreSQL.

## Overview

The service demonstrates a hybrid persistence and caching pattern commonly used in gaming and real-time ranking systems:

- **PostgreSQL** serves as the persistent source of truth. User records and total scores are written to the database using an upsert (`ON CONFLICT ... DO UPDATE`).
- **Redis Sorted Sets (`ZSET`)** serve as the in-memory ranking engine. Read queries (`GET /leaderboard`) fetch directly from Redis, providing fast responses without stressing the database with heavy sorting queries. If Redis is temporarily offline, the service falls back to direct database queries.

```
                    +-------------------+
                    |      Client       |
                    +---------+---------+
                              |
                     HTTP POST / GET
                              |
                              v
                    +-------------------+
                    |    Bun Server     |
                    |    (Port 3000)    |
                    +----+---------+----+
                         |         |
         POST /score     |         |  GET /leaderboard
         (Upsert)        |         |  (Fast cache read)
                         v         v
             +---------------+   +---------------+
             |  PostgreSQL   |   |     Redis     |
             |  (Port 5433)  |   |  (Port 6379)  |
             +---------------+   +---------------+
```

## Features

- **Sub-millisecond reads**: Sorted sets allow retrieving top players by score in `O(log(N) + M)` time.
- **Durable writes**: Scores are persisted in PostgreSQL before updating the cache.
- **Graceful degradation**: Automatic fallback to PostgreSQL queries if Redis is unavailable.
- **Cold start warm-up**: If the Redis cache is empty on startup, it automatically seeds itself with top players from PostgreSQL.
- **Built-in dashboard**: Interactive web UI at `http://localhost:3000` to monitor rankings, submit points, and track live activity.

## Project Structure

```
.
├── src/
│   ├── index.ts        # HTTP server entrypoint and routing
│   ├── db.ts           # Postgres & Redis client configuration
│   └── routes/
│       └── score.ts    # Score submission and leaderboard handlers
├── public/
│   └── index.html      # Real-time leaderboard dashboard
├── docker-compose.yml  # Local Redis and Postgres containers
├── .env.example        # Environment variable template
├── package.json
└── tsconfig.json
```

## Prerequisites

- [Bun](https://bun.sh/) (v1.0 or higher)
- [Docker](https://www.docker.com/) and Docker Compose

## Quick Start

### 1. Clone & install dependencies

```bash
bun install
```

### 2. Start PostgreSQL and Redis

Start the containerized databases using Docker Compose:

```bash
docker compose up -d
```

This launches:
- **Redis** on port `6379`
- **PostgreSQL** on port `5433` (`leaderboard_db`)

### 3. Configure environment variables

Copy the example configuration if needed:

```bash
cp .env.example .env
```

Default values in `.env`:
```env
PORT=3000
PG_HOST=localhost
PG_PORT=5433
PG_USER=postgres
PG_PASSWORD=@56aK1234
PG_DATABASE=leaderboard_db
REDIS_URL=redis://localhost:6379
```

### 4. Run the development server

```bash
bun dev
```

The server will start at `http://localhost:3000`.

To run without watch mode:

```bash
bun start
```

## API Reference

### Health Check

Checks service status and connectivity for Redis and Postgres.

- **Endpoint**: `GET /health`
- **Response** (`200 OK`):
```json
{
  "status": "ok",
  "services": {
    "redis": "connected",
    "postgres": "connected"
  }
}
```

### Submit / Increment Score

Adds points to a player's score. If the user does not exist, a new record is created. If they already exist, their score is incremented.

- **Endpoint**: `POST /score`
- **Headers**: `Content-Type: application/json`
- **Body**:
```json
{
  "username": "alex",
  "points": 150
}
```

**Example Request:**
```bash
curl -X POST http://localhost:3000/score \
  -H "Content-Type: application/json" \
  -d '{"username": "alex", "points": 150}'
```

**Response** (`200 OK`):
```json
{
  "success": true,
  "username": "alex",
  "newTotalScore": 150
}
```

### Get Leaderboard

Fetches top players ordered by score descending.

- **Endpoint**: `GET /leaderboard`
- **Query Parameters**:
  - `limit` *(optional, default: 10, max: 100)*: Number of top players to return.

**Example Request:**
```bash
curl "http://localhost:3000/leaderboard?limit=10"
```

**Response** (`200 OK`):
```json
{
  "leaderboard": [
    { "value": "alex", "score": 350 },
    { "value": "jordan", "score": 280 },
    { "value": "sam", "score": 190 }
  ]
}
```

## Web Dashboard

Visiting `http://localhost:3000` in a browser loads the built-in management interface:
- Live auto-polling rankings
- Score submission form with quick-fill point increments
- Search filter for usernames
- Live activity event log
- One-click sample test data seeding

## Database Management

To stop and remove database containers:

```bash
docker compose down
```

To stop containers and wipe persistent data volumes:

```bash
docker compose down -v
```


