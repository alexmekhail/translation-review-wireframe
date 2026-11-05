# Agent Instructions

Arabic → English translation-review MVP: a React wireframe/client (repo root, `src/`) and a TypeScript backend (`backend/`). One reviewer per book today; the schema is built so more reviewers can be added later.

## Read first

- Product and design: [`docs/architecture/proposal.md`](docs/architecture/proposal.md) (schema, routes R1–R7).
- Why things are the way they are: [`docs/decisions.md`](docs/decisions.md). Don't silently reverse a decision there; propose a change instead.
- Plan and status: [`docs/plan/work-plan.md`](docs/plan/work-plan.md).

## Commands

```bash
# frontend (repo root)
npm install && npm run dev          # http://localhost:5173
npm run build                       # type-check + build

# backend
cd backend && npm install
export DATABASE_URL=postgres://postgres@localhost:5432/translation_review
npm run db:seed && npm run dev      # http://127.0.0.1:3000/api/v1
TEST_DATABASE_URL=postgres://postgres@localhost:5432/translation_review_test npm run check   # type-check + tests
```

`TEST_DATABASE_URL` must point at a disposable database: tests drop and recreate its schema.

## Rules

- Keep boundaries: HTTP (`backend/src/http`) → services (`backend/src/services`) → ports (`storage`, `blob`, `providers`). No SQL or business rules in routes; no HTTP types in services.
- Every query that reads or writes a book's content joins `book_assignment` for the caller. Unassigned → 404, never 403.
- Reading paragraphs always uses `ORDER BY position`.
- Never overwrite `paragraph.machine_en` from a reviewer action; reviewer text goes in `paragraph_edit`.
- Saves are compare-and-set on `version`; don't add a write path that skips it.
- Schema changes go in a new `backend/src/storage/migrations/NNN_*.sql`; never edit an applied migration.
- Label anything simulated as simulated (identity, provider, blob storage). Don't claim real integrations work.
- When a check fails, fix the code or record why the expectation changed. Don't weaken a test to make it pass.
- Every commit adds an entry to the changelog at the end of `README.md`.
