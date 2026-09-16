import { useEffect, useState } from 'react'
import Head from 'next/head'
import { Cormorant_Garamond, Inter } from 'next/font/google'
import '../styles/globals.css'
import Gate from '../components/Gate'
import { UIProvider } from '../lib/ui'
import { accessStatus, getToken, ACCESS_EVENT } from '../lib/api'

// Garamond for the oracle's voice — the face of the printing houses that
// actually set Nostradamus. Inter carries the data, where legibility at small
// sizes matters more than character. Chinese falls back to the system serif
// rather than pulling a multi-megabyte CJK webfont for a handful of glyphs.
const display = Cormorant_Garamond({ subsets: ['latin'], weight: ['400', '500', '600'], display: 'swap' })
const sans = Inter({ subsets: ['latin'], display: 'swap' })

export default function App({ Component, pageProps }) {
  const [access, setAccess] = useState('checking')

  useEffect(() => {
    let alive = true

    accessStatus()
      .then(({ required }) => {
        if (!alive) return
        if (!required) return setAccess('open')
        setAccess(getToken() ? 'open' : 'locked')
      })
      .catch(() => {
        // The backend is the real lock and rejects unauthenticated calls on its
        // own, so an unreachable API renders the app rather than trapping
        // someone behind a gate we could not verify.
        if (alive) setAccess('open')
      })

    const relock = () => setAccess('locked')
    window.addEventListener(ACCESS_EVENT, relock)
    return () => {
      alive = false
      window.removeEventListener(ACCESS_EVENT, relock)
    }
  }, [])

  return (
    <UIProvider>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#fbf8f2" />
        <meta
          name="description"
          content="Kuangstradamus — the oracle of fantasy football. Trade verdicts and league insight from free Sleeper data."
        />
      </Head>

      <style jsx global>{`
        :root {
          --font-serif-display: ${display.style.fontFamily};
          --font-sans-ui: ${sans.style.fontFamily};
          --font-han-serif: "Noto Serif SC", "Songti SC", "SimSun", serif;
        }
      `}</style>

      {access === 'checking' ? (
        <Waiting />
      ) : access === 'locked' ? (
        <Gate onUnlock={() => setAccess('open')} />
      ) : (
        <Component {...pageProps} />
      )}
    </UIProvider>
  )
}

function Waiting() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="font-display text-lg text-ink-400 dark:text-ink-500">Consulting the stars…</p>
    </div>
  )
}
