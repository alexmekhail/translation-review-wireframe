export function TopBar() {
  return (
    <div className="flex items-center justify-between border-b border-gray-400 bg-gray-100 px-4 py-2">
      <a href="#/docs" className="text-sm font-semibold">
        [Logo] Translation Review
      </a>
      <div className="flex items-center gap-3 text-sm">
        <span className="hidden text-gray-500 sm:inline">reviewer@example.org</span>
        <a href="#/" className="underline">
          Sign out
        </a>
      </div>
    </div>
  )
}
