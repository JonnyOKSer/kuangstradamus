'use client'

import { useState } from 'react'
import Head from 'next/head'
import Image from 'next/image'

export default function Home() {
  const [lang, setLang] = useState('en')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])

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
    <div className="min-h-screen flex flex-col items-center justify-start p-4 bg-white text-black">
      <Head>
        <title>{lang === 'en' ? 'Kuangstradamus' : '诺查丹玛斯'}</title>
      </Head>

      <button onClick={toggleLang} className="ml-auto text-sm underline mb-2">
        {lang === 'en' ? '中文' : 'EN'}
      </button>

      <h1 className="text-2xl font-bold mb-4 text-center">
        {lang === 'en' ? 'Kuangstradamus' : '诺查丹玛斯'}
      </h1>

      <div className="w-full max-w-md mb-4">
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
      <div className="w-full max-w-md flex-1 overflow-y-auto mb-4 space-y-2">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`p-2 rounded ${
              msg.role === 'user' ? 'bg-gray-200 text-left' : 'bg-blue-100 text-right'
            }`}
          >
            {msg.content}
          </div>
        ))}
      </div>

      {/* Chat input and button in column layout */}
      <form onSubmit={handleSubmit} className="w-full flex flex-col items-center gap-3">
  <div className="w-full sm:w-3/4">
    <textarea
      value={input}
      onChange={(e) => setInput(e.target.value)}
      placeholder="Ex: Christian McCaffery and Alvin Kamara for Blake Bortles and Antonio Brown"
      rows={4}
      className="w-full border border-gray-400 rounded p-2 resize-none shadow-md"
    />
  </div>
  <div className="w-full sm:w-3/4 flex justify-end">
    <button
      type="submit"
      className="w-full sm:w-auto bg-black text-white px-4 py-2 rounded hover:bg-gray-800 transition-all duration-200 shadow"
    >
      Summon the Prophecy
    </button>
  </div>
</form>
    </div>
  )
}
