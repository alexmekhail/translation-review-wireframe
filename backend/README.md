# Translation Review Backend

TypeScript + Fastify API over PostgreSQL for the reviewer MVP. Implements routes R1 and R3–R7 from the [Week 6 proposal](../docs/architecture/proposal.md); R2 runs inside R1 ([D7](../docs/decisions.md#d7-r2-folded-into-r1)).

## Boundary status

| Boundary | Status | Notes |
| --- | --- | --- |
| HTTP routes (`src/http/app.ts`) | **Real** | Fastify; tested in-process (`inject`) and over a real socket (`scripts/smoke.sh`) |
| Services (`src/services`) | **Real** | Book, draft, review |
| Storage (`src/storage`) | **Real** | PostgreSQL 16 via `pg`; tested against a real server |
| Original-file storage (`src/blob`) | **Simulated** | Local disk (`FsBlobStore`), memory in tests. Object storage not implemented ([D3](../docs/decisions.md#d3-originals-on-local-disk)) |
| Translation provider (`src/providers`) | **Simulated** | `FakeTranslationProvider`; no real engine ([D4](../docs/decisions.md#d4-fake-translation-provider)) |
| Identity (`src/auth`) | **Simulated** | Dev tokens `dev-alex`, `dev-sam`; not secure ([D1](../docs/decisions.md#d1-simulated-identity)) |
| Input parsing (`src/ingest`) | **Partial** | UTF-8 `.txt` only; `.docx`/`.pdf` → 415 ([D2](../docs/decisions.md#d2-only-utf-8-txt-is-parsed)) |
| Restart recovery for translation runs | **Unimplemented** | [D6](../docs/decisions.md#d6-in-process-translation-runs) |

## Prerequisites

- Node 18.18+ (tested on Node 22)
- PostgreSQL 13+ (tested on 16). Either a local install, or `docker compose up -d db` from the repo root after setting `POSTGRES_PASSWORD` (in your shell or a git-ignored root `.env`) (the compose file was written but **not run** in the environment where this was built: no Docker daemon there).

## Setup and run

```bash
cd backend
npm install
cp .env.example .env            # then edit if your Postgres differs
export $(grep -v '^#' .env | xargs)
npm run db:migrate              # applies src/storage/migrations/*.sql once each
npm run db:seed                 # creates the dev users for dev-alex / dev-sam
npm run dev                     # http://127.0.0.1:3000/api/v1
```

Try it:

```bash
curl -H 'Authorization: Bearer dev-alex' -F file=@test/fixtures/merchant.txt http://127.0.0.1:3000/api/v1/books
curl -H 'Authorization: Bearer dev-alex' http://127.0.0.1:3000/api/v1/books
./scripts/smoke.sh              # full scripted check against the running server
```

A paragraph containing `[fail-once]` fails its first (fake) translation, so you can try retry: upload `test/fixtures/merchant-fail-once.txt`.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | (required) | PostgreSQL connection string |
| `PORT`, `HOST` | `3000`, `127.0.0.1` | Listen address |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Allowed browser origins (the Vite dev server) |
| `BLOB_DIR` | `.data/blobs` | Where original uploads are written |
| `MAX_UPLOAD_BYTES` | `2097152` | Upload cap (413 above) |
| `MAX_PARAGRAPHS` | `1500` | Placeholder for the unresolved page limit ([D5](../docs/decisions.md#d5-paragraph-limit-instead-of-page-limit)) |
| `DEV_TOKENS` | `{"dev-alex":"alex@example.test","dev-sam":"sam@example.test"}` | Simulated identity map |
| `FAKE_FAIL_ONCE_MARKER` | `[fail-once]` | Fake-provider failure trigger |
| `LOG_LEVEL` | `info` | Request logs include a `reqId`, also returned as `x-request-id` |

`NODE_ENV=production` is refused at startup because identity is simulated.

## API contract (as implemented)

All under `/api/v1`. All except `/health` need `Authorization: Bearer <dev token>`. Errors are `{ "error": { "code", "message", ... } }`.

| Route | Method + path | Success | Failure cases |
| --- | --- | --- | --- |
| Health | `GET /health` | 200 `{status:"ok"}` | Startup check only; proves nothing about the workflow |
| R1 create | `POST /books` (multipart: `file`, optional `title`) | 201 `{id,title,pipeline_status,page_count,paragraph_count,created_at}`; translation starts in the background | 400 no file; 413 `file_too_large`; 415 `unsupported_type` / `format_not_implemented` / non-multipart; 422 `empty` / `no_arabic_text` / `invalid_encoding` / `over_limit` |
| R3 list | `GET /books` | 200 `{books:[{id,title,created_at,pipeline_status,completed_at,is_owner,paragraph_count,translated_count,done_count}]}`, newest first | Only books assigned to the caller |
| R4 read | `GET /books/:bookId` | 200 `{id,title,pipeline_status,completed_at,is_owner,created_at,paragraphs:[{id,position,source_ar,machine_en,translation_status,my_edit|null}]}`, `ORDER BY position` | 400 `invalid_id`; 404 not found or unassigned |
| R5 retry | `POST /books/:bookId/translations/retry` | 202 `{retried_count}` | 404; 409 `nothing_to_retry` unless the book is `failed` |
| R6 save | `PATCH /books/:bookId/paragraphs/:paragraphId/edits/me` body `{base_version, text_en?, is_done?}` | 200 `{text_en,is_done,version,updated_at}` | 400 validation; 404 paragraph not in this book or unassigned; 409 `not_translated`; 409 `version_conflict` with `current` |
| R7 complete | `PATCH /books/:bookId/assignments/me` body `{completed}` | 200 `{completed_at}` | 400; 404 |

`PATCH` is partial: send only what changed. `base_version: 0` means "I have no edit yet"; a mismatch returns the stored edit so the client can reconcile.

## Tests

```bash
export TEST_DATABASE_URL=postgres://postgres@localhost:5432/translation_review_test   # disposable!
npm run check            # type-check (src + tests), then every test
npm test                 # tests only
npm run test:unit        # no database needed
npm run test:component   # real PostgreSQL
npm run test:coverage
```

| Suite | Uses | Establishes | Does not establish |
| --- | --- | --- | --- |
| `test/unit` | Fakes only | Parsing, validation, draft orchestration, auth parsing | Anything about SQL or HTTP |
| `test/component/store` | Real PostgreSQL | Constraints, explicit ordering, rollback, access joins, per-reviewer rows | Service rules |
| `test/component/services` | Real PostgreSQL, memory blobs, fake provider | Save/re-read, conflicts, 404 rules, retry keeps edits, no orphaned blobs | Real object storage or engine |
| `test/component/http` | Fastify inject + real PostgreSQL | Status codes, bodies, multipart parsing, auth | Network, CORS in a browser |
| `scripts/smoke.sh` | Running server over a socket | The same journey end to end over real HTTP | Browser behavior |

Fixtures are synthetic: invented Arabic sentences from the wireframe's mock data with deliberately rough English. They are not reviewed by a qualified translator, so they say nothing about translation quality.
