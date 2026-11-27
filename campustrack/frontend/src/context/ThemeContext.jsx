import React, { createContext, useContext, useLayoutEffect, useState } from "react"

const ThemeContext = createContext(null)
const THEME_STORAGE_KEY = "campustrack-theme"

const getInitialTheme = () => {
  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (savedTheme === "light" || savedTheme === "dark") return savedTheme
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme)

  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.setAttribute("data-bs-theme", theme)
  }, [theme])

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark"
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
    setTheme(nextTheme)
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error("useTheme must be used within a ThemeProvider")
  return context
}
