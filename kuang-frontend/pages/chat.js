import { useState } from 'react';

export default function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [lang, setLang] = useState('en');

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = { text: input, role: 'user' };
    setMessages((prev) => [...prev, userMessage]);

    // Step 1: Trade Analysis
    const resTrade = await fetch('https://kuangstradamus.up.railway.app/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: input, lang, mode: 'trade' }),
    });
    const dataTrade = await resTrade.json();
    const tradeReply = { text: dataTrade.reply, role: 'bot' };
    setMessages((prev) => [...prev, tradeReply]);

    // Step 2: Chinese Proverb
    const resProverb = await fetch('https://kuangstradamus.up.railway.app/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: input, lang, mode: 'proverb' }),
    });
    const dataProverb = await resProverb.json();
    const proverbReply = { text: dataProverb.reply, role: 'bot' };
    setMessages((prev) => [...prev, proverbReply]);

    setInput('');
  };

  return (
    <div className="flex flex-col h-screen p-4 bg-black text-white font-sans">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Kuangstradamus</h1>
        <button onClick={() => setLang(lang === 'en' ? 'zh' : 'en')} className="text-sm underline">
          {lang === 'en' ? '中文' : 'EN'}
        </button>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 px-2">
        {messages.map((msg, idx) => (
          <div key={idx} className={`p-2 rounded-md max-w-[75%] ${msg.role === 'user' ? 'bg-blue-700 self-end ml-auto' : 'bg-gray-700 self-start mr-auto'}`}>
            {msg.text}
          </div>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="mt-4 flex">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={lang === 'en' ? 'Ask me anything…' : '问我任何事...'}
          className="flex-1 p-2 rounded-l-md bg-gray-800 border border-gray-600 outline-none"
        />
        <button type="submit" className="bg-green-600 px-4 rounded-r-md hover:bg-green-700">Send</button>
      </form>
    </div>
  );
}
