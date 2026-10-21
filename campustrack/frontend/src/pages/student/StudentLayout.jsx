import React from "react"
import AppShell from "../../components/AppShell.jsx"
import { FiGrid, FiCalendar, FiFileText, FiCheckSquare, FiStar, FiMessageSquare, FiBell, FiAward } from "react-icons/fi"

const navItems = [
  { to: "/student", label: "Overview", icon: FiGrid, end: true },
  { to: "/student/timetable", label: "Timetable", icon: FiCalendar },
  { to: "/student/assignments", label: "Assignments", icon: FiFileText },
  { to: "/student/results", label: "Results", icon: FiAward },
  { to: "/student/notifications", label: "Notifications", icon: FiBell },
  { to: "/student/attendance", label: "Mark attendance", icon: FiCheckSquare },
  { to: "/student/ratings", label: "Rate sessions", icon: FiStar },
  { to: "/student/assistant", label: "Assistant", icon: FiMessageSquare },
]

export default function StudentLayout() {
  return <AppShell navItems={navItems} roleLabel="Student" />
}