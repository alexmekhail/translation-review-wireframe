import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'

/**
 * Week 8: the live frontend page against the running backend and its PostgreSQL database.
 * Real: browser, HTTP, backend, database. Simulated: dev-token identity, fake translation provider.
 * Screenshots go to docs/evidence/week-08/.
 */
const API = 'http://127.0.0.1:3000/api/v1'
const AUTH = { authorization: 'Bearer dev-alex' }
const FIXTURE = path.resolve('backend/test/fixtures/merchant.txt') // run from the repo root
const shot = (page: Page, name: string) => page.screenshot({ path: `docs/evidence/week-08/${name}.png`, fullPage: true })

test.describe.configure({ mode: 'serial' })

test('CRUD journey in the browser: upload → read → correct → reload → conflict → done → rename → delete', async ({ page, request }) => {
  const title = `E2E Merchant ${Date.now()}`

  // CREATE through the upload form
  await page.goto('/#/live')
  await expect(page.getByTestId('backend-banner')).toContainText(API)
  await page.getByTestId('upload-file').setInputFiles(FIXTURE)
  await page.getByLabel('Title (optional)').fill(title)
  await page.getByRole('button', { name: 'Upload & translate' }).click()

  // READ: lands on the book, drafts arrive, paragraphs aligned in order
  await expect(page.getByTestId('book-title')).toHaveText(title)
  await expect(page.getByTestId('progress')).toHaveText('0 / 5 done', { timeout: 15_000 })
  const p1 = page.getByTestId('paragraph-1')
  await expect(p1).toContainText('كان في قديم الزمان تاجر يسافر بين المدن.')
  const box1 = p1.getByRole('textbox')
  await expect(box1).toHaveValue('In old times there was a merchant who travel between the cities.')
  await expect(page.getByTestId('paragraph-5')).toContainText('وهناك رأى رجلًا يبيع الكتب القديمة.')
  const bookId = page.url().split('/').pop()!
  await shot(page, '01-review-loaded')

  // UPDATE: correct paragraph 1 and save
  const fixed = 'Long ago, there was a merchant who traveled between cities.'
  await box1.fill(fixed)
  await expect(page.getByTestId('save-state-1')).toHaveText('Unsaved changes')
  await p1.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('save-state-1')).toHaveText('Saved ✓')
  await expect(p1).toContainText('Edited · v1')
  await expect(page.getByTestId('request-log')).toContainText(`/books/${bookId}/paragraphs/`)
  await p1.getByLabel('Show diff').check()
  await expect(p1.locator('ins').first()).toBeVisible()
  await shot(page, '02-correction-saved-with-diff')

  // READ the change after a full reload (persistence, not component state)
  await page.reload()
  await expect(page.getByTestId('paragraph-1').getByRole('textbox')).toHaveValue(fixed)

  // FAILURE: another tab saves first → this tab gets a conflict and keeps the reviewer's text
  const paragraphId = (await (await request.get(`${API}/books/${bookId}`, { headers: AUTH })).json()).paragraphs[0].id
  const other = await request.patch(`${API}/books/${bookId}/paragraphs/${paragraphId}/edits/me`, {
    headers: AUTH,
    data: { base_version: 1, text_en: 'Saved from another tab.' },
  })
  expect(other.status()).toBe(200)
  const box = page.getByTestId('paragraph-1').getByRole('textbox')
  await box.fill('My edit from the stale tab.')
  await page.getByTestId('paragraph-1').getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('conflict')).toContainText('Saved from another tab.')
  await expect(box).toHaveValue('My edit from the stale tab.') // nothing lost
  await shot(page, '03-conflict-from-another-tab')
  await page.getByRole('button', { name: 'Use the saved version' }).click()
  await expect(box).toHaveValue('Saved from another tab.')

  // UPDATE review state: mark done
  await page.getByTestId('paragraph-1').getByLabel('Mark done').check()
  await expect(page.getByTestId('progress')).toHaveText('1 / 5 done')

  // UPDATE metadata: rename
  await page.getByRole('button', { name: 'Rename' }).click()
  await page.getByLabel('Book title').fill(`${title} (reviewed)`)
  await page.getByRole('button', { name: 'Save title' }).click()
  await expect(page.getByTestId('book-title')).toHaveText(`${title} (reviewed)`)

  // Mobile width: pairs stack
  await page.setViewportSize({ width: 375, height: 800 })
  await shot(page, '04-review-mobile-375')
  await page.setViewportSize({ width: 1280, height: 800 })

  // DELETE from the list, then confirm the backend no longer has it
  await page.goto('/#/live')
  const row = page.getByTestId('book-list').locator('li', { hasText: `${title} (reviewed)` })
  await expect(row).toContainText('1 / 5 paragraphs done')
  page.once('dialog', (d) => d.accept())
  await row.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('status')).toContainText('Deleted')
  await expect(page.getByTestId('book-list').locator('li', { hasText: title })).toHaveCount(0)
  expect((await request.get(`${API}/books/${bookId}`, { headers: AUTH })).status()).toBe(404)
  await shot(page, '05-after-delete')
})

test('failure: backend unreachable shows a useful message, and recovers on retry', async ({ page }) => {
  await page.route(`${API}/books`, (route) => route.abort('connectionrefused'))
  await page.goto('/#/live')
  await expect(page.getByRole('alert')).toContainText('Backend unreachable')
  await expect(page.getByRole('alert')).toContainText(API)
  await shot(page, '06-backend-unreachable')
  await page.unroute(`${API}/books`)
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('failure: unsupported upload shows the backend error and creates nothing', async ({ page, request }) => {
  const before = (await (await request.get(`${API}/books`, { headers: AUTH })).json()).books.length
  await page.goto('/#/live')
  await page.getByTestId('upload-file').setInputFiles({ name: 'chapter.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('x') })
  await page.getByRole('button', { name: 'Upload & translate' }).click()
  await expect(page.getByRole('alert')).toContainText('415 format_not_implemented')
  expect((await (await request.get(`${API}/books`, { headers: AUTH })).json()).books.length).toBe(before)
})

test('failure: a book id that is not mine shows 404', async ({ page }) => {
  await page.goto('/#/live/00000000-0000-4000-8000-000000000000')
  await expect(page.getByRole('alert')).toContainText('404 not_found')
})

test('empty state (list response stubbed in the browser)', async ({ page }) => {
  await page.route(`${API}/books`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"books":[]}' }),
  )
  await page.goto('/#/live')
  await expect(page.getByTestId('empty-list')).toBeVisible()
})
