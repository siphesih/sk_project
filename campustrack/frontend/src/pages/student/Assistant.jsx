import React from "react"
import { useLocation } from "react-router-dom"
import ChatPanel from "../../components/ChatPanel.jsx"

export default function Assistant() {
  const location = useLocation()
  const autoPrompt = location.state?.autoPrompt

  return (
    <div>
      <h4 className="fw-bold mb-1">Assistant</h4>
      <p className="text-muted mb-4">Ask about your timetable, assignments, or a topic you didn't follow.</p>
      <ChatPanel
        greeting="Hi! Ask me things like “when is my next class” or “what's my next assignment”."
        suggestions={["When is my next class?", "What's my next assignment?", "What topics did I not understand?", "How am I doing?"]}
        autoSend={autoPrompt}
      />
    </div>
  )
}
