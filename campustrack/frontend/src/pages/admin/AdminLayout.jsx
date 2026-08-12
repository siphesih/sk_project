import React from "react"
import AppShell from "../../components/AppShell.jsx"
import { FiGrid, FiUsers, FiBookOpen } from "react-icons/fi"

const navItems = [
  { to: "/admin", label: "Overview", icon: FiGrid, end: true },
  { to: "/admin/users", label: "Users", icon: FiUsers },
  { to: "/admin/modules", label: "Modules", icon: FiBookOpen },
]

export default function AdminLayout() {
  return <AppShell navItems={navItems} roleLabel="Admin" />
}
