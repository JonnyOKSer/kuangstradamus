'use client'

import { useState, useEffect } from 'react'
import Head from 'next/head'
import Image from 'next/image'

export default function Home() {
  const [lang, setLang] = useState('en')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [darkMode, setDarkMode] = useState(false)

  // Load dark mode preference from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('darkMode')
    if (stored === 'true') setDarkMode(true)
  }, [])

  // Toggle dark mode and persist
  const toggleDarkMode = () => {
    setDarkMode(prev => {
      localStorage.setItem('darkMode', !prev)
      return !prev
    })
  }

  const toggleLang = () => setLang(lang === 'en' ? 'zh' : 'en')

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
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }])
    } catch (err) {
      console.error('❌ Error calling API:', err)
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Failed to summon prophecy.' }])
    }
  }

  return (
    <div className={`${darkMode ? 'dark' : ''}`}>
      <div className="min-h-screen flex flex-col items-center justify-start px-4 py-8 bg-white text-black dark:bg-black dark:text-white transition-colors duration-300">
        <Head>
          <title>{lang === 'en' ? 'Kuangstradamus' : '诺查丹玛斯'}</title>
        </Head>

        <div className="w-full max-w-4xl flex flex-col items-center relative">
          {/* Language + Dark Mode Toggle */}
          <div className="absolute right-0 top-0 flex gap-2">
            <button onClick={toggleLang} className="text-sm underline">
              {lang === 'en' ? '中文' : 'EN'}
            </button>
            <button
              onClick={toggleDarkMode}
              className="text-sm underline"
            >
              {darkMode ? '☀️ Light' : '🌙 Dark'}
            </button>
          </div>

          {/* Title */}
          <h1 className="text-3xl font-extrabold mb-6 text-center">
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
              className="rounded-lg"
              unoptimized
            />
          </div>

          {/* Chat thread */}
          <div className="w-full max-w-2xl flex-1 overflow-y-auto mb-6 space-y-2">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`p-3 rounded-md whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-gray-200 text-left dark:bg-gray-700'
                    : 'bg-blue-100 text-right dark:bg-blue-900'
                }`}
              >
                {msg.content}
              </div>
            ))}
          </div>

          {/* Input + Button */}
          <form onSubmit={handleSubmit} className="w-full max-w-2xl flex flex-col gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="[Test Mode Only, Use 2021 Players] Ex: Christian McCaffrey and Alvin Kamara for Blake Bortles and Antonio Brown"
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm resize-none bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-fndm-green transition-all duration-200"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                className="bg-black dark:bg-white text-white dark:text-black px-6 py-2 rounded-md hover:opacity-90 shadow-lg transition-all duration-200 focus:ring-2 focus:ring-offset-2 focus:ring-fndm-green"
              >
                ✨ Summon the Prophecy
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
