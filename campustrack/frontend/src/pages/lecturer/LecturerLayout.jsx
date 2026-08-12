import React from "react"
import AppShell from "../../components/AppShell.jsx"
import { FiGrid, FiCheckSquare, FiUsers, FiFileText, FiAlertTriangle, FiBell, FiMessageSquare } from "react-icons/fi"

const navItems = [
  { to: "/lecturer", label: "Overview", icon: FiGrid, end: true },
  { to: "/lecturer/attendance", label: "Attendance", icon: FiCheckSquare },
  { to: "/lecturer/roster", label: "Roster", icon: FiUsers },
  { to: "/lecturer/results", label: "Results", icon: FiFileText },
  { to: "/lecturer/at-risk", label: "At-risk students", icon: FiAlertTriangle },
  { to: "/lecturer/notifications", label: "Notifications", icon: FiBell },
  { to: "/lecturer/assistant", label: "Assistant", icon: FiMessageSquare },
]

export default function LecturerLayout() {
  return <AppShell navItems={navItems} roleLabel="Lecturer" />
}
