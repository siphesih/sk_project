import React from "react"
import { FiAlertTriangle, FiCheckCircle, FiAlertCircle } from "react-icons/fi"

const CONFIG = {
  Low: { cls: "low", icon: FiCheckCircle },
  Medium: { cls: "medium", icon: FiAlertCircle },
  High: { cls: "high", icon: FiAlertTriangle },
}

export default function RiskBadge({ level, score, showScore = true }) {
  const conf = CONFIG[level] || CONFIG.Low
  const Icon = conf.icon
  return (
    <span className={`ct-risk-badge ${conf.cls}`}>
      <Icon size={15} />
      {level} risk{showScore && score != null ? ` · ${score}/100` : ""}
    </span>
  )
}
