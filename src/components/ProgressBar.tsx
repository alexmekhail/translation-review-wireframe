export function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total ? Math.round((value / total) * 100) : 0
  return (
    <div
      className="h-2 w-full overflow-hidden rounded border border-gray-500 bg-white"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemax={total}
    >
      <div className="h-full bg-gray-700" style={{ width: `${pct}%` }} />
    </div>
  )
}
