# TeleSpark Automation API

Production-ready backend-only **Telegram Automation API** designed for high-concurrency Telegram operations across dozens to hundreds of accounts.

Built with **Node.js, NestJS, TypeScript, PostgreSQL (Prisma), Redis (BullMQ), and MTProto (Python Telethon bridge)**.

---

## 1. Architectural Overview

TeleSpark is implemented as a high-performance **modular monolith**. The API layer, scheduler, account manager, failure manager, lease manager, and background queue workers run within the same deployable application, backed by PostgreSQL as the authoritative source of truth and Redis / BullMQ for queue coordination.

```text
                           CLIENT
                              |
                              v
                     +-------------------+
                     |    NestJS API     |
                     |                   |
                     | API Layer         |
                     | Task Manager      |
                     | Scheduler         |
                     | Account Manager   |
                     | Retry Manager     |
                     | Lease Manager     |
                     | Failure Manager   |
                     | Worker            |
                     +---------+---------+
                               |
                    +----------+----------+
                    |                     |
                    v                     v
             +-------------+       +-------------+
             |    Redis    |       | PostgreSQL  |
             |  BullMQ     |       | Source of   |
             | Task Queue  |       | Truth       |
             +------+------+       +-------------+
                    |
                    v
             Background Worker
                    |
                    v
           Telegram Integration
           Python + Telethon
                    |
                    v
                Telegram
```

---

## 2. Core Responsibilities Separation

* **Task Manager**: Decides *what needs to be done* and manages the task state machine.
* **Account Manager**: Decides *which account is eligible* using a 6-step selection algorithm balancing capabilities, health scores, and concurrency limits.
* **Scheduler**: Decides *which task should execute next* based on priority, scheduled time, and starvation aging.
* **Worker**: Executes assigned tasks, manages heartbeats, enforces lease ownership, and routes results.
* **Lease Manager**: Prevents stuck tasks and protects against duplicate execution by stale workers.
* **Failure Manager**: Classifies raw exceptions into standardized internal categories and enforces exponential backoff with jitter and account cooldowns.
* **PostgreSQL**: Authoritative, permanent source of truth for accounts, health metrics, tasks, attempts, leases, events, and bulk jobs.
* **Redis / BullMQ**: Fast distributed task queues, delayed jobs, retries, and worker coordination.

---

## 3. Technology Stack

* **Language & Framework**: Node.js v20+, NestJS v12, TypeScript
* **Database & ORM**: PostgreSQL 16+ with Prisma ORM v6
* **Job Queues**: Redis 7+ with BullMQ v6
* **Telegram MTProto Engine**: Python 3.10+ with Telethon / MTProto bridge
* **Documentation**: OpenAPI 3.0 / Swagger UI
* **Observability**: Winston structured JSON logging with request and task correlation IDs

---

## 4. Database Models

* `Tenant`: Isolated customer organization with unique API keys.
* `Account`: Telegram account credentials (session string, phone, username, apiId/apiHash), lifecycle status, concurrency limits, and active task count.
* `AccountCapability`: Fine-grained operational permissions (`canSendMessage`, `canReplyMessage`, `canComment`, `canReaction`, `canJoinChat`, `canLeaveChat`, `canForwardMessage`, etc.).
* `AccountHealth`: Success/failure counts, consecutive failures, health score (0–100), and flood wait / cooldown timers.
* `Task`: Operation payload, priority, state machine status, required capability, retry attempts, lease references, and completion metadata.
* `TaskAttempt`: Detailed execution history per attempt (worker ID, duration, status, raw error logs).
* `TaskLease`: Time-bounded distributed lease records with heartbeat renewals to prevent race conditions.
* `TaskEvent`: Comprehensive audit log of every task state transition.
* `Job`: Bulk operations decomposed into individual asynchronous tasks with progress tracking.

---

## 5. Task State Machine

Task transitions are strictly validated to prevent illegal state jumps:

```text
       CREATED
          |
          v
        QUEUED <----------------------------+
          |                                 |
          +-----------> WAITING_FOR_ACCOUNT |
          |                     |           |
          v                     v           |
      ASSIGNED -----------------+           |
          |                                 |
          v                                 |
       RUNNING                              |
          |                                 |
          +-----------> COMPLETED           |
          |                                 |
          +-----------> RETRY_WAIT ---------+
          |
          +-----------> REASSIGNABLE -------+
          |
          +-----------> FAILED
```

