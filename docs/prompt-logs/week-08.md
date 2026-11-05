# Engineering Evidence Log — Week 8: Verify Backend CRUD and Connect a Basic Frontend

*AI assistance: built with Claude (Claude Code harness) in the same session as Week 7, on 2026-11-05. Human decisions are marked **Alex**. Commands and results are the actual outputs from that session. The frontend reuses the wireframe's styles, `StatusBadge`, `ProgressBar` and `wordDiff`.*

## 1. Goal and Acceptance Criteria

Make one bounded CRUD journey work against real storage, connect a small frontend page to the backend, and keep the claims about tests, integration, coverage and telemetry separate.

**Journey:** create a book from an upload → read its ordered paragraphs → update a correction (and the title) → read the change → delete the book. Resources and contract: [`backend/README.md`](../../backend/README.md#api-contract-as-implemented).

| Criterion | Status | Evidence |
| --- | --- | --- |
| Create / read / update / delete for the reviewed resources | Met | R1, R4, R6, R8, R9; [`crudJourney.test.ts`](../../backend/test/component/crudJourney.test.ts) |
| Stored state checked, not just status codes | Met | Journey test counts `book`, `paragraph`, `paragraph_edit`, `book_assignment` rows and checks the blob at each step; smoke script checks the file on disk |
| Paragraph order, relationships and reviewer edits preserved | Met | Order asserted after create and reload; machine text unchanged after edits; deleting one book leaves another's edits intact |
| Meaningful failures | Met | Missing/malformed id (400), unknown id (404), invalid title (400, title unchanged), unassigned user (404), assigned non-owner (403, nothing changed), stale save (409, text kept), delete during translation (no crash, nothing recreated), blob cleanup failure (delete stands, leftover reported) |
| Boundaries labeled real / simulated / unimplemented | Met | [`backend/README.md`](../../backend/README.md#boundary-status); banner on the live page |
| Frontend page calls the backend and shows real data | Met | `#/live`, `#/live/:id`; Playwright run below |
| Shows backend address, request/response path, loading, empty, failure | Met | Backend banner, request log with status and request id, loading text, empty state, `ErrorBox` |
| One useful mutation | Met (several) | Save correction, mark done, rename, delete, upload |
| Connection to the Azure development environment | **Unmet: blocked** | No Azure access (section 5). Everything was verified locally; that is not a cloud connection |
| Telemetry correlated with a request | **Partial** | Local structured logs carry `reqId`, also returned as `x-request-id` and shown in the page's request log. No Application Insights or other collector |
| Coverage reported with tool and gaps | Met | Section 3 |

## 2. Context and Architecture

Started from the Week 7 backend and the Week 6 resource design. Two additions were needed for a full CRUD journey: rename (an update of the book itself) and delete. Neither was in the Week 6 route list.

**Decision D10, owner-only rename and delete** ([`decisions.md`](../decisions.md#d10-delete-and-rename-are-owner-only-week-8)). Delete removes every reviewer's work, so only the uploader may do it. An assigned non-owner gets `403` (they already know the book exists); an unassigned user still gets `404`. This separates access to one book (assignment) from authority over the book (ownership), and it keeps working once more reviewers are added. The tradeoff: there is still no admin route that can delete any book.

**Frontend shape.** A separate `#/live` area instead of rewiring the wireframe's mock screens. The brief asks for a verification surface, not a redesign, and the mock screens stay useful for previewing states the backend can't produce yet (scanned PDF, page limit). The live review screen uses an explicit **Save** button instead of the wireframe's autosave. That makes each request visible in the request log and keeps the conflict path easy to see. Autosave is a later step.

**Human decisions (Alex)** that shaped this week: TypeScript, extend this repo, and no Azure access yet (answers recorded in [`week-07.md`](week-07.md#2-context-and-architecture)).

## 3. Validation and Findings

Environment: Node 22.22, PostgreSQL 16.15 (real local server), Chromium build 1243 driven by `@playwright/test` 1.64.1 through `PLAYWRIGHT_CHROMIUM_PATH`.

**Backend: type check, unit and component tests, coverage**

```text
$ npm run typecheck          → OK
$ npx vitest run --coverage
 ✓ test/component/crudJourney.test.ts (9 tests)
 ✓ test/component/services.test.ts (13 tests)
 ✓ test/component/http.test.ts (11 tests)
 ✓ test/component/store.test.ts (8 tests)
 ✓ test/unit/… (48 tests in 5 files)
 Test Files  9 passed (9)
      Tests  89 passed (89)
All files | 98.11 % stmts | 92.6 % branch | 96 % funcs | 98.11 % lines
```

Coverage tool: `@vitest/coverage-v8`, measuring `src/**` except the CLI entry points (`server.ts`, `seed.ts`, `migrate.ts`). Uncovered: the generic 4xx/500 branches of the HTTP error handler and `upsertUser` (seed only). The number says which lines ran. It does not say the assertions are right: that is what the mutation checks (Week 7, plus one below) are for. No coverage target was set.

**Running server over a real socket** (`./scripts/smoke.sh`):

```text
  ok: pipeline finished (ready)
  ok: paragraphs in reading order ([1, 2, 3, 4, 5])
  ok: saved, version (1)
  ok: re-read returns the correction
  ok: stale save rejected (409)
  ok: correction intact after stale save
  ok: other user cannot see the book (404)
  ok: no session (401)
  ok: renamed / re-read returns the new title / blank title rejected (400)
  ok: other user cannot delete (404)
  ok: owner deletes (204)
  ok: book is gone (404)
  ok: original file removed from disk
smoke passed
```

**Browser end to end** (`npm run e2e` with the backend and Vite running):

```text
  ✓ CRUD journey in the browser: upload → read → correct → reload → conflict → done → rename → delete (2.3s)
  ✓ failure: backend unreachable shows a useful message, and recovers on retry
  ✓ failure: unsupported upload shows the backend error and creates nothing
  ✓ failure: a book id that is not mine shows 404
  ✓ empty state (list response stubbed in the browser)
  5 passed (6.0s)
```

Screenshots: [`01-review-loaded`](../evidence/week-08/01-review-loaded.png), [`02-correction-saved-with-diff`](../evidence/week-08/02-correction-saved-with-diff.png), [`03-conflict-from-another-tab`](../evidence/week-08/03-conflict-from-another-tab.png), [`04-review-mobile-375`](../evidence/week-08/04-review-mobile-375.png), [`05-after-delete`](../evidence/week-08/05-after-delete.png), [`06-backend-unreachable`](../evidence/week-08/06-backend-unreachable.png).

**Walkthrough: success.** Upload `merchant.txt` → the page lands on the book and polls until drafts are ready → five Arabic/English pairs in order → edit ¶1, Save → "Saved ✓", request log shows `PATCH …/edits/me 200 · saved, version 1 · req d38b…` → Show diff marks the changes → full reload shows the corrected text.

**Walkthrough: meaningful failure.** A second client saves ¶1 first (version 2). The reviewer then saves from the stale page → `409 version_conflict`. The page keeps the reviewer's text in the box and shows the saved version with two choices: use the saved version, or keep mine and save over it knowingly. The request log shows the 409 and its request id ([screenshot 03](../evidence/week-08/03-conflict-from-another-tab.png)).

**What each kind of evidence establishes**

| Evidence | Establishes | Does not establish |
| --- | --- | --- |
| Unit tests (fakes) | Parsing, validation and orchestration rules | SQL, HTTP, browser |
| Component tests (real Postgres, Fastify inject) | Service rules + real constraints, ordering, cascades, access | Network, CORS, browser rendering |
| `smoke.sh` (running server) | The HTTP journey over a socket, including the file on disk | Browser behavior |
| Playwright (browser + Vite + backend + Postgres) | The page drives the real API, shows real data, handles failures | Hosted deployment, real identity, real translation engine |
| Request ids in logs and on the page | Each request can be traced from the page to the server log line | Cloud telemetry; correctness of business operations |
| Stubbed empty-list test | The empty state renders | Anything about the backend (the response is faked in the browser) |

## 4. Agent Recovery and Human Intervention

All of these were found and fixed by the agent; none weakened a test.

1. **Done checkbox lagged (found by Playwright).** `check()` failed with "Clicking the checkbox did not change its state". The checkbox only reflected server state, so it stayed unchanged until the save returned, which a reviewer would notice too. Fix: show the new state immediately while saving, and revert if the save fails. Re-run: 5/5 passed.
2. **Wrong expectation, corrected with a reason.** The journey test expected `DELETE /books/` (empty id) to be 404 "no route". Fastify matches the empty segment as `:bookId`, so the API answers `400 invalid_id, field: bookId`. That is the more useful behavior, so the expectation was changed and the reason is recorded in the test.
3. **Two weak tests strengthened before they were trusted.** (a) "Delete during translation" first asserted only that `drain()` resolved, which always happens because background errors are logged, not thrown. Changed so the container collects background errors and the test asserts there are none. (b) A blob-cleanup test didn't observe the cleanup report; replaced by a service-level test that does.
4. **Delete-during-translation crash (anticipated, then proven).** While adding delete, the agent reasoned that a running translation job would call `finishTranslation` on a book that no longer exists and crash on `rows[0]!`. Fixed to return `null`. Mutation check: putting back `rows[0]!` makes the strengthened test fail (`expected [ …(1) ] to deeply equal []`), and restoring the fix makes it pass.
5. **Week 7 claim corrected.** The type check found errors in Week 7's test files, which Vitest doesn't type-check. Fixed on the `week-07` branch with its own commit, and `week-08` was rebased onto it.

**Alex's review:** *To complete.* Record what you checked yourself (for example, run `npm run e2e` locally and look at the screenshots), any feedback you gave or rejected, and why.

## 5. Outcome and Limits

**Cloud scope.** No Azure tenant, subscription, resource group or development environment was used or inspected: Alex does not have access yet (**Alex**: "No / not yet"). No resources were created, so there is nothing to clean up. A local rehearsal of the same frontend → backend → database flow passed, but it is **not** a hosted connection, and the Azure criterion stays unmet until access and endpoint details arrive. Once they do, the frontend only needs `VITE_API_BASE_URL` pointed at the deployed backend. The backend refuses `NODE_ENV=production` until real identity replaces the dev tokens.

**Parallel work.** Not used. Work ran sequentially on stacked branches (`week-06` → `week-07` → `week-08`), each with one integration point.

**Limits.** Simulated identity, translation provider and blob storage; `.txt` input only; translation runs don't survive a restart; no telemetry collector; the live page uses explicit Save, not autosave.

**Workflow improvement.** Run the type check with the tests (`npm run check`). The Week 7 test-file errors went unnoticed because the test runner doesn't type-check.
