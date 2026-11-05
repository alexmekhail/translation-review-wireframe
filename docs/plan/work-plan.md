# Work Plan: Reviewer Backend (Weeks 7–8)

Derived from the Week 5 PRD, the wireframe (`src/`), and the Week 6 proposal ([`../architecture/proposal.md`](../architecture/proposal.md)). Reviewed before execution; status updated as work landed.

**MVP boundary.** One reviewer per book, Arabic → English, paragraph-level review, machine-vs-final diff, done never locks. Out: publishing, export, rich formatting, offline sync, multiple concurrent reviewers as a feature (the schema allows it), admin access to all books, cloud deployment.

**Open decisions kept visible** (not chosen silently; see [`../decisions.md`](../decisions.md)): auth provider (D1), input formats beyond .txt (D2), object-storage host (D3), translation engine and data-sharing permission (D4), page-limit unit (D5), durable job runner (D6).

## First bounded unit

**W7-3 + W7-6: save a correction and read it back.** It is the core of the reviewer journey: every other step exists so a reviewer can fix a paragraph without losing it. It needs the schema (W7-2) and a book with translated paragraphs (W7-4, W7-5) only as test fixtures, so it could be verified first against real PostgreSQL.

## Hierarchy

| ID | Work item | Depends on | Completion check | Status |
| --- | --- | --- | --- | --- |
| **W7** | **Reviewer backend (Week 7)** | Week 6 proposal | | |
| W7-1 | Repo setup: backend package, TS config, Vitest | — | `npm run typecheck` passes | Done |
| W7-2 | Schema migration from proposal section 2 | W7-1 | Migration applies to empty Postgres; constraint tests pass | Done |
| W7-3 | Storage adapter (`PgReviewStore`) with access joins | W7-2 | Store component tests: order, uniqueness, rollback, per-reviewer rows | Done |
| W7-4 | Source reader (.txt) + upload validation | W7-1 | Unit tests: split, 413/415/422 cases | Done; .docx/.pdf deferred (D2) |
| W7-5 | Draft orchestration + provider port + fake provider | W7-3 | Unit tests with fake store; retry component test | Done; real engine deferred (D4) |
| W7-6 | Review service: compare-and-save edit (R6) | W7-3 | Save → re-read, stale save 409, invalid save keeps edit | Done |
| W7-7 | Book service: create (R1+R2), list (R3), read (R4), retry (R5), complete (R7) | W7-3..6 | Service component tests incl. 404 for unassigned | Done |
| W7-8 | HTTP layer + simulated auth | W7-7 | HTTP component tests; `scripts/smoke.sh` against running server | Done |
| W7-9 | AGENTS.md, decisions record, README, evidence log | all | Fresh reader can run setup and tests from README | Done |
| **W8** | **CRUD journey + frontend (Week 8)** | W7 | | |
| W8-1 | Delete book (owner only, cascades, removes original) | W7-7 | CRUD journey test checks rows and blob are gone | Done |
| W8-2 | Rename book (owner only) | W7-7 | Journey test reads the new title | Done |
| W8-3 | CRUD journey test: create → read → update → read → delete | W8-1, W8-2 | Asserts stored state, not just HTTP status | Done |
| W8-4 | Frontend "Live backend" screens calling the API | W7-8 | Browser walkthrough against the running backend | Done |
| W8-5 | Browser end-to-end check (Playwright) | W8-4 | Script passes; screenshots saved | Done |
| W8-6 | Azure dev environment connection | access | Request reaches the deployed backend | **Blocked**: no Azure access |
| W8-7 | Telemetry | W8-6 | Request correlated in Application Insights | **Not done**: local request-id logs only |

Parallel agents and worktrees were not used: the work was sequential, with one integration point per branch (`week-07`, then `week-08` stacked on it).
