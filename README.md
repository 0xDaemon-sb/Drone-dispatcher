# Blusalt Dispatch Controller

A REST API for registering medication-delivery drones, loading medication, querying availability, and auditing battery levels.

## Current status

The Express service connects to PostgreSQL using TypeORM and supports drone registration, transactional medication loading, battery queries, loaded medication queries, loading availability, and periodic battery audits. Versioned migrations define the schema, and an idempotent seed provides the initial fleet.

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

Open `http://localhost:3000/` for Swagger UI. It documents every API endpoint with request/response examples, validation rules, and error codes. Use **Try it out** to send requests to the same server; registration and loading calls persist real changes. The OpenAPI 3.0 specification is available at `http://localhost:3000/openapi.json` and can also be imported into Postman. Request definitions are generated from the existing Zod validators; no separate schema generator or annotation tool is required.

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
| GET | `/api/v1/drones/:serialNumber/battery-audits` | `200` with a page of audit records, newest first |
| GET | `/api/v1/drones/:serialNumber/medications` | `200` with an array of loaded medication items |
| POST | `/api/v1/drones/:serialNumber/medications` | `201` with an array of newly loaded medication items |

Register a drone:

```bash
curl -X POST http://localhost:3000/api/v1/drones \
  -H 'Content-Type: application/json' \
  -d '{"serialNumber":"CUSTOM-001","model":"Lightweight","weightLimit":200,"batteryCapacity":100}'
```

Registration requires all four fields. The model must be `Lightweight`, `Middleweight`, `Cruiserweight`, or `Heavyweight`; weight limit is an integer from 1 to 500 grams; battery is an integer from 0 to 100. Serial numbers are trimmed, must contain 1 to 100 characters, and are unique and case-sensitive. Additional fields, including `state` and `id`, are rejected. New drones always start in `IDLE`. The ten seeded drones are initial data, not a registration cap.

Availability means state `IDLE`, `LOADING`, or `LOADED`, battery at least 25%, and the sum of loaded medication weights strictly below the drone's weight limit. This allows adding another batch before delivery. Results are sorted by serial number; an availability query is informational and does not reserve capacity. The loading endpoint rechecks these conditions inside a transaction.

An empty registered drone returns `[]` for medications. Battery and medication queries for an unknown serial return `404` with code `DRONE_NOT_FOUND`. Duplicate registrations return `409` with code `DRONE_ALREADY_EXISTS`, including under concurrent requests. Invalid input returns `400` with code `VALIDATION_ERROR` and validation details. Errors share the JSON structure `{"error":{"code":"...","message":"..."}}`; the response header `x-request-id` correlates each request with its logs.

Load a medication batch:

```bash
curl -X POST http://localhost:3000/api/v1/drones/CUSTOM-001/medications \
  -H 'Content-Type: application/json' \
  -d '{"medications":[{"name":"Paracetamol_500","weight":50,"code":"PARA_500","image":"https://example.com/medications/paracetamol.png"}]}'
```

The body requires a non-empty `medications` array. Each item requires `name` (ASCII letters, digits, hyphen, underscore), `code` (uppercase ASCII letters, digits, underscore), a positive integer `weight` in grams, and an HTTP/HTTPS image URL. Additional fields are rejected. URLs are stored; this service does not fetch or host image files. Each item represents one medication package, so codes may repeat.

Loading uses a PostgreSQL transaction at `READ COMMITTED` isolation and locks the drone row before reading its current payload. It accepts `IDLE`, `LOADING`, or `LOADED` at battery 25% or higher; existing payload plus the entire batch must fit, including an exact-capacity load. All items are inserted and the state becomes `LOADED` together. A rejected or failed batch leaves existing payload and drone state unchanged. Concurrent loads for the same drone are serialized by the row lock. The response contains only the new items; GET medications returns all loaded items.

Loading returns `404 DRONE_NOT_FOUND` for an unknown drone, `409 DRONE_NOT_LOADABLE` for an ineligible state, `409 INSUFFICIENT_BATTERY` for battery below 25%, and `409 WEIGHT_LIMIT_EXCEEDED` for insufficient remaining capacity. Invalid batches return `400 VALIDATION_ERROR` before any database writes.

