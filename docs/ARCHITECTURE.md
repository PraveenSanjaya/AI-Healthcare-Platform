# Architecture

ClinicAssist is a single Next.js application (App Router) backed by PostgreSQL. There is no
separate API server: pages, server actions and a few route handlers all live in the same project.

## System overview

```mermaid
flowchart LR
  subgraph Browser
    UI[Pages and runner UI<br/>live PHI check]
  end
  subgraph Next["Next.js server"]
    Proxy[proxy.ts<br/>route access by role]
    Pages[Server components<br/>and server actions]
    Gen["/api/generate"]
    Exp["/api/export/[id]<br/>/api/audit/export"]
    Svc[Service layer<br/>lib/*/service.ts]
    Safety[lib/safety<br/>PHI detector]
    AI[lib/ai<br/>render, prompt, providers]
    Audit[lib/audit<br/>append-only repo]
  end
  DB[(PostgreSQL)]
  LLM[Anthropic API<br/>or mock provider]

  UI -->|HTTP| Proxy
  Proxy --> Pages
  Proxy --> Gen
  Proxy --> Exp
  Pages --> Svc
  Gen --> Safety
  Gen --> AI
  Gen --> Svc
  Exp --> Svc
  Svc --> DB
  Svc --> Audit
  Audit --> DB
  AI -->|stream| LLM
```

Layers, from the outside in:

- **`proxy.ts`** decides who may reach which path (`lib/auth/route-access.ts`). Signed-out API calls
  get a 401, signed-out pages redirect to `/login`, and a role that is too low gets a 403.
- **Services** (`lib/<area>/service.ts`) hold the rules (who sees which history, who may export,
  which settings a manager may change) and take their data access as an argument. Prisma
  repositories (`repo.ts`) implement those arguments; unit tests pass in fakes.
- **Security headers** are set for every response in `next.config.ts` (`lib/http/headers.ts`).

## Request flow for `/api/generate`

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant P as proxy.ts
  participant R as route.ts
  participant G as gate + handler
  participant S as PHI detector
  participant D as PostgreSQL
  participant L as LLM provider

  B->>P: POST /api/generate (JSON)
  P-->>B: 401 if signed out
  P->>R: signed in
  R->>R: read body with a 256 KB limit (413 if larger)
  R->>G: handleRequest(session, body)
  G->>G: validate body (zod), template and role access
  G->>D: reserve one rate-limit slot (advisory lock, atomic)
  D-->>G: reserved, or limit reached
  G-->>B: 429 with Retry-After when the limit is reached
  G->>G: render the template (missing variable is a 400)
  G->>S: scan every input
  S-->>G: findings
  alt findings and not an admin override
    G->>D: audit PHI_BLOCKED (types and counts only)
    G-->>B: 422 PHI_DETECTED
  else clean, or admin override with a reason
    opt override
      G->>D: audit PHI_OVERRIDE (with the reason)
    end
    G->>L: stream (system prompt + rendered prompt)
    L-->>B: NDJSON text lines
    G->>D: save Generation (inputs, prompt, output, tokens)
    G->>D: audit GENERATION_CREATED
    G-->>B: NDJSON done line with the generation id
  end
```

A body that contains `generationId` is a **refinement**; it goes through the same gate and PHI
check, and the model sees the original prompt, the answer and every earlier refinement. Saving a
refinement clears the review tick, because the text changed.

Copy and export of patient-facing drafts are blocked until the user records a review
(`reviewGenerationAction`). Export is also checked on the server (`/api/export/[id]`).

## Data model

```mermaid
erDiagram
  User ||--o{ Generation : creates
  User ||--o{ TemplateVersion : authors
  User ||--o{ Favorite : marks
  User ||--o{ AuditLog : "acts in"
  Category ||--o{ Template : groups
  Template ||--o{ TemplateVersion : "has versions"
  Template ||--o{ Favorite : "favourited as"
  Template |o--o| TemplateVersion : "current version"
  TemplateVersion ||--o{ Generation : "used by"
  Generation ||--o{ GenerationRefinement : refined_by

  User {
    string id PK
    string email UK
    string passwordHash
    enum role "STAFF | MANAGER | ADMIN"
    boolean active
  }
  Template {
    string id PK
    string slug UK
    enum audience "INTERNAL | PATIENT_FACING"
    string currentVersionId
    boolean archived
  }
  TemplateVersion {
    string id PK
    int version
    string role
    string task
    string context
    string constraints
    string outputFormat
    json variables
    int maxWords
  }
  Generation {
    string id PK
    json inputs
    string renderedPrompt
    string output
    string model
    int inputTokens
    int outputTokens
    boolean reviewed
  }
  AuditLog {
    string id PK
    string action
    string entityType
    json metadata "ids, counts, types only"
  }
  ClinicProfile {
    int id PK "always 1"
    string clinicName
    string emergencyNumber
  }
  RateLimitHit {
    string id PK
    string userId "no foreign key"
    datetime createdAt
  }
```

`ClinicProfile` is a single row. `RateLimitHit` has no foreign key on purpose, so the limiter never
blocks deleting a user. Indexes sit on every foreign key and on `createdAt`. The full field list is
in `prisma/schema.prisma`.

## Audit log

`lib/audit/repo.ts` exposes `create` and read queries only; there is no update, delete or upsert
anywhere in the application, and a unit test asserts it. `lib/audit/sanitize.ts` is the last line
of defence: it drops keys that look like raw content or secrets (inputs, outputs, prompts, text,
passwords, tokens, emails), caps string length and nesting, and runs the PHI redactor over any
string that slips through, so a draft, an email address or a phone number cannot end up in the log. Actions are listed in
`lib/audit/actions.ts`.

## Rate limit

Each accepted generate or refine request inserts one `RateLimitHit`. The count and the insert run in
one transaction under `pg_advisory_xact_lock(hashtext(userId))`, so concurrent requests from one
user are serialised and cannot slip past the limit. A test fires parallel reservations at the real
database and checks that exactly `limit` succeed.

## Providers

`lib/ai/providers` has a mock (deterministic, no network) and an Anthropic provider (streaming). The
choice comes from `LLM_PROVIDER`; the Anthropic provider falls back to the mock when no key is set.