* **Cancellation**: Tasks in `CREATED`, `QUEUED`, `WAITING_FOR_ACCOUNT`, `RETRY_WAIT`, or `REASSIGNABLE` can be safely cancelled via `POST /api/v1/tasks/:id/cancel`.

---

## 6. Account Selection Algorithm

When a task requires an account, the Account Manager executes a deterministic 6-step filter and scoring pipeline:

1. **Capability Filter**: Selects accounts having the specific required capability (e.g. `canSendMessage`, `canGroupOperation`).
2. **Status Filter**: Excludes accounts in `RESTRICTED`, `DISABLED`, `REAUTH_REQUIRED`, `UNAVAILABLE`, or active `COOLDOWN` (automatically restoring accounts whose cooldown has elapsed).
3. **Concurrency Filter**: Excludes accounts where `currentTaskCount >= maxConcurrency`.
4. **Health & Workload Scoring**:
   $$\text{Score} = (\text{healthScore} \times 0.6) - \left(\frac{\text{currentTaskCount}}{\text{maxConcurrency}} \times 30\right) - (\text{consecutiveFailures} \times 10)$$
5. **Tie-Breaker**: Prefers accounts with oldest `lastSuccessAt` for fair round-robin distribution.
6. **Audited Assignment**: Records the deterministic reasoning in the task audit log.

---

## 7. Failure Classification & Retry Policies

Raw Telethon / MTProto exceptions are translated into standardized internal failure codes:

| Error Code | Classification | System Action |
| :--- | :--- | :--- |
| `ACCOUNT_RESTRICTED` | Fatal Account | Mark account `RESTRICTED`, set task `REASSIGNABLE`, re-enqueue task for another account |
| `ACCOUNT_SESSION_INVALID` / `AUTH_REQUIRED` | Fatal Account | Mark account `REAUTH_REQUIRED`, set task `REASSIGNABLE` |
| `FLOOD_WAIT` | Temporary Account | Set account in `COOLDOWN` for wait duration, set task `REASSIGNABLE` |
| `RATE_LIMITED` / `ACCOUNT_BUSY` | Temporary Account | Set account in `COOLDOWN` (default 300s), set task `REASSIGNABLE` |
| `NETWORK_ERROR` / `TIMEOUT` / `TEMPORARY_ERROR` | Retryable Task | Calculate exponential backoff with jitter, set task `RETRY_WAIT`, re-enqueue |
| `TARGET_NOT_FOUND` / `TARGET_PRIVATE` / `PERMISSION_DENIED` | Fatal Task | Permanently fail task as `FAILED` immediately (no retry) |
| `TASK_INVALID` | Fatal Task | Permanently fail task as `FAILED` immediately (no retry) |

### Exponential Backoff Formula
$$\text{Delay} = \min(\text{baseDelay} \times 2^{\text{attempt} - 1}, \text{maxDelay}) + \text{jitter}$$
* Default base delay: 2,000ms
* Default max delay: 60,000ms
* Jitter: 0–1,000ms randomized

---

## 8. Duplicate Execution Protection & Task Leases

* When a worker picks up a task, it acquires an exclusive **Task Lease** with an expiration window (default 30s).
* The worker heartbeats every 10s during execution to renew the lease.
* Before committing results to PostgreSQL, the worker **validates lease ownership**. If the lease expired and another worker took ownership, the stale worker's results are discarded.
* If a worker crashes, the Scheduler detects the expired lease, transitions the task to `REASSIGNABLE`, decrements account concurrency, and re-enqueues the task.

---

## 9. Quickstart & Local Setup

### Prerequisites
* **Node.js** v20+ and **npm** v10+
* **Docker** & **Docker Compose**
* **Python** 3.10+ (with `telethon` installed if running live MTProto sessions)

### Step 1: Start Infrastructure (PostgreSQL & Redis)
```bash
docker compose up -d
```

### Step 2: Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Key environment settings:
* `DATABASE_URL`: PostgreSQL connection string
* `REDIS_HOST` / `REDIS_PORT`: Redis queue endpoint
* `MASTER_API_KEY`: Default master API key for requests (`default-dev-api-key-12345`)
* `TELEGRAM_SIMULATION_MODE`: Set to `true` for development without live Telegram accounts, or `false` for live MTProto sessions.

### Step 3: Install Dependencies & Setup Database
```bash
npm install
npm run prisma:generate
npx prisma db push
```

### Step 4: Run the Backend
```bash
# Development mode
npm run start:dev

# Production build & run
npm run build
npm run start
```
* API Server: `http://localhost:3000/api/v1`
* Interactive Swagger Docs: `http://localhost:3000/docs`

