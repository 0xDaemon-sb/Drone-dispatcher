# Blusalt Dispatch Controller

A REST API for registering medication-delivery drones, loading medication, querying availability, and auditing battery levels.

## Current status

The HTTP and TypeScript foundation is in place. Drone persistence and domain endpoints will be added in the next implementation slice.

## Prerequisites

Choose either:

- Docker Desktop with Docker Compose; or
- Node.js 22 or newer and npm 10 or newer for host-based development.

## Local development

```bash
cp .env.example .env
npm ci
npm run dev
```

The service listens on `http://localhost:3000` by default.

```bash
curl http://localhost:3000/health
```

The database variables are already present for the persistence layer that will be added in the next implementation slice.

## Run with Docker

Build and start the API and PostgreSQL:

```bash
docker compose up --build
```

The API is available at `http://localhost:3000`, and PostgreSQL is available at `localhost:5432`. Both ports can be overridden through `.env`.

Stop the containers without deleting database data:

```bash
docker compose down
```

The API image uses a multi-stage build and runs as the unprivileged `node` user. Both services include health checks, and the API waits for PostgreSQL to become healthy before starting.

## Quality checks

```bash
npm run check
```

This runs linting, TypeScript checking, tests, and a production build.

## Project structure

```text
src/
  config/       Environment parsing and validation
  lib/          Shared infrastructure
  middleware/   Express middleware and error handling
  routes/       HTTP route definitions
  app.ts        Express application composition
  server.ts     Process entry point and shutdown handling
test/           HTTP and integration tests
compose.yaml    Local API and PostgreSQL stack
Dockerfile      Production API image
```
