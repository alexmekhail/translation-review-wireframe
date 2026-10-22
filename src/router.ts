import { useEffect, useState } from 'react'

/** Minimal hash router: #/review/merchant -> ['review', 'merchant'] */
export function useRoute(): string[] {
  const read = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  const [parts, setParts] = useState(read)
  useEffect(() => {
    const onHash = () => {
      setParts(read())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return parts
}

export const go = (path: string) => {
  window.location.hash = path
}