---

## 10. Running the Test Suite

Run all unit and integration tests (Task State Machine, Retry Manager, Account Selection, Lease Manager, Worker Lifecycle, Tenant Isolation):
```bash
npm test
```

---

## 11. API Reference & Examples

All requests (except `/api/v1/health` and `/api/v1/tenants`) require the `x-api-key` header.

### 1. Register a Telegram Account
```bash
curl -X POST http://localhost:3000/api/v1/accounts \
  -H "Content-Type: application/json" \
  -H "x-api-key: default-dev-api-key-12345" \
  -d '{
    "phone": "+12025550143",
    "username": "tg_bot_account_1",
    "maxConcurrency": 1,
    "capabilities": {
      "canSendMessage": true,
      "canReplyMessage": true,
      "canComment": true,
      "canReaction": true
    }
  }'
```

### 2. Create and Enqueue a Task
```bash
curl -X POST http://localhost:3000/api/v1/tasks \
  -H "Content-Type: application/json" \
  -H "x-api-key: default-dev-api-key-12345" \
  -H "Idempotency-Key: task-unique-key-001" \
  -d '{
    "type": "SEND_MESSAGE",
    "priority": "HIGH",
    "payload": {
      "chatId": "@example_channel",
      "text": "Hello world from TeleSpark!"
    }
  }'
```

### 3. Check Task Status & Audit History
```bash
curl -X GET http://localhost:3000/api/v1/tasks/{taskId} \
  -H "x-api-key: default-dev-api-key-12345"
```

### 4. Create an Asynchronous Bulk Job
```bash
curl -X POST http://localhost:3000/api/v1/jobs \
  -H "Content-Type: application/json" \
  -H "x-api-key: default-dev-api-key-12345" \
  -d '{
    "type": "BULK_BROADCAST",
    "tasks": [
      {
        "type": "SEND_MESSAGE",
        "payload": { "chatId": "@user1", "text": "Announcement 1" }
      },
      {
        "type": "SEND_MESSAGE",
        "payload": { "chatId": "@user2", "text": "Announcement 2" }
      }
    ]
  }'
```

### 5. Check Bulk Job Progress
```bash
curl -X GET http://localhost:3000/api/v1/jobs/{jobId} \
  -H "x-api-key: default-dev-api-key-12345"
```

### 6. Health & Readiness Probes
```bash
# Liveness
curl -X GET http://localhost:3000/api/v1/health

# Readiness (verifies PostgreSQL and Redis/BullMQ connections)
curl -X GET http://localhost:3000/api/v1/health/ready
```

---

## 12. Project Structure

```text
├── src/
│   ├── main.ts                       # Application bootstrap, Swagger, and shutdown hooks
│   ├── app.module.ts                 # Root module wiring dependencies
│   ├── config/                       # Environment configuration & defaults
│   ├── common/
│   │   ├── constants/                # Error codes, event types, task types, queue names
│   │   ├── filters/                  # Global exception filter with structured error JSON
│   │   ├── interceptors/             # HTTP logging and duration metrics
│   │   └── logger/                   # Winston structured JSON logger
│   ├── database/                     # Prisma service and connection lifecycle
│   ├── auth/                         # Multi-tenant API key authentication guard
│   ├── tenant/                       # Tenant provisioning and isolation
│   ├── telegram/                     # TelegramTaskExecutor boundary & Python bridge
│   ├── failure/                      # Internal failure classification & severity
│   ├── retry/                        # Exponential backoff with jitter & max attempts
│   ├── lease/                        # Task leases, renewals, and stale worker recovery
│   ├── account/                      # Account management, health scoring, selection
│   ├── task/                         # Task state machine, CRUD, enqueuing, cancellation
│   ├── scheduler/                    # Periodic reconciliation and starvation protection
│   ├── job/                          # Bulk job decomposition and tracking
│   ├── worker/                       # BullMQ task processor & execution lifecycle
│   ├── health/                       # Liveness and readiness endpoints
│   └── api/                          # REST controllers for Tasks, Jobs, Accounts, Tenants
├── python/
│   ├── telegram_executor.py          # Python MTProto bridge (Telethon + Simulation mode)
│   └── requirements.txt              # Telethon, Pydantic, Cryptography
├── prisma/
│   └── schema.prisma                 # PostgreSQL schema with indices and constraints
├── test/                             # Unit & integration test suites
├── docker-compose.yml                # Local PostgreSQL and Redis setup
├── .env.example                      # Environment template
└── package.json
```
