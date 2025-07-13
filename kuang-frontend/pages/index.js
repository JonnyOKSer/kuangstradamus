'use client'

import { useState, useEffect } from 'react'
import Head from 'next/head'
import Image from 'next/image'

export default function Home() {
  const [lang, setLang] = useState('en')
  const [dark, setDark] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])

  const toggleLang = () => setLang(lang === 'en' ? 'zh' : 'en')
  const toggleDark = () => setDark(!dark)

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [dark])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!input.trim()) return

    const userMessage = { role: 'user', content: input }
    setMessages((prev) => [...prev, userMessage])
    setInput('')

    try {
      const res = await fetch('https://kuangstradamus-production.up.railway.app/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input, lang }),
      })

      if (!res.ok) throw new Error(`Server responded with ${res.status}`)

      const data = await res.json()

      const reply = { role: 'assistant', content: data.reply }
      const proverb = data.proverb
        ? { role: 'proverb', content: `🧧 ${data.proverb}` }
        : null

      setMessages((prev) => [...prev, reply, ...(proverb ? [proverb] : [])])
    } catch (err) {
      console.error('❌ Error calling API:', err)
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Failed to summon prophecy.' }])
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-start p-4 bg-white dark:bg-black text-black dark:text-white transition-colors duration-300">
      <Head>
        <title>{lang === 'en' ? 'Kuangstradamus' : '诺查丹玛斯'}</title>
      </Head>

      {/* Top toggles */}
      <div className="flex gap-2 mb-4 self-end">
        <button onClick={toggleLang} className="border px-2 py-1 rounded text-sm">
          {lang === 'en' ? '中文' : 'EN'}
        </button>
        <button onClick={toggleDark} className="border px-2 py-1 rounded text-sm">
          🌙 {dark ? 'Light' : 'Dark'}
        </button>
      </div>

      {/* Title */}
      <h1 className="text-3xl font-bold mb-6 text-center">
        {lang === 'en' ? 'Kuangstradamus' : '诺查丹玛斯'}
      </h1>

      {/* Image */}
      <div className="w-full max-w-md mb-6">
        <Image
          src="/kuang.png"
          alt="Kuangstradamus"
          width={500}
          height={600}
          layout="responsive"
          className="rounded-lg shadow-md"
          unoptimized
        />
      </div>

      {/* Chat thread */}
      <div className="w-full max-w-md flex-1 overflow-y-auto mb-4 space-y-2 min-h-[50px]">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`p-2 rounded ${
              msg.role === 'user'
                ? 'bg-gray-200 dark:bg-gray-800 text-left'
                : msg.role === 'proverb'
                ? 'bg-yellow-100 dark:bg-yellow-900 italic text-center'
                : 'bg-blue-100 dark:bg-blue-900 text-right'
            }`}
          >
            {msg.content}
          </div>
        ))}
      </div>

      {/* Chat input and button */}
      <form onSubmit={handleSubmit} className="w-full max-w-[900px] mx-auto flex flex-col gap-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="[Test Mode Only, Use 2021 Players] Ex: Christian McCaffrey and Alvin Kamara for Blake Bortles and Antonio Brown"
          rows={4}
          className="w-full border border-gray-400 dark:border-gray-600 rounded p-3 resize-none shadow-md focus:outline-none focus:ring-2 focus:ring-fndm-green bg-white dark:bg-gray-900"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            className="bg-black dark:bg-white text-white dark:text-black px-6 py-3 rounded hover:opacity-90 transition-all duration-200 shadow-md font-semibold"
          >
            ✨ Summon the Prophecy
          </button>
        </div>
      </form>
    </div>
  )
}
