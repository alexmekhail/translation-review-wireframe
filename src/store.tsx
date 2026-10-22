import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Doc, Paragraph, SaveState, UploadErrorPreview } from './types'
import { initialDocs, machineFor, samplePendingParagraphs } from './mockData'

interface DevFlags {
  emptyDocList: boolean
  saveFails: boolean
  uploadError: UploadErrorPreview
}

interface Store {
  docs: Doc[]
  dev: DevFlags
  setDev: (patch: Partial<DevFlags>) => void
  saveState: SaveState
  updateParagraph: (docId: string, paraId: string, patch: Partial<Paragraph>) => void
  setDocStatus: (docId: string, status: Doc['status']) => void
  retryFailed: (docId: string) => void
  addUploadedDoc: (title: string) => string
}

const Ctx = createContext<Store | null>(null)

const TICK_MS = 900
const SAVE_DELAY_MS = 700
const RETRY_MS = 3000

export function StoreProvider({ children }: { children: ReactNode }) {
  const [docs, setDocs] = useState<Doc[]>(initialDocs)
  const [dev, setDevState] = useState<DevFlags>({ emptyDocList: false, saveFails: false, uploadError: 'none' })
  const [saveState, setSaveState] = useState<SaveState>('idle')

  const devRef = useRef(dev)
  devRef.current = dev
  const saveTimer = useRef<number>()

  const setDev = useCallback((patch: Partial<DevFlags>) => setDevState((d) => ({ ...d, ...patch })), [])

  // Fake autosave: "Saving…" then either "Saved" or "Save failed – retrying" (retries until the dev flag is off).
  const attemptSave = useCallback(() => {
    window.clearTimeout(saveTimer.current)
    setSaveState('saving')
    saveTimer.current = window.setTimeout(() => {
      if (devRef.current.saveFails) {
        setSaveState('failed')
        saveTimer.current = window.setTimeout(attemptSave, RETRY_MS)
      } else {
        setSaveState('saved')
      }
    }, SAVE_DELAY_MS)
  }, [])

  const mapDoc = (docId: string, fn: (d: Doc) => Doc) =>
    setDocs((ds) => ds.map((d) => (d.id === docId ? fn(d) : d)))

  const updateParagraph = useCallback(
    (docId: string, paraId: string, patch: Partial<Paragraph>) => {
      mapDoc(docId, (d) => ({
        ...d,
        paragraphs: d.paragraphs.map((p) => (p.id === paraId ? { ...p, ...patch } : p)),
      }))
      attemptSave()
    },
    [attemptSave],
  )

  const setDocStatus = useCallback(
    (docId: string, status: Doc['status']) => {
      mapDoc(docId, (d) => ({ ...d, status }))
      attemptSave()
    },
    [attemptSave],
  )

  const retryFailed = useCallback((docId: string) => {
    mapDoc(docId, (d) => ({
      ...d,
      status: 'translating',
      paragraphs: d.paragraphs.map((p) =>
        p.tstatus === 'failed' ? { ...p, tstatus: 'pending', willFail: false } : p,
      ),
    }))
  }, [])

  const addUploadedDoc = useCallback((title: string) => {
    const id = `doc-${Date.now()}`
    const today = new Date().toISOString().slice(0, 10)
    setDocs((ds) => [
      { id, title, uploadedAt: today, status: 'uploaded', paragraphs: samplePendingParagraphs(id) },
      ...ds,
    ])
    return id
  }, [])

  // Fake translation worker: one paragraph per tick for each translating doc.
  useEffect(() => {
    const t = window.setInterval(() => {
      setDocs((ds) =>
        ds.map((d) => {
          if (d.status === 'uploaded') return { ...d, status: 'translating' }
          if (d.status !== 'translating') return d
          const idx = d.paragraphs.findIndex((p) => p.tstatus === 'pending')
          if (idx === -1) {
            const anyFailed = d.paragraphs.some((p) => p.tstatus === 'failed')
            return { ...d, status: anyFailed ? 'failed' : 'in_review' }
          }
          const paragraphs = d.paragraphs.map((p, i) => {
            if (i !== idx) return p
            if (p.willFail) return { ...p, tstatus: 'failed' as const }
            const machine = machineFor(p.ar)
            return { ...p, tstatus: 'translated' as const, machine, current: machine }
          })
          return { ...d, paragraphs }
        }),
      )
    }, TICK_MS)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => () => window.clearTimeout(saveTimer.current), [])

  return (
    <Ctx.Provider
      value={{ docs, dev, setDev, saveState, updateParagraph, setDocStatus, retryFailed, addUploadedDoc }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside provider')
  return s
}

export const doneCount = (d: Doc) => d.paragraphs.filter((p) => p.done).length
