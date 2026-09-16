'use client'

import { useState, useEffect } from 'react'
import Head from 'next/head'
import Image from 'next/image'
import Link from 'next/link'
import { api, fmt } from '../lib/api'

const SCORING = [
  { value: 'ppr', en: 'PPR', zh: '每次接球1分' },
  { value: 'half_ppr', en: 'Half PPR', zh: '每次接球0.5分' },
  { value: 'std', en: 'Standard', zh: '标准' },
]

export default function Home() {
  const [lang, setLang] = useState('en')
  const [dark, setDark] = useState(false)
  const [input, setInput] = useState('')
  const [scoring, setScoring] = useState('ppr')
  const [messages, setMessages] = useState([])
  const [analysis, setAnalysis] = useState(null)
  const [showTable, setShowTable] = useState(false)
  const [loading, setLoading] = useState(false)

  const t = (en, zh) => (lang === 'zh' ? zh : en)

  const startOver = () => {
    setMessages([])
    setAnalysis(null)
    setShowTable(false)
    setInput('')
  }
  const hasSession = messages.length > 0 || !!analysis
  const toggleLang = () => setLang(lang === 'en' ? 'zh' : 'en')
  const toggleDark = () => setDark(!dark)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!input.trim() || loading) return

    setMessages((prev) => [...prev, { role: 'user', content: input }])
    const message = input
    setInput('')
    setShowTable(false)
    setLoading(true)

    try {
      const data = await api('/api/chat', { method: 'POST', body: { message, lang, scoring } })
      const reply = { role: 'assistant', content: data.reply }
      const proverb = data.proverb?.[lang] ? { role: 'proverb', content: `🧧 ${data.proverb[lang]}` } : null
      setMessages((prev) => [...prev, reply, ...(proverb ? [proverb] : [])])
      setAnalysis(data.analysis || null)
    } catch (err) {
      console.error('❌ Error calling API:', err)
      setMessages((prev) => [...prev, { role: 'assistant', content: `${t('Failed to summon prophecy.', '召唤预言失败。')} ${err.message}` }])
      setAnalysis(null)
    } finally {
      setLoading(false)
    }
  }

  const renderTable = () => {
    const players = analysis?.players
    if (!players || (!players.teamA?.length && !players.teamB?.length)) return null

    const row = (p, side) => (
      <tr key={`${side}-${p.id || p.name}`} className="align-top">
        <td className="border px-2 py-1 font-semibold">{side}</td>
        <td className="border px-2 py-1">
          {p.name}
          {p.matchedFrom && p.matchedFrom.toLowerCase() !== p.name.toLowerCase() && (
            <span className="block text-xs opacity-60">{t('from', '输入')} “{p.matchedFrom}”</span>
          )}
        </td>
        <td className="border px-2 py-1">{p.team || '—'}</td>
        <td className="border px-2 py-1">{p.position}</td>
        <td className="border px-2 py-1 text-right">{fmt(p.points)}</td>
        <td className="border px-2 py-1 text-right font-semibold">{fmt(p.value)}</td>
        <td className="border px-2 py-1">{p.rank || '—'}</td>
        <td className="border px-2 py-1">{p.byeWeek || '—'}</td>
        <td className="border px-2 py-1 text-xs">
          {p.flags?.length ? p.flags.map((f) => <div key={f.text}>⚠️ {f.text}</div>) : p.injuryStatus || '—'}
        </td>
      </tr>
    )

    return (
      <div className="w-full max-w-4xl mt-4 overflow-x-auto">
        <table className="w-full border text-sm">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-800">
              <th className="border px-2 py-1">{t('Side', '方')}</th>
              <th className="border px-2 py-1">{t('Player', '球员')}</th>
              <th className="border px-2 py-1">{t('Team', '球队')}</th>
              <th className="border px-2 py-1">{t('Pos', '位置')}</th>
              <th className="border px-2 py-1">{t('ROS pts', '剩余赛季分')}</th>
              <th className="border px-2 py-1">{t('Value', '价值')}</th>
              <th className="border px-2 py-1">{t('Rank', '排名')}</th>
              <th className="border px-2 py-1">{t('Bye', '轮空')}</th>
              <th className="border px-2 py-1">{t('Notes', '备注')}</th>
            </tr>
          </thead>
          <tbody>
            {players.teamA.map((p) => row(p, 'A'))}
            {players.teamB.map((p) => row(p, 'B'))}
          </tbody>
        </table>
        {analysis?.context && (
          <p className="text-xs opacity-70 mt-2">
            {t('Value = rest-of-season points above a free replacement at the position.', '价值 = 剩余赛季得分减去同位置可免费获得的替补球员得分。')}{' '}
            {analysis.context.season} {t('week', '第')} {analysis.context.fromWeek}{t('', '周')}–{analysis.context.throughWeek} · {analysis.context.scoring} · {analysis.context.source}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-start p-4 bg-white dark:bg-black text-black dark:text-white transition-colors duration-300">
      <Head>
        <title>{t('Kuangstradamus', '诺查丹玛斯')}</title>
      </Head>

      <div className="w-full max-w-4xl flex justify-between items-center mb-4">
        <Link href="/league" className="text-sm underline opacity-80 hover:opacity-100">
          {t('League analyzer →', '联盟分析 →')}
        </Link>
        <div className="flex gap-2">
          <button onClick={toggleLang} className="border px-2 py-1 rounded text-sm">
            {lang === 'en' ? '中文' : 'EN'}
          </button>
          <button onClick={toggleDark} className="border px-2 py-1 rounded text-sm">
            🌙 {dark ? t('Light', '浅色') : t('Dark', '深色')}
          </button>
        </div>
      </div>

      <h1 className="text-3xl font-bold mb-6 text-center">{t('Kuangstradamus', '诺查丹玛斯')}</h1>

      <div className="w-full max-w-md mb-6">
        <Image
          src="/kuang.png"
          alt="Kuangstradamus"
          width={500}
          height={600}
          style={{ width: '100%', height: 'auto' }}
          className="rounded-lg shadow-md"
          unoptimized
          priority
        />
      </div>

      {messages.length > 0 && (
        <div className="w-full max-w-md flex-1 overflow-y-auto mb-4 space-y-2">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`p-2 rounded ${
                msg.role === 'user'
                  ? 'bg-gray-200 dark:bg-gray-800 text-left'
                  : msg.role === 'proverb'
                  ? 'bg-yellow-100 dark:bg-yellow-800 italic text-center'
                  : 'bg-blue-100 dark:bg-blue-900 text-right'
              }`}
            >
              {msg.content}
            </div>
          ))}
          {loading && <div className="p-2 rounded bg-blue-50 dark:bg-blue-950 text-right italic opacity-70">{t('Consulting the stars…', '观星中……')}</div>}
        </div>
      )}

      <div className="flex flex-wrap gap-2 justify-center mb-4">
        {analysis && !showTable && (
          <button
            onClick={() => setShowTable(true)}
            className="px-4 py-2 rounded bg-indigo-500 text-white dark:bg-indigo-300 dark:text-black shadow hover:opacity-90 transition-all"
          >
            🎴 {t('Enter the Tenth Quatrain', '进入第十诗节')}
          </button>
        )}
        {hasSession && (
          <button
            onClick={startOver}
            className="px-4 py-2 rounded border border-gray-400 dark:border-gray-600 shadow-sm hover:opacity-80 transition-all"
          >
            ↺ {t('Ok, start over', '好的，重新开始')}
          </button>
        )}
      </div>

      {showTable && renderTable()}

      <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto flex flex-col gap-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t(
            'Ex: Christian McCaffrey and Puka Nacua for Bijan Robinson, Jake Ferguson and a 2027 1st',
            '例如：Christian McCaffrey and Puka Nacua for Bijan Robinson and Jake Ferguson（请用英文球员名）',
          )}
          rows={4}
          className="w-full border border-gray-400 dark:border-gray-600 rounded p-3 resize-none shadow-md focus:outline-none focus:ring-2 focus:ring-fndm-green bg-white dark:bg-gray-900"
        />
        <div className="flex justify-between items-center gap-3">
          <select
            value={scoring}
            onChange={(e) => setScoring(e.target.value)}
            className="border border-gray-400 dark:border-gray-600 rounded px-2 py-2 text-sm bg-white dark:bg-gray-900"
            aria-label={t('Scoring format', '计分方式')}
          >
            {SCORING.map((s) => (
              <option key={s.value} value={s.value}>{lang === 'zh' ? s.zh : s.en}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={loading}
            className="bg-black dark:bg-white text-white dark:text-black px-6 py-3 rounded hover:opacity-90 transition-all duration-200 shadow-md font-semibold disabled:opacity-50"
          >
            ✨ {t('Summon the Prophecy', '召唤预言')}
          </button>
        </div>
      </form>
    </div>
  )
}
