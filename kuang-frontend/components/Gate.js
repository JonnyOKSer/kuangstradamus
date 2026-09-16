import { useState } from 'react'
import Head from 'next/head'
import { redeemCode } from '../lib/api'

export default function Gate({ onUnlock }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!code.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      await redeemCode(code.trim())
      onUnlock()
    } catch (err) {
      setError(err.message)
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-white dark:bg-black text-black dark:text-white">
      <Head>
        <title>Kuangstradamus</title>
      </Head>

      <div className="w-full max-w-sm text-center">
        <div className="text-5xl mb-3" aria-hidden="true">🔮</div>
        <h1 className="text-2xl font-bold mb-1">Kuangstradamus</h1>
        <p className="text-sm opacity-70 mb-6">The oracle is private. Enter your access code.</p>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Access code"
            autoFocus
            autoComplete="off"
            aria-label="Access code"
            className="border border-gray-400 dark:border-gray-600 rounded p-3 text-center tracking-widest bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            type="submit"
            disabled={busy || !code.trim()}
            className="bg-black dark:bg-white text-white dark:text-black px-6 py-3 rounded font-semibold shadow-md hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Checking…' : 'Enter'}
          </button>
        </form>

        {error && <p className="text-red-600 dark:text-red-400 mt-3 text-sm">⚠️ {error}</p>}
        <p className="text-xs opacity-50 mt-6">Access is remembered on this device for 30 days.</p>
      </div>
    </div>
  )
}
