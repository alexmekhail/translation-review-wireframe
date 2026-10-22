# Arabic → English Translation Review: wireframe

A low-fidelity, clickable wireframe for a web app where bilingual volunteer reviewers upload Arabic documents (religious texts and literature), get a machine translation into English, and review and edit it paragraph by paragraph.

> **Wireframe only.** It has no backend, no real translation API, and no auth. All data is mock data held in memory, so reloading the page resets everything.

## Quick start

Requires **Node 18+**.

```bash
npm install
npm run dev
```

Open http://localhost:5173 and sign in with any email. To go straight to the main screen, open http://localhost:5173/#/review/merchant.

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
└── screens/
    ├── SignIn.tsx
    ├── DocumentList.tsx
    ├── Upload.tsx
    ├── Translating.tsx
    └── Review.tsx
```

## Out of scope for this wireframe

- Real authentication, persistence, or file parsing. Scanned-PDF and page-limit errors can only be previewed with the Dev panel
- A real machine translation service
- Visual design and branding

## Changelog

Every commit adds an entry here, newest first.

### 2026-10-22: Initial commit
- Clickable wireframe with all six screen areas: sign in, document list, upload, translating, review, and empty/error states
- Mock data covering every document status
- Dev panel for previewing the empty list, autosave failure, and upload errors
- Responsive review screen, checked at 375px and desktop widths
