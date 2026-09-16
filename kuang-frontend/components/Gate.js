import { useState } from 'react'
import Head from 'next/head'
import Image from 'next/image'
import Seal from './Seal'
import { Button, Field } from './ui'
import { redeemCode } from '../lib/api'
import { useUI } from '../lib/ui'

export default function Gate({ onUnlock }) {
  const { t } = useUI()
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
    <div className="flex min-h-screen items-center justify-center px-5 py-10">
      <Head><title>Kuangstradamus</title></Head>

      <div className="w-full max-w-xs text-center">
        <div className="relative mx-auto mb-6 h-28 w-28">
          <Image
            src="/kuang.png"
            alt=""
            width={224}
            height={224}
            unoptimized
            priority
            className="h-28 w-28 rounded-full object-cover grayscale"
          />
          <span className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-paper-400/70 dark:ring-ink-700" />
        </div>

        <h1 className="font-display text-2xl tracking-[0.12em]">KUANGSTRADAMUS</h1>
        <p className="han mt-1 text-xs text-ink-500 dark:text-ink-400">闭门 · 请出示口令</p>
        <p className="mt-3 text-sm text-ink-500 dark:text-ink-300">
          {t('The oracle keeps a closed door. Speak the word.', '神谕闭门，请说出口令。')}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <Field
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t('Access code', '访问口令')}
            autoFocus
            autoComplete="off"
            autoCapitalize="none"
            spellCheck="false"
            aria-label={t('Access code', '访问口令')}
            className="text-center tracking-[0.3em]"
          />
          <Button type="submit" disabled={busy || !code.trim()} className="w-full">
            {busy ? t('Consulting…', '占卜中……') : <><Seal char="启" size={18} /> {t('Enter', '入门')}</>}
          </Button>
        </form>

        {error && <p className="mt-3 text-sm text-cinnabar-600 dark:text-cinnabar-400">{error}</p>}
        <p className="mt-8 text-[11px] text-ink-400 dark:text-ink-500">
          {t('Remembered on this device for 30 days.', '本设备记住 30 天。')}
        </p>
      </div>
    </div>
  )
}
