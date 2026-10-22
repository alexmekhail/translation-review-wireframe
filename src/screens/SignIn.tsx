import { useState } from 'react'
import { go } from '../router'

export function SignIn() {
  const [email, setEmail] = useState('')
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form
        className="box w-full max-w-sm space-y-4 p-6"
        onSubmit={(e) => {
          e.preventDefault()
          go('/docs')
        }}
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center border border-gray-400 text-xs text-gray-500">
          Logo
        </div>
        <h1 className="text-center text-lg font-semibold">Sign in</h1>
        <p className="text-center text-sm text-gray-500">Arabic → English translation review</p>
        <label className="block text-sm">
          Email
          <input
            type="email"
            className="mt-1 block w-full rounded border border-gray-500 px-2 py-1.5"
            placeholder="you@example.org"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button type="submit" className="btn btn-primary w-full">
          Sign in
        </button>
        <p className="text-center text-xs text-gray-400">(Wireframe: no auth, any email works)</p>
      </form>
    </div>
  )
}
