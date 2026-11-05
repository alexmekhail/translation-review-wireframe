# Decision Record

Consequential design decisions, newest last. Each says what was decided, why, and what would change it. Agents: read this before changing a boundary (see [`AGENTS.md`](../AGENTS.md)).

| ID | Decision | Status |
| --- | --- | --- |
| D0 | PostgreSQL + object storage; per-reviewer `paragraph_edit` | Accepted (Week 6) |
| D1 | Simulated dev-token identity | Temporary |
| D2 | Only UTF-8 `.txt` is parsed | Temporary |
| D3 | Originals on local disk behind `BlobStore` | Temporary |
| D4 | Fake translation provider behind `TranslationProvider` | Temporary |
| D5 | Paragraph count stands in for the page limit | Temporary |
| D6 | In-process, non-durable translation runs | Temporary |
| D7 | R2 is a service step inside R1's transaction, not an HTTP route | Accepted (Week 7) |
| D8 | TypeScript + Fastify for the backend | Accepted (Week 7) |
| D9 | No token cache in the authenticator | Accepted (Week 7) |

## D0. PostgreSQL, object storage, per-reviewer edits (Week 6)

See [`architecture/proposal.md`](architecture/proposal.md). Source and machine text live on `paragraph`; each reviewer's correction lives in their own `paragraph_edit` row, so multiple reviewers (the crowdsourcing direction) is an additive change. Alex raised the crowdsourcing requirement; it changed the first draft.

## D1. Simulated identity

`Authorization: Bearer dev-alex` maps to a seeded user by email (`backend/src/auth/devAuth.ts`). It is not secure, and `loadConfig` refuses to start when `NODE_ENV=production`. **Changes when** an auth provider is chosen (open decision in the proposal): replace `DevTokenAuthenticator` with a verifier for that provider. Services only see a `Caller`, so nothing else changes.

## D2. Only UTF-8 .txt is parsed

The proposal accepts .docx, PDF and .txt. Week 7's brief says not to build a universal parser, so only `.txt` is implemented: paragraphs are separated by blank lines. `.docx` and `.pdf` return `415 format_not_implemented`, not a silent failure. **Changes when** real sample files are available to test a parser against.

## D3. Originals on local disk

The proposal puts originals in object storage. `FsBlobStore` writes under `BLOB_DIR` for development; `MemoryBlobStore` is used in tests. Both implement `BlobStore` (`put`, `delete`). **Changes when** a host is chosen: add an S3-compatible adapter.

## D4. Fake translation provider

The engine is undecided, and so is whether the texts may be sent to a third party. `FakeTranslationProvider` returns fixture drafts or `[draft] <source>`. It fails a paragraph once when it contains `[fail-once]`, so retry can be exercised. **Changes when** the engine and the data-sharing question are settled. **Not proven:** anything about real engine latency, errors, or quality.

## D5. Paragraph limit instead of page limit

"30 pages" has no agreed unit. `MAX_PARAGRAPHS` (default 1500) and `MAX_UPLOAD_BYTES` (default 2 MB) are enforced instead. These numbers are placeholders, not measurements.

## D6. In-process translation runs

Uploads start translation through `BackgroundTasks` in the same process. A crash or restart mid-run leaves the book in `translating` with some paragraphs still `pending`; there is no recovery job. Acceptable for a single-process dev MVP. **Changes when** the app is deployed with more than one instance or restarts matter: add a durable job table or queue.

## D7. R2 folded into R1

The proposal defined R2 (`POST /books/{id}/paragraphs`) as an internal route called by the upload pipeline. Implemented instead as part of the same database transaction that creates the book (`PgReviewStore.createBook`). Reason: two separate calls could leave a book with no paragraphs if the second failed, and an internal-only HTTP route would need service-to-service auth that doesn't exist yet. Observable behavior is the same: paragraphs exist, in order, as soon as R1 returns.

## D8. TypeScript + Fastify

Alex chose TypeScript, so frontend and backend share one language and the wireframe can become the client. The classroom reference uses C#/.NET; the boundaries (book, review, and draft services; storage and provider ports) follow the same shape. Fastify 4 and Vitest 2 are pinned because they still support Node 18, matching the wireframe's pinned toolchain.

## D9. No token cache

The first version cached token → user id. The HTTP component tests found that the cache kept pointing at user rows that had been deleted and re-created. Removed; the lookup is one indexed query per request.

