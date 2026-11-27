import React from "react"
import { FiMoon, FiSun } from "react-icons/fi"
import { useTheme } from "../context/ThemeContext.jsx"

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const nextTheme = theme === "dark" ? "light" : "dark"
  const Icon = theme === "dark" ? FiSun : FiMoon

  return (
    <button
      type="button"
      className="ct-iconbtn ct-theme-toggle"
      onClick={toggleTheme}
      aria-label={`Switch to ${nextTheme} mode`}
      aria-pressed={theme === "dark"}
      title={`Switch to ${nextTheme} mode`}
    >
      <Icon />
    </button>
  )
}
