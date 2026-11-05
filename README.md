# Arabic → English Translation Review: wireframe

A low-fidelity, clickable wireframe for a web app where bilingual volunteer reviewers upload Arabic documents (religious texts and literature), get a machine translation into English, and review and edit it paragraph by paragraph.

> **Wireframe screens use mock data.** The original screens (`#/docs`, `#/review/...`) have no backend: their data lives in memory and resets on reload. Since Week 8, the **Live backend** screens (`#/live`) call the real API in [`backend/`](backend/README.md). That API stores data in PostgreSQL, but identity and the translation provider are still simulated.

## Quick start

Requires **Node 18+**.

```bash
npm install
npm run dev
```

Open http://localhost:5173 and sign in with any email. To go straight to the main screen, open http://localhost:5173/#/review/merchant.

The backend lives in [`backend/`](backend/README.md) and has its own setup. Agent instructions: [`AGENTS.md`](AGENTS.md).

| Script | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server with hot reload |
| `npm run build` | Type-check with `tsc`, then build to `dist/` |
| `npm run preview` | Serve the production build locally |

## Tech stack

- **React 18 + TypeScript**, bundled with **Vite 5**
- **Tailwind CSS 3** for layout. The style is grayscale on purpose: boxes, borders, and the system font
- **Noto Naskh Arabic** (Google Fonts) for Arabic text
- A tiny hash router (`src/router.ts`), with no router library
- React context for in-memory state (`src/store.tsx`)

Vite 5 and Tailwind 3 are pinned so the app runs on Node 18. Newer majors need Node 20+.

## Screens

| Screen | Route | How to reach it |
|---|---|---|
| Sign in | `#/` | Start page. Any email works. |
| Document list | `#/docs` | After sign-in, or click the logo. Shows title, upload date, status, and progress. |
| Upload | `#/upload` | **Upload** button on the list. Accepts .docx / .pdf / .txt, up to 30 pages. "Use a sample file" skips the file picker. |
| Translating | `#/translating/:id` | Open a document that is *Uploaded*, *Translating* or *Translation failed*, or upload a file. Paragraphs translate one per second and some fail on purpose, so you can try **Retry failed**. |
| Review | `#/review/:id` | Open a document that is *In review* or *Done*. Try **The Merchant and His Sons**. |

Document statuses: **Uploaded → Translating → In review → Done**, or **Translation failed** if any paragraph fails.

### Review screen (the main screen)

- **Paragraph pairs:** Arabic (RTL, read-only) sits beside English (LTR, editable in place). Below 768px the pairs stack vertically.
- **Per pair:**
  - **Mark done** checkbox, which can be unchecked
  - **Show diff**, a word-level diff of machine text → current text (green = inserted, red strikethrough = deleted)
  - **Reset to machine text**, enabled only when the text has been edited; asks before discarding edits
- **Header**, sticky:
  - Document title and status
  - Progress bar (done / total)
  - **Next unreviewed**, which scrolls to and focuses the next unchecked pair, wrapping around
  - **Mark document done**, which asks first if some paragraphs aren't done. Editing stays enabled, and **Undo** reopens the document
  - Autosave indicator: *Saving…* / *Saved* / *Save failed – retrying*

## Mock data

Defined in `src/mockData.ts`. All sentences are invented or public domain. The English drafts are deliberately rough so that editing and diffs have something to show.

| Document | Status | Notes |
|---|---|---|
| The Merchant and His Sons | In review | 8 pairs, 3 already done, a few already edited |
| Friday sermon notes | Done | 3 pairs, all done |
| Letters from abroad | Translating | Finishes a few seconds after load, with 1 failed paragraph |
| Night poem (draft) | Translation failed | 2 of 4 paragraphs failed; use **Retry failed** |

## Previewing empty and error states (Dev panel)

Click the dashed yellow **Dev ▴** button in the bottom-right corner on any screen. The panel is a wireframe tool, not part of the product.

| Toggle | Effect |
|---|---|
| **Empty document list** | Shows the "No documents yet" state on `#/docs` |
| **Autosave fails** | Edit any English text or tick a checkbox on the Review screen. The indicator shows *Save failed – retrying* and a sticky banner appears. Turn the toggle off and the next retry (every 3s) succeeds. |
| **Upload error preview** | Previews each upload error on `#/upload`: wrong file type, scanned PDF, over 30 pages, empty file. With "None", real checks still run: a wrong extension shows the type error and a 0-byte file shows the empty error. |
| Quick links | Jump to the docs, upload, translating, failed, and review screens |

## Project structure

