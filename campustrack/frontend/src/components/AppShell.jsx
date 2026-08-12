import React from "react"
import { NavLink, Outlet, useNavigate } from "react-router-dom"
import { FiLogOut } from "react-icons/fi"
import { useAuth } from "../context/AuthContext.jsx"

export default function AppShell({ navItems, roleLabel }) {
  const { auth, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = () => {
    signOut()
    navigate("/login")
  }

  return (
    <div className="d-flex flex-column min-vh-100">
      <header className="ct-topbar d-flex align-items-center justify-content-between px-3 px-md-4">
        <div className="d-flex align-items-center gap-2">
          <div className="ct-brand-icon">CT</div>
          <div>
            <div className="fw-bold lh-1">CampusTrack</div>
            <div className="text-muted small lh-1">Engagement &amp; Risk Tracker</div>
          </div>
        </div>
        <div className="d-flex align-items-center gap-3">
          <div className="text-end d-none d-sm-block">
            <div className="fw-semibold small">{auth?.user?.name}</div>
            <div className="text-muted" style={{ fontSize: "0.75rem" }}>{roleLabel}</div>
          </div>
          <button className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1" onClick={handleSignOut}>
            <FiLogOut /> Sign out
          </button>
        </div>
      </header>

      <div className="d-flex flex-grow-1">
        <aside className="ct-sidebar py-3">
          <nav className="nav flex-column">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
              >
                <item.icon size={17} />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="ct-main p-3 p-md-4">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
