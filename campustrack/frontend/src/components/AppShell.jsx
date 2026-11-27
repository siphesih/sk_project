import React, { useEffect } from "react"
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"
import { FiBell, FiChevronRight, FiLogOut, FiMenu, FiSearch } from "react-icons/fi"
import { useAuth } from "../context/AuthContext.jsx"
import ThemeToggle from "./ThemeToggle.jsx"

export default function AppShell({ navItems, roleLabel }) {
  const { auth, signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const handleSignOut = () => {
    signOut()
    navigate("/login")
  }

  useEffect(() => {
    const closeMenu = () => document.body.classList.remove("nav-open")
    window.addEventListener("resize", closeMenu)
    return () => {
      window.removeEventListener("resize", closeMenu)
      closeMenu()
    }
  }, [])

  const toggleMenu = () => document.body.classList.toggle("nav-open")
  const userName = auth?.user?.name || "CampusTrack user"
  const initials = userName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
  const activeItem = navItems.find((item) => item.end
    ? pathname === item.to
    : pathname === item.to || pathname.startsWith(`${item.to}/`))
  const notificationsPath = navItems.find((item) => item.label === "Notifications")?.to

  return (
    <div className="ct-app">
      <aside className="ct-sidebar">
        <div className="ct-brand">
          <div className="ct-brand-icon">CT</div>
          <div>
            <div className="ct-brand-name">CampusTrack</div>
            <div className="ct-brand-sub">Engagement &amp; Risk Tracker</div>
          </div>
        </div>
        <div className="ct-nav-label">{roleLabel} menu</div>
        <nav className="nav flex-column">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
                onClick={() => document.body.classList.remove("nav-open")}
              >
                <item.icon size={17} />
                {item.label}
              </NavLink>
            ))}
        </nav>
        <div className="ct-side-user">
          <div className="ct-avatar">{initials}</div>
          <div className="grow">
            <div className="name">{userName}</div>
            <div className="role">{roleLabel}</div>
          </div>
          <button type="button" className="out" onClick={handleSignOut} aria-label="Sign out">
            <FiLogOut />
          </button>
        </div>
      </aside>
      <button type="button" className="ct-scrim" onClick={() => document.body.classList.remove("nav-open")} aria-label="Close navigation" />

      <div className="ct-content">
        <header className="ct-header">
          <button type="button" className="ct-iconbtn ct-menu-btn" onClick={toggleMenu} aria-label="Open navigation">
            <FiMenu />
          </button>
          <div className="ct-crumb">
            <span>{roleLabel}</span>
            <FiChevronRight />
            <b>{activeItem?.label || "Overview"}</b>
          </div>
          <label className="ct-search">
            <FiSearch />
            <input type="search" placeholder="Search..." aria-label="Search" />
          </label>
          <div className="d-flex align-items-center gap-2 ms-auto-m">
            <ThemeToggle />
            {notificationsPath && (
              <Link to={notificationsPath} className="ct-iconbtn" aria-label="Notifications" title="Notifications">
                <FiBell />
                <span className="dot" />
              </Link>
            )}
            <div className="ct-avatar sm" title={userName}>{initials}</div>
          </div>
        </header>
        <main className="ct-main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
