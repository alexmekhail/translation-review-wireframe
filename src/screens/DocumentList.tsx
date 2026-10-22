import { doneCount, useStore } from '../store'
import { StatusBadge } from '../components/StatusBadge'
import { ProgressBar } from '../components/ProgressBar'
import type { Doc } from '../types'

const hrefFor = (d: Doc) =>
  d.status === 'in_review' || d.status === 'done' ? `#/review/${d.id}` : `#/translating/${d.id}`

function progressText(d: Doc) {
  const total = d.paragraphs.length
  if (d.status === 'uploaded' || d.status === 'translating' || d.status === 'failed') {
    const t = d.paragraphs.filter((p) => p.tstatus === 'translated').length
    return { n: t, total, text: `${t} / ${total} paragraphs translated` }
  }
  const n = doneCount(d)
  return { n, total, text: `${n} / ${total} paragraphs done` }
}

export function DocumentList() {
  const { docs, dev } = useStore()
  const list = dev.emptyDocList ? [] : docs

  return (
    <main className="mx-auto max-w-4xl p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">My documents</h1>
        <a href="#/upload" className="btn btn-primary">
          ⬆ Upload
        </a>
      </div>

      {list.length === 0 ? (
        <div className="box flex flex-col items-center gap-3 border-dashed px-4 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center border border-gray-400 text-xs text-gray-400">
            [icon]
          </div>
          <h2 className="font-semibold">No documents yet</h2>
          <p className="max-w-xs text-sm text-gray-500">
            Upload an Arabic .docx, PDF or .txt file (up to 30 pages) to get a machine translation you can review.
          </p>
          <a href="#/upload" className="btn btn-primary">
            Upload your first document
          </a>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <table className="box hidden w-full border-collapse text-sm md:table">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="border-b border-gray-400 p-2">Title</th>
                <th className="border-b border-gray-400 p-2">Uploaded</th>
                <th className="border-b border-gray-400 p-2">Status</th>
                <th className="w-56 border-b border-gray-400 p-2">Progress</th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => {
                const p = progressText(d)
                return (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="border-b border-gray-200 p-2">
                      <a className="underline" href={hrefFor(d)}>
                        {d.title}
                      </a>
                    </td>
                    <td className="border-b border-gray-200 p-2 text-gray-600">{d.uploadedAt}</td>
                    <td className="border-b border-gray-200 p-2">
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="border-b border-gray-200 p-2">
                      <ProgressBar value={p.n} total={p.total} />
                      <div className="mt-1 text-xs text-gray-600">{p.text}</div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {list.map((d) => {
              const p = progressText(d)
              return (
                <li key={d.id}>
                  <a href={hrefFor(d)} className="box block p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium underline">{d.title}</span>
                      <StatusBadge status={d.status} />
                    </div>
                    <div className="mt-1 text-xs text-gray-500">Uploaded {d.uploadedAt}</div>
                    <div className="mt-2">
                      <ProgressBar value={p.n} total={p.total} />
                      <div className="mt-1 text-xs text-gray-600">{p.text}</div>
                    </div>
                  </a>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </main>
  )
}
