# Blusalt Dispatch Controller

A REST API for registering medication-delivery drones, loading medication, querying availability, and auditing battery levels.

## Current status

The Express service connects to PostgreSQL using TypeORM and supports drone registration, battery queries, loaded medication queries, and loading availability. Versioned migrations define the schema, and an idempotent seed provides the initial fleet. Transactional medication loading and the battery scheduler are the next implementation slices.

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

## Drone API

| Method | Path | Response |
| --- | --- | --- |
| POST | `/api/v1/drones` | `201` with the registered drone |
| GET | `/api/v1/drones/available` | `200` with an array of eligible drones |
| GET | `/api/v1/drones/:serialNumber/battery` | `200` with `serialNumber` and `batteryCapacity` |
| GET | `/api/v1/drones/:serialNumber/medications` | `200` with an array of loaded medication items |

Register a drone:

```bash
curl -X POST http://localhost:3000/api/v1/drones \
  -H 'Content-Type: application/json' \
  -d '{"serialNumber":"CUSTOM-001","model":"Lightweight","weightLimit":200,"batteryCapacity":100}'
```

Registration requires all four fields. The model must be `Lightweight`, `Middleweight`, `Cruiserweight`, or `Heavyweight`; weight limit is an integer from 1 to 500 grams; battery is an integer from 0 to 100. Serial numbers are trimmed, must contain 1 to 100 characters, and are unique and case-sensitive. Additional fields, including `state` and `id`, are rejected. New drones always start in `IDLE`. The ten seeded drones are initial data, not a registration cap.

Availability means state `IDLE`, `LOADING`, or `LOADED`, battery at least 25%, and the sum of loaded medication weights strictly below the drone's weight limit. This allows adding another batch before delivery. Results are sorted by serial number; an availability query is informational and does not reserve capacity. The loading endpoint will recheck these conditions inside a transaction.

An empty registered drone returns `[]` for medications. Battery and medication queries for an unknown serial return `404` with code `DRONE_NOT_FOUND`. Duplicate registrations return `409` with code `DRONE_ALREADY_EXISTS`, including under concurrent requests. Invalid input returns `400` with code `VALIDATION_ERROR` and validation details. Errors share the JSON structure `{"error":{"code":"...","message":"..."}}`; the response header `x-request-id` correlates each request with its logs.

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
npm run db:revert        # Undo the latest migration
```

After `npm run build`, the compiled equivalents are `npm run db:migrate:production` and `npm run db:seed:production`. Automatic schema synchronization is disabled; schema changes must be captured in migrations.

The seed inserts 10 IDLE drones (`BLU-001` through `BLU-010`), covering all models and battery levels including 24% and 25%, plus three unassigned medication items. Stable UUIDs and conflict-safe inserts make reruns preserve changed batteries and loaded items. Medication `image` values are HTTP/HTTPS URLs stored as text. The seed uses illustrative `example.com` URLs, not hosted pictures; real medication-case image URLs belong in client input. A data migration converts the previous base64 seed placeholders while preserving custom images. Audit history starts empty and will be populated by the scheduler.

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

The supplied local user needs `CREATEDB` permission (the Compose user has it). Each integration suite creates a uniquely named temporary database and deletes only that database afterward. Tests verify persistence, migrations, seed idempotency, request validation, concurrent registration conflicts, medication ownership, and availability filtering without changing development data.

## Project structure

```text
src/
  config/       Environment parsing and validation
  database/     TypeORM schemas, migrations, seed, and connection setup
  lib/          Shared infrastructure
  middleware/   Express middleware and error handling
  modules/drones/ Routes, controllers, validation schemas, and service logic
  routes/       HTTP route definitions
  app.ts        Express application composition
  server.ts     Process entry point and shutdown handling
test/           HTTP and integration tests
compose.yaml    Local API and PostgreSQL stack
Dockerfile      Production API image
```
