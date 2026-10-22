export type DiffOp = { type: 'same' | 'ins' | 'del'; text: string }

/** Word-level diff (LCS) between machine text and the current text. */
export function wordDiff(a: string, b: string): DiffOp[] {
  const x = a.split(/\s+/).filter(Boolean)
  const y = b.split(/\s+/).filter(Boolean)
  const n = x.length
  const m = y.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])

  const ops: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      ops.push({ type: 'same', text: x[i] })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      ops.push({ type: 'del', text: x[i++] })
    } else {
      ops.push({ type: 'ins', text: y[j++] })
    }
  }
  while (i < n) ops.push({ type: 'del', text: x[i++] })
  while (j < m) ops.push({ type: 'ins', text: y[j++] })
  return ops
}