Every loading conflict includes an `error.details` object with `serialNumber`, current `state`, `allowedStates`, current `batteryCapacity`, `minimumBatteryCapacity`, `weightLimit`, `loadedWeight`, `remainingCapacity`, and `requestedWeight`. Battery values are percentages; all weights/capacities are grams. Remaining capacity is clamped to zero if existing data is already overweight. These values are read while holding the drone row lock and describe the failed attempt; later requests may change them. Validation errors continue to use an array of issues in `error.details`.

## Battery audits

The API starts a background task after it connects to PostgreSQL and opens its HTTP port. Set `BATTERY_AUDIT_INTERVAL_MS` to an integer from 1,000 to 2,147,483,647 milliseconds; the default is 60,000 (one minute). Compose forwards this setting from `.env`. The first audit runs after one interval, and later ticks are skipped while a prior audit is still running. This overlap guard applies within one API process; the local stack runs a single API instance.

Each run snapshots every drone's stored battery percentage and state in one atomic `INSERT ... SELECT`, with a shared database timestamp. An empty fleet creates no records. A failed batch leaves no partial history, logs an error, and is retried at the next scheduled tick. Successful runs are silent to keep development logs minimal. Hardware communication is out of scope, so the task records stored readings without simulating battery drain. On shutdown, the timer is cancelled and any active audit finishes before the database pool closes, subject to the service's ten-second shutdown deadline.

Retrieve history:

```bash
curl 'http://localhost:3000/api/v1/drones/BLU-001/battery-audits?limit=50&offset=0'
```

The response is an array of records with `id`, `droneId`, `batteryCapacity`, `state`, and `checkedAt`. Entries are sorted by `checkedAt` descending, then `id` descending for timestamp ties. `limit` defaults to 50 and must be from 1 to 100; `offset` defaults to zero and must be a non-negative integer. Invalid query parameters return `400 VALIDATION_ERROR`. A known drone without history returns `[]`; an unknown drone returns `404 DRONE_NOT_FOUND`.

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

Weights use integer grams; battery readings use integer percentages. PostgreSQL enforces serial uniqueness and length, model/state enums, positive weights, a maximum drone limit of 500g, battery ranges, medication name/code formats, and valid drone references. A LOADING drone must have at least 25% battery. The loading service enforces the aggregate payload weight rule transactionally.

## Quality checks

```bash
npm run check
```

This runs linting, TypeScript checking, tests, and a production build.

Database integration tests run separately against real PostgreSQL:

```bash
TEST_DATABASE_URL=postgresql://blusalt:blusalt@localhost:5432/blusalt npm run test:integration
```

The supplied local user needs `CREATEDB` permission (the Compose user has it). Each integration suite creates a uniquely named temporary database and deletes only that database afterward. Tests verify persistence, migrations, seed idempotency, request validation, concurrent registration conflicts, medication ownership, availability filtering, batch rollback, concurrent loading, and battery audit snapshots and history without changing development data. Scheduler tests use fake timers to verify intervals, overlap prevention, failure recovery, and shutdown without real waits.

## Project structure

Routes map URLs to controllers, controllers validate HTTP input, services apply business rules and own transactions, and repositories contain database queries. Repositories are small factory functions that accept an `EntityManager`; normal queries use `dataSource.manager`, while loading creates repositories with the transaction's manager. Row locking, payload reads, medication inserts, and state updates therefore stay on the same transaction connection. Battery history and atomic snapshot queries also live in their repository. No generic repository base classes are used.

```text
src/
  config/       Environment parsing and validation
  database/     TypeORM schemas, migrations, seed, and connection setup
  docs/         OpenAPI specification and examples
  jobs/         Background battery audit task
  lib/          Shared infrastructure
  middleware/   Express middleware and error handling
  modules/drones/ Routes, controllers, schemas, services, and repositories
  routes/       HTTP route definitions
  app.ts        Express application composition
  server.ts     Process entry point and shutdown handling
test/           HTTP and integration tests
compose.yaml    Local API and PostgreSQL stack
Dockerfile      Production API image
```
