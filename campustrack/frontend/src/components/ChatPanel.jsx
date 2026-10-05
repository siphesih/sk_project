import React, { useEffect, useRef, useState } from "react"
import { FiSend, FiCpu } from "react-icons/fi"
import { useAuth } from "../context/AuthContext.jsx"

const fetchJson = async (path, { method = "GET", body } = {}) => {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || data.error || `Request failed with status ${res.status}`)
  return data
}

export default function ChatPanel({ greeting, suggestions, autoSend }) {
  const { auth } = useAuth()
  const [messages, setMessages] = useState([{ role: "assistant", text: greeting }])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)
  const autoSendFired = useRef(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const send = async (text) => {
    const value = (text ?? input).trim()
    if (!value) return
    setMessages((m) => [...m, { role: "user", text: value }])
    setInput("")
    setSending(true)
    try {
      const res = await fetchJson("/api/chatbot", {
        method: "POST",
        body: { userId: auth.user.id, message: value },
      })
      setMessages((m) => [...m, { role: "assistant", text: res.reply }])
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", text: "Sorry, I couldn't reach the assistant just now." }])
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    if (autoSend && !autoSendFired.current) {
      autoSendFired.current = true
      send(autoSend)
    }
  }, [autoSend])

  return (
    <div className="card d-flex flex-column" style={{ height: "60vh" }}>
      <div className="d-flex align-items-center gap-2 border-bottom p-3">
        <div className="ct-stat-icon bg-primary bg-opacity-10"><FiCpu className="text-primary" /></div>
        <div>
          <div className="fw-semibold">CampusTrack assistant</div>
          <div className="text-muted small">Rule-based · answers from your own data</div>
        </div>
      </div>

      <div className="flex-grow-1 overflow-auto p-3 d-flex flex-column gap-2">
        {messages.map((m, i) => (
          <div key={i} className={"d-flex " + (m.role === "user" ? "justify-content-end" : "justify-content-start")}>
            <div className={`ct-chat-bubble ${m.role}`}>{m.text}</div>
          </div>
        ))}
        {sending && <div className="text-muted small">Assistant is typing…</div>}
        <div ref={bottomRef} />
      </div>

      {suggestions?.length > 0 && (
        <div className="d-flex flex-wrap gap-2 px-3 pb-2">
          {suggestions.map((s) => (
            <button key={s} type="button" className="btn btn-outline-secondary btn-sm" onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="d-flex gap-2 border-top p-3"
        onSubmit={(e) => { e.preventDefault(); send() }}
      >
        <input
          className="form-control"
          placeholder="Ask the CampusTrack assistant…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="btn btn-primary d-flex align-items-center gap-1" disabled={sending || !input.trim()}>
          <FiSend />
        </button>
      </form>
    </div>
  )
}
