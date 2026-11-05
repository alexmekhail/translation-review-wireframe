# Engineering Evidence Log — Week 7: Implement the Reviewer Backend

*AI assistance: built with Claude (Claude Code harness) in one session on 2026-11-05. The agent wrote the code, tests and docs; the human decisions are marked **Alex**. Commands and results below are the actual outputs from that session.*

## 1. Goal and Acceptance Criteria

Smallest useful reviewer backend from the Week 6 proposal: manage a book, return its ordered source/target paragraphs, save corrections and review state, and orchestrate translation drafts, with meaningful unit and component tests.

| Criterion | Status | Evidence |
| --- | --- | --- |
| Reviewed work hierarchy with MVP boundary and open decisions | Met | [`docs/plan/work-plan.md`](../plan/work-plan.md) |
| Create/read book with ordered paragraphs | Met | R1, R3, R4; `store.test.ts` ordering test |
| Save corrections and review state without losing work | Met | R6, R7; conflict and invalid-save tests |
| Translation draft orchestration | Met (simulated provider) | `DraftService`; retry tests |
| Boundaries labeled real / simulated / missing | Met | [`backend/README.md`](../../backend/README.md#boundary-status) |
| Unit + component tests with fixtures, actual results | Met | Section 3 |
| Setup/run/test docs, `AGENTS.md`, decision record | Met | `backend/README.md`, [`AGENTS.md`](../../AGENTS.md), [`docs/decisions.md`](../decisions.md) |
| Walkthrough: one success, one failure | Met | `scripts/smoke.sh` output below |
| Real translation engine | Unmet (by design) | Engine undecided ([D4](../decisions.md#d4-fake-translation-provider)) |
| Real object storage, real identity | Unmet (by design) | [D1](../decisions.md#d1-simulated-identity), [D3](../decisions.md#d3-originals-on-local-disk) |
| .docx / .pdf input | Partial | `.txt` only ([D2](../decisions.md#d2-only-utf-8-txt-is-parsed)) |

## 2. Context and Architecture

Inputs verified before planning: the Week 6 proposal (schema, R1–R7), the wireframe code (`src/types.ts`, `src/store.tsx`, screens), the course brief (`mageeb/cap` weeks 6–8 `homework.md`), and the classroom reference backend (`project/src/Translation/Backend/README.md`), whose shape (Books / Reviews / Drafts services, storage and provider ports) this follows.

**Human decisions (Alex)**, asked before any code was written:

| Question | Alex's answer |
| --- | --- |
| Which weeks still need a submission? | Weeks 6, 7, 8 |
| Backend language? | TypeScript (agent's recommendation) |
| Where should the code go? | Extend this wireframe repo |
| Azure dev environment access? | No / not yet |

**Deliberate changes from the Week 6 proposal**, recorded rather than silently made:

- R2 runs inside R1's transaction, not as a separate internal route ([D7](../decisions.md#d7-r2-folded-into-r1)). Tradeoff: no partially created books, but the "add paragraphs later" capability is gone until a real need appears.
- `GET` responses add `is_owner` (needed by Week 8's owner-only delete).
- Extra constraint: a `translated` paragraph must have `machine_en` (database `CHECK`).

## 3. Validation and Findings

Environment: Node 22.22, PostgreSQL 16.15 running locally (real server, not an emulator).

```text
$ npm run typecheck                      → no errors (src + test; see the correction in section 4)
$ TEST_DATABASE_URL=… npx vitest run
 ✓ test/component/services.test.ts (12 tests)
 ✓ test/component/http.test.ts (11 tests)
 ✓ test/component/store.test.ts (8 tests)
 ✓ test/unit/draftService.test.ts (6 tests)
 ✓ test/unit/sourceReader.test.ts (13 tests)
 ✓ test/unit/authAndBackground.test.ts (12 tests)
 ✓ test/unit/parseSaveEdit.test.ts (12 tests)
 ✓ test/unit/configAndBlobs.test.ts (5 tests)
 Test Files  8 passed (8)
      Tests  79 passed (79)
```

Coverage (`npm run test:coverage`, v8, `src/**` minus `server.ts`, `seed.ts`, `migrate.ts` CLI entry points): **97.8% lines, 92.2% branches**. The number is a by-product: tests were chosen for behaviors (order, conflicts, access, rollback), and two were added only after the report showed the real disk blob adapter and config loading were untested.

**Do the tests catch real defects?** Two deliberate mutations, each reverted afterwards:

| Mutation | Result |
| --- | --- |
| Remove `ORDER BY p.position` from the book read | 1 test failed: "returns paragraphs in position order even when rows were stored out of order" |
| Remove the `version = base_version` check from the edit update (parameter kept bound) | 1 test failed: the stale save *succeeded* and overwrote newer text (`promise resolved "{ text_en: 'tab B, stale' … }" instead of rejecting`) |

**Over a real socket** (`npm run dev`, then `./scripts/smoke.sh`):

```text
create (R1):            book 8c99bcda-…
  ok: pipeline finished (ready)
  ok: paragraphs in reading order ([1, 2, 3, 4, 5])
  ok: saved, version (1)
  ok: re-read returns the correction (Long ago, there was a merchant.)
failure paths:
  ok: stale save rejected (409)
  ok: correction intact after stale save
  ok: other user cannot see the book (404)
  ok: no session (401)
smoke passed
```

Server logs carry a `reqId` per request (also returned as `x-request-id`), e.g. the 409 above logged `reqId 69b9…, PATCH …/edits/me, statusCode 409`. That proves local request logging, not telemetry in a cloud service.

**What the fakes don't prove:** the fake provider says nothing about a real engine's errors, latency or quality; the memory/disk blob stores say nothing about S3; dev tokens say nothing about real authentication.

## 4. Agent Recovery and Human Intervention

**Defect found by tests and fixed (agent).** The first `DevTokenAuthenticator` cached token → user id. Five HTTP component tests failed (`expected [] to have a length of 1`, `expected 400 to be 404`) because the cache kept the user id from an earlier test after users were deleted and re-created. Diagnosis: a cache like that would also be wrong if a user were deleted in real use. Fix: removed the cache; the unit test now asserts a lookup per request. Recorded as [D9](../decisions.md#d9-no-token-cache).

**Environment problems (agent).** (1) Vitest loaded the frontend's PostCSS/Tailwind config from the repo root and crashed; fixed by giving the backend's Vitest config an empty PostCSS config. (2) The local Postgres server was stopped between turns and its data directory's permissions broke; it was re-created and run as a tracked background process. Neither changed any test expectation.

**Type-check claim corrected (agent).** The first type-check ran before the test files existed. Vitest doesn't type-check, so three `rows[0]` "possibly undefined" errors in `test/component/store.test.ts` went unnoticed until the next type-check. They were fixed, and `npm run check` now runs the type check and the tests together.

**Mutation run correction (agent).** The first version of the version-check mutation left `$5` unused, which could fail for an unrelated reason. Re-run with the parameter still bound so only the check was removed (result in section 3).

**Scope held.** No publishing, export, rich formatting, offline sync, admin role, or multi-reviewer UI was added. The schema already supports multiple reviewers (a store test proves two reviewers keep separate edits), but no feature exposes it.

**Alex's review:** *To complete.* Record which parts you reviewed yourself, any feedback you gave or rejected, and what you'd change.

## 5. Outcome and Limits

- Branch `week-07` (stacked on `week-06`). Backend in `backend/`; plan, decisions and agent instructions in `docs/` and `AGENTS.md`.
- Limits: simulated identity, provider and blob storage; `.txt` input only; translation runs don't survive a restart; no deployment.
- Domain validation still needed: a qualified reviewer should check real (authorized) religious and literary texts. The fixtures are synthetic.
- Workflow improvement: run the HTTP tests against the same database the service tests use earlier. The auth-cache bug only showed up at that layer.