```
src/
├── App.tsx                 # Route → screen switch
├── main.tsx                # Entry point, wraps App in StoreProvider
├── router.ts               # Minimal hash router (useRoute, go)
├── store.tsx               # In-memory state, fake translation worker, fake autosave
├── mockData.ts             # Sample documents and Arabic/English pairs
├── diff.ts                 # Word-level LCS diff
├── types.ts                # Doc, Paragraph, status types
├── index.css               # Tailwind layers + .btn / .box helpers
├── components/
│   ├── DevPanel.tsx        # State-preview toggles
│   ├── ProgressBar.tsx
│   ├── SaveIndicator.tsx   # Autosave indicator + save-failed banner
│   ├── StatusBadge.tsx
│   └── TopBar.tsx
├── live/                   # Week 8: screens wired to the real backend
│   ├── api.ts              # API client + request log
│   ├── LiveBooks.tsx       # #/live
│   ├── LiveBook.tsx        # #/live/:id
│   ├── RequestLog.tsx      # backend banner, request log, error box
│   └── status.ts
└── screens/
    ├── SignIn.tsx
    ├── DocumentList.tsx
    ├── Upload.tsx
    ├── Translating.tsx
    └── Review.tsx
```

## Live backend screens (Week 8)

A narrow verification page for the real backend, separate from the mock screens. It shows the backend address, the simulated identity, and a log of every request with its status and request id.

| Route | What it does |
|---|---|
| `#/live` | Lists my books from `GET /books`; upload a `.txt` (`POST /books`); delete (owner only) |
| `#/live/:id` | Arabic and English side by side from `GET /books/:id`; Save a correction, Mark done, Show diff, Rename, Retry failed, Mark book done. Polls while drafts are produced |

Run it with the backend running (see [`backend/README.md`](backend/README.md)), then `npm run dev` and open http://localhost:5173/#/live. Configure with `VITE_API_BASE_URL` (default `http://127.0.0.1:3000/api/v1`) and `VITE_DEV_TOKEN` (default `dev-alex`; a simulated dev token, not a secret).

Browser end-to-end check (needs Postgres, `DATABASE_URL` and seeded users; starts the backend and Vite if they aren't running):

```bash
npx playwright install chromium   # once
npm run e2e                       # screenshots go to docs/evidence/week-08/
```

## Out of scope for this wireframe

- Real authentication. On the mock screens, also persistence and file parsing (the Live backend screens have both, for `.txt`). Scanned-PDF and page-limit errors can only be previewed with the Dev panel
- A real machine translation service
- Visual design and branding

## Changelog

Every commit adds an entry here, newest first.

### 2026-11-05: Remove hardcoded database password
- `docker-compose.yml` reads `POSTGRES_PASSWORD` from the environment or a git-ignored `.env` instead of a literal (flagged by GitGuardian; it was only a local default, but no password belongs in the repo)
- `backend/.env.example` uses a `CHANGE_ME` placeholder

### 2026-11-05: Week 8 CRUD journey and live frontend
- Backend: owner-only rename (`PATCH /books/:id`) and delete (`DELETE /books/:id`, cascades, removes the original file); a book deleted mid-translation no longer crashes the run
- Tests: CRUD journey component test checking rows and blobs at every step (89 backend tests total); `backend/scripts/smoke.sh` now covers the whole journey over real HTTP
- Frontend: `#/live` and `#/live/:id` screens wired to the real API, with backend address, request log, loading/empty/error states, save conflicts handled without losing text
- `e2e/live.spec.ts`: Playwright run against the real backend; screenshots in `docs/evidence/week-08/`
- `docs/prompt-logs/week-08.md`; decisions D10 (owner-only delete/rename) and work plan updated; Azure connection blocked (no access)

### 2026-11-05: Fix type errors in backend tests
- Three `rows[0]` possibly-undefined errors in `backend/test/component/store.test.ts` (Vitest does not type-check)
- `npm run check` in `backend/` runs the type check and tests together

### 2026-11-05: Week 7 reviewer backend
- `backend/`: TypeScript + Fastify API on PostgreSQL implementing routes R1, R3–R7 (create from .txt upload, list, read in order, retry drafts, save correction with version check, mark done)
- Simulated boundaries, labeled as such: dev-token identity, fake translation provider, local-disk original storage
- 79 unit and component tests (component tests run against real PostgreSQL), plus `backend/scripts/smoke.sh` for a running server
- `AGENTS.md`, `docs/decisions.md`, `docs/plan/work-plan.md`, `docs/prompt-logs/week-07.md`, `docker-compose.yml` for local Postgres

### 2026-11-05: Week 6 architecture proposal
- `docs/architecture/proposal.md`: PostgreSQL vs. Firestore comparison, full schema, data-flow and ER sketches, book/paragraph API routes, one traced operation, revision log
- `docs/prompt-logs/week-06.md`: evidence log for the design work

### 2026-10-22: Initial commit
- Clickable wireframe with all six screen areas: sign in, document list, upload, translating, review, and empty/error states
- Mock data covering every document status
- Dev panel for previewing the empty list, autosave failure, and upload errors
- Responsive review screen, checked at 375px and desktop widths
