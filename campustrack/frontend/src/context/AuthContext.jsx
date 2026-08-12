import React, { createContext, useContext, useEffect, useState } from "react"

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => {
    const raw = localStorage.getItem("campustrack.auth")
    return raw ? JSON.parse(raw) : null
  })

  useEffect(() => {
    if (auth) localStorage.setItem("campustrack.auth", JSON.stringify(auth))
    else localStorage.removeItem("campustrack.auth")
  }, [auth])

  const signIn = (user) => setAuth({ user })
  const signOut = () => setAuth(null)

  return (
    <AuthContext.Provider value={{ auth, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
