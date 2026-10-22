# Blusalt Dispatch Controller

A REST API for registering medication-delivery drones, loading medication, querying availability, and auditing battery levels.

Built with Express, TypeScript, PostgreSQL, and TypeORM. It includes transactional medication loading, request IDs for debugging, Swagger documentation, Jest tests, and periodic battery snapshots. No drone hardware is required.

## Contents

- [Quick start with Docker (recommended)](#quick-start-with-docker-recommended)
- [Try the API](#try-the-api)
- [Stop, restart, and update](#stop-restart-and-update)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Local development](#local-development)
- [Tests and quality checks](#tests-and-quality-checks)
- [Drone API](#drone-api)
- [Battery audits](#battery-audits)
- [Database commands](#database-commands)
- [Project structure](#project-structure)
- [Contributing](#contributing)

## Quick start with Docker (recommended)

Docker runs both the API and its database in containers, so you do **not** need to install Node.js, npm, or PostgreSQL on your computer just to run the project.

### 1. Install the prerequisites

- [Git](https://git-scm.com/downloads), to download the source code. Alternatively, download and extract the repository ZIP from GitHub.
- [Docker Desktop](https://www.docker.com/products/docker-desktop/), which includes Docker Compose. On Linux, Docker Engine with the Compose v2 plugin also works.

Start Docker Desktop before continuing. Check that Docker and Compose are available:

```bash
docker --version
docker compose version
```

### 2. Download the project

```bash
git clone https://github.com/0xDaemon-sb/Drone-dispatcher.git
cd Drone-dispatcher
```

If you downloaded a ZIP, open a terminal in the extracted folder instead. Run all commands below from the project root: the folder containing `compose.yaml` and `package.json`.

### 3. Create your local configuration

On macOS, Linux, or Git Bash:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

This copies the example settings into a local `.env` file. Skip this step if you already have one; the default settings work for local use. Do not commit real credentials to Git.

### 4. Build and start

```bash
docker compose up -d --build --wait
```

The first run may take a few minutes while Docker downloads images and installs dependencies inside the image. `-d` leaves the containers running in the background; `--wait` waits for them to become healthy.

Compose automatically starts PostgreSQL, applies migrations (creates or updates the database tables), seeds missing example records, and starts the API. No separate npm, migration, or seed commands are needed for this path.

### 5. Check that it works

Open [Swagger UI](http://localhost:3000/) in your browser. This is the interactive API documentation, not a separate frontend application.

You can also open the [health endpoint](http://localhost:3000/health) or run:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{"status":"ok"}
```

Check container status with `docker compose ps`; both `api` and `database` should be healthy. `/health` confirms that the API process is responding, not that the database remains reachable continuously.

## Try the API

The database starts with ten example drones, `BLU-001` through `BLU-010`. Read the first drone's battery without creating any data:

```bash
curl http://localhost:3000/api/v1/drones/BLU-001/battery
```

On a fresh database, the response is:

```json
{"serialNumber":"BLU-001","batteryCapacity":100}
```

Then list drones eligible for loading:

```bash
curl http://localhost:3000/api/v1/drones/available
```

Prefer using your browser? In [Swagger UI](http://localhost:3000/), expand an endpoint, select **Try it out**, fill in any parameters, and select **Execute**. Registration and loading requests make real changes to your local database. See [Drone API](#drone-api) for complete examples and rules.

The [OpenAPI specification](http://localhost:3000/openapi.json) can also be imported into Postman. On Windows PowerShell, use `curl.exe` instead of `curl` for these examples, or use Swagger UI; the multiline shell examples below use Bash syntax.

## Stop, restart, and update

Stop and remove the containers without deleting database data:

```bash
docker compose down
```

Start them again:

```bash
docker compose up -d --wait
```

After updating the source code or changing `.env`, rebuild and start:

```bash
docker compose up -d --build --wait
```

Database data lives in a named Docker volume and survives these commands. Seeding preserves existing records; restarting does not reset your changes. Do not add `--volumes` (or `-v`) to `docker compose down` unless you intend to permanently delete this stack's database data.

View API logs:

```bash
docker compose logs -f api
```

Press `Ctrl+C` to stop following the logs; the containers keep running. To include database logs, omit `api`.

## Configuration

Defaults in `.env.example` are intended for local use, not a publicly exposed deployment.

| Setting | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | API port on your computer |
| `POSTGRES_PORT` | `5432` | PostgreSQL port on your computer |
| `POSTGRES_DB` | `blusalt` | Database name |
| `POSTGRES_USER` | `blusalt` | Local database user |
| `POSTGRES_PASSWORD` | `blusalt` | Local database password |
| `BATTERY_AUDIT_INTERVAL_MS` | `60000` | Time between battery snapshots, in milliseconds |
| `DATABASE_URL` | See `.env.example` | Database connection URL for the API running directly on your computer |
| `NODE_ENV` | `development` | Host development mode; Compose sets the API to `production` |
| `LOG_LEVEL` | `info` | Host log level; Compose sets the API to `info` |

Compose builds its own database connection URL using `database:5432` inside the Docker network; it does not use `.env`'s `DATABASE_URL`. For host development, update `DATABASE_URL` whenever you change `POSTGRES_PORT`, database credentials, or the database name.

For example, if ports 3000 and 5432 are occupied, set `PORT=3001` and `POSTGRES_PORT=5433` in `.env`, then run the rebuild/start command above. Open `http://localhost:3001/` instead. For host development, also update the port in `DATABASE_URL` to `5433`.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| `docker` is not found, or `docker compose` is unavailable | Install Docker Desktop or Docker Engine with the Compose v2 plugin, then reopen your terminal. Use `docker compose`, not the older `docker-compose` command. |
| Cannot connect to the Docker daemon | Start Docker Desktop, or ensure the Docker Engine service is running. |
| A port is already allocated | Change `PORT` or `POSTGRES_PORT` in `.env` as described above. |
| Startup fails or a container is unhealthy | Run `docker compose ps` and `docker compose logs --tail=100 api database`. The API cannot start until the database is ready and migrations succeed. |
| Database authentication fails after changing credentials | PostgreSQL credentials are initialized only when the database volume is first created. Changing `.env` does not change an existing database user's password. Restore the previous settings, or deliberately update the existing database credentials; do not delete the volume to fix this if you need its data. |
| Host API reports pending migrations | Run `npm run db:migrate` before `npm run dev`. Compose performs this step automatically. |
| Battery history returns an empty array | The first snapshot runs after one audit interval (one minute by default). |

If you need help, include the command you ran, relevant logs, your operating system, and Docker/Compose versions. Remove passwords and other secrets before sharing logs or configuration.

## Local development

Use this path when editing TypeScript and wanting the API to restart automatically as files change.

You need [Node.js 22 or newer](https://nodejs.org/en/download), npm 10 or newer, **and** Docker Compose for the database. PostgreSQL 17 installed separately is also an option; create a database and user yourself, set `DATABASE_URL`, and skip the database container command.

Download the project and create `.env` as shown in the quick start. If you previously started the full Docker stack, run `docker compose stop api` first so the container and host API do not compete for the same port. Only PostgreSQL needs to remain in Docker for this setup.

Then run:

```bash
npm ci
docker compose up -d --wait database
npm run db:migrate
npm run db:seed
npm run dev
```

`npm ci` installs the exact dependency versions recorded in `package-lock.json`. Keep this terminal open; press `Ctrl+C` to stop the development API. Swagger is available at [http://localhost:3000/](http://localhost:3000/).

To run the compiled application instead of the development watcher:

```bash
npm run build
npm start
```

Apply migrations and seed data first as above. The API connects to PostgreSQL and checks for pending migrations before opening its HTTP port. Startup fails if the database is unavailable or migrations are pending. Shutdown drains HTTP requests before closing the connection pool.

## Tests and quality checks

Tests use Jest. Install the host development dependencies with `npm ci` first; Node.js and npm are required for these commands even if you run the application in Docker. The runtime Docker image does not include test tooling.

Run unit and HTTP tests (no running database required):

```bash
npm test
```

Run linting, TypeScript checking, the same tests, and a production build:

```bash
npm run check
```

Database integration tests are separate and are **not** included in `npm run check`. They test the API against real PostgreSQL. Start the database and provide a test connection URL:

```bash
docker compose up -d --wait database
```

On macOS, Linux, or Git Bash (using the default database settings):

```bash
TEST_DATABASE_URL=postgresql://blusalt:blusalt@localhost:5432/blusalt npm run test:integration
```

On Windows PowerShell:

```powershell
$env:TEST_DATABASE_URL = "postgresql://blusalt:blusalt@localhost:5432/blusalt"
npm run test:integration
```

Adjust this URL if you changed the database settings. Use a local development database, never a production connection. The supplied user needs `CREATEDB` permission (the Compose user has it). Each integration suite creates a uniquely named temporary database and deletes only that database afterward, without changing development data.

Integration tests cover persistence, migrations, seed idempotency, request validation, concurrent registration conflicts, medication ownership, availability filtering, batch rollback, concurrent loading, and battery audit snapshots and history. Scheduler tests use fake timers to verify intervals, overlap prevention, failure recovery, and shutdown without real waits.

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

## Database commands

These commands require the host development dependencies and a configured `DATABASE_URL`. Normal Docker startup already migrates and seeds automatically.

```bash
npm run db:migrate       # Apply pending migrations
npm run db:seed          # Insert missing fixtures, preserving existing records
npm run db:revert        # Undo the latest migration
```

Reverting a migration can remove tables and data; use it only when you understand what the latest migration undoes.

After `npm run build`, the compiled equivalents are `npm run db:migrate:production` and `npm run db:seed:production`. Automatic schema synchronization is disabled; schema changes must be captured in migrations.

The seed inserts 10 IDLE drones (`BLU-001` through `BLU-010`), covering all models and battery levels including 24% and 25%, plus three unassigned medication items. Stable UUIDs and conflict-safe inserts make reruns preserve changed batteries and loaded items. Medication `image` values are HTTP/HTTPS URLs stored as text. The seed uses illustrative `example.com` URLs, not hosted pictures; real medication-case image URLs belong in client input. A data migration converts the previous base64 seed placeholders while preserving custom images. Audit history starts empty and will be populated by the scheduler.

Weights use integer grams; battery readings use integer percentages. PostgreSQL enforces serial uniqueness and length, model/state enums, positive weights, a maximum drone limit of 500g, battery ranges, medication name/code formats, and valid drone references. A LOADING drone must have at least 25% battery. The loading service enforces the aggregate payload weight rule transactionally.

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

The Docker image uses a multi-stage build and runs as the unprivileged `node` user. Both services include health checks. The Compose bootstrap is intended for single-instance local use; standalone image deployments should run migrations as a separate deployment step.

Swagger uses OpenAPI 3.0. Request definitions are generated from the existing Zod validators, so no separate schema generator or annotation tool is required.

## Contributing

Bug reports, documentation improvements, and focused pull requests are welcome. For a code contribution:

1. Fork the repository on GitHub and clone your fork.
2. Create a branch for your change: `git switch -c describe-your-change`.
3. Follow the [local development](#local-development) setup.
4. Keep changes focused, add or update tests, and update documentation when behavior changes.
5. Run `npm run check`; also run integration tests when changing database or API behavior.
6. Open a pull request explaining the change and how you tested it.

For bug reports, include reproduction steps, expected and actual behavior, and relevant logs with secrets removed.
