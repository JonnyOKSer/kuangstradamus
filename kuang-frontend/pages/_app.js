import { useEffect, useState } from 'react'
import '../styles/globals.css'
import Gate from '../components/Gate'
import { accessStatus, getToken, ACCESS_EVENT } from '../lib/api'

export default function App({ Component, pageProps }) {
  // 'checking' until the backend says whether a code is needed, so the app
  // never flashes before the gate.
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
        // The backend decides access, and it rejects unauthenticated calls on
        // its own. If we cannot reach it we let the app render rather than
        // trapping someone behind a gate we were unable to verify.
        if (alive) setAccess('open')
      })

    const relock = () => setAccess('locked')
    window.addEventListener(ACCESS_EVENT, relock)
    return () => {
      alive = false
      window.removeEventListener(ACCESS_EVENT, relock)
    }
  }, [])

  if (access === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-black text-black dark:text-white">
        <p className="opacity-60 italic">Consulting the stars…</p>
      </div>
    )
  }
  if (access === 'locked') return <Gate onUnlock={() => setAccess('open')} />
  return <Component {...pageProps} />
}
