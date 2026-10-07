import React from "react"
import ChatPanel from "../../components/ChatPanel.jsx"

export default function Assistant() {
  return (
    <div>
      <h4 className="fw-bold mb-1">Assistant</h4>
      <p className="text-muted mb-4">Ask about your roster's attendance or risk standing.</p>
      <ChatPanel
        storageKey="lecturer-assistant"
        greeting="Hi! Ask me things like “how many students are at risk” or “what's average attendance”."
        suggestions={["How many students are at risk?", "What's average attendance?"]}
      />
    </div>
  )
}
