# Engineering Evidence Log — Week 6: Architecture, Data, and API Contracts

*AI assistance: drafted with Claude (claude.ai) across one conversation on 2026-10-22, then copied into this repo on 2026-11-05. Excerpts below are condensed from that conversation; human decisions are marked **Alex**.*

## 1. Goal and Acceptance Criteria

Turn the Week 5 PRD and wireframe into a defensible architecture proposal: a database comparison with a recommendation, a complete schema, the book/paragraph API routes, and a review record.

Acceptance checks I used:

- The comparison names actual systems (PostgreSQL, Cloud Firestore) and cites primary docs for the claims that drive the choice.
- The schema separates paragraph identity (`id`) from display order (`position`) and shows an explicit `ORDER BY` read.
- Routes cover create book, add paragraphs, read content, and save a correction, with permission rules for one book vs. every book.
- At least one meaningful revision is recorded with its reason.

Result: [`docs/architecture/proposal.md`](../architecture/proposal.md).

## 2. Context and Architecture

Verified inputs:

- Week 5 PRD (claude.ai doc) and this repo's wireframe code: `src/types.ts`, `src/store.tsx`, `src/mockData.ts`, `src/screens/Review.tsx`, `Translating.tsx`, `Upload.tsx`, `DocumentList.tsx`.
- Course brief: `mageeb/cap` `curriculum/weeks/06/homework.md`.

**Restatement before drafting.** The AI restated the MVP (one reviewer, paragraph-level review, machine vs. final diff, done not locked) and the four deliverables, then asked 15 questions. **Alex** answered "these look right" to the recommended answers after the AI read the wireframe repo.

**Key decision and tradeoff.** PostgreSQL over Firestore. The data is relational (book → ordered paragraphs → per-reviewer edits, user ↔ book assignments), and the crowdsourcing direction needs joins and aggregates. The tradeoff: Firestore's real-time listeners would make live co-editing easier, but live co-editing is out of scope.

## 3. Validation and Findings

Claims checked against primary documentation (links in the proposal's Sources):

| Claim | Checked against | Finding |
| --- | --- | --- |
| Row order without `ORDER BY` is not guaranteed | PostgreSQL 18 "Sorting Rows" | Confirmed: "unspecified order … must not be relied on" |
| Default isolation is Read Committed | PostgreSQL `SET TRANSACTION` (v10 page) | Confirmed; current-version page still to check |
| Firestore document size limit | Firestore quotas | 1 MiB confirmed |
| Firestore aggregations | Aggregation queries page | `count/sum/average` only; no listeners; 60 s deadline |
| "Firestore has no joins" | Same page's navigation | **Wrong as stated**: Enterprise-edition pipelines list subquery joins. Narrowed to Standard edition |

Wireframe-vs-PRD check found one contradiction (see revision 3 below).

Unverified: the PostgreSQL "Constraints" chapter could not be fetched in the session; the citation is marked unverified in the proposal.

## 4. Agent Recovery and Human Intervention

**Intervention 1 (Alex), the crowdsourcing challenge.** After the AI's first schema put `final_en` and `is_done` on `paragraph`, Alex wrote:

> "the idea is that the app is eventually supposed to develop into a translator reviewer where multiple reviewers can access and review the translations, almost like a crowd source idea. i want to make sure the infra reflects these changes and that it is scope-proof"

The AI pushed back on "scope-proof" (no schema survives every future feature, and the brief penalizes building future features into the MVP) and reframed the goal as making crowdsourcing an *additive* change. Resulting revisions:

1. `final_en`/`is_done` moved from `paragraph` to a per-reviewer `paragraph_edit` table, `UNIQUE (paragraph_id, reviewer_id)`.
2. `book.status` split into `book.pipeline_status` (per book) and `book_assignment.completed_at` (per reviewer).

Explicitly deferred instead of built: voting/consensus, reputation, real-time co-editing, full revision history.

**Agent self-correction.** Revision 3 (failed translation is a stored, blocking status, from reading `Translating.tsx`) and revision 4 (the Firestore joins claim) were caught by the AI checking the code and docs, not by Alex.

**Challenge that survived.** Integer `position` vs. fractional order keys: kept integers, because no screen inserts or reorders paragraphs.

**Alex's own challenge of the final draft:** *To complete.* The proposal doc's checklist item was ticked, but no written challenge or outcome was recorded. Add the challenge you made (for example, whether `404` instead of `403` for unassigned books is right) and what resolved it.

## 5. Outcome and Limits

- Output: [`docs/architecture/proposal.md`](../architecture/proposal.md) (comparison, schema, ER and data-flow sketches, routes, trace, revision log).
- Status: deliverables 1–3 complete as a proposal; deliverable 4 partial until Alex's own challenge is recorded.
- Limits: no hosting, auth provider, or translation engine chosen; data sizes are assumptions, not measurements; nothing here is implemented.
- Workflow improvement: ask the AI to read the wireframe code *before* proposing a schema. Revision 3 would have been avoided.
