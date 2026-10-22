# Blusalt Dispatch Controller

A REST API for registering medication-delivery drones, loading medication, querying availability, and auditing battery levels.

## Current status

The Express service connects to PostgreSQL using TypeORM. Versioned migrations define drones, medications, and battery audit records, and an idempotent seed provides the initial fleet. Domain endpoints and the battery scheduler are the next implementation slice.

## Prerequisites

Choose either:

- Docker Desktop with Docker Compose; or
- Node.js 22 or newer and npm 10 or newer for host-based development.

## Local development

```bash
cp .env.example .env
npm ci
docker compose up -d --wait database
npm run db:migrate
npm run db:seed
npm run dev
```

The service listens on `http://localhost:3000` by default.

```bash
curl http://localhost:3000/health
```

`DATABASE_URL` configures the host process connection. If you change `POSTGRES_PORT`, database credentials, or the database name in `.env`, update `DATABASE_URL` to match. Compose constructs its own connection URL using the internal `database:5432` address. Container credentials default to `blusalt` for local development.

The API connects to PostgreSQL and checks for pending migrations before opening its HTTP port. Startup fails if the database is unavailable or migrations are pending. Shutdown drains HTTP requests before closing the connection pool. `/health` is a process liveness endpoint, not a continuous database readiness probe.

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

The API image uses a multi-stage build and runs as the unprivileged `node` user. Both services include health checks. Compose waits for PostgreSQL to become healthy, applies pending migrations, seeds missing fixture records, and starts the API. The Compose bootstrap is intended for this single-instance local challenge environment; standalone image deployments should run migrations as a separate deployment step.

## Database commands

```bash
npm run db:migrate       # Apply pending migrations
npm run db:seed          # Insert missing fixtures, preserving existing records
npm run db:revert        # Undo the latest migration (removes its tables and data)
```

After `npm run build`, the compiled equivalents are `npm run db:migrate:production` and `npm run db:seed:production`. Automatic schema synchronization is disabled; schema changes must be captured in migrations.

The seed inserts 10 IDLE drones (`BLU-001` through `BLU-010`), covering all models and battery levels including 24% and 25%, plus three unassigned medication items. Stable UUIDs and conflict-safe inserts make reruns preserve changed batteries and loaded items. The medication images are small PNG placeholders for fixtures; real medication-case pictures belong in client input. Audit history starts empty and will be populated by the scheduler.

Weights use integer grams; battery readings use integer percentages. PostgreSQL enforces serial uniqueness and length, model/state enums, positive weights, a maximum drone limit of 500g, battery ranges, medication name/code formats, and valid drone references. A LOADING drone must have at least 25% battery. The aggregate payload weight rule will be enforced transactionally by the loading service in the next slice.

## Quality checks

```bash
npm run check
```

This runs linting, TypeScript checking, tests, and a production build.

Database integration tests run separately against real PostgreSQL:

```bash
TEST_DATABASE_URL=postgresql://blusalt:blusalt@localhost:5432/blusalt npm run test:integration
```

The supplied local user needs `CREATEDB` permission (the Compose user has it). Tests create a uniquely named temporary database and delete only that database afterward. They verify migration consistency and rollback, database constraints, relations, audit persistence, and seed idempotency without changing development data.

## Project structure

```text
src/
  config/       Environment parsing and validation
  database/     TypeORM schemas, migrations, seed, and connection setup
  lib/          Shared infrastructure
  middleware/   Express middleware and error handling
  routes/       HTTP route definitions
  app.ts        Express application composition
  server.ts     Process entry point and shutdown handling
test/           HTTP and integration tests
compose.yaml    Local API and PostgreSQL stack
Dockerfile      Production API image
```
