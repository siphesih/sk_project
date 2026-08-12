import React from "react"
import { Routes, Route, Navigate } from "react-router-dom"
import ProtectedRoute from "./components/ProtectedRoute.jsx"

import Home from "./pages/Home.jsx"
import Login from "./pages/Login.jsx"

import StudentLayout from "./pages/student/StudentLayout.jsx"
import StudentOverview from "./pages/student/Overview.jsx"
import StudentTimetable from "./pages/student/Timetable.jsx"
import StudentAssignments from "./pages/student/Assignments.jsx"
import StudentMarkAttendance from "./pages/student/MarkAttendance.jsx"
import StudentRatings from "./pages/student/Ratings.jsx"
import StudentAssistant from "./pages/student/Assistant.jsx"

import LecturerLayout from "./pages/lecturer/LecturerLayout.jsx"
import LecturerOverview from "./pages/lecturer/Overview.jsx"
import LecturerAttendance from "./pages/lecturer/Attendance.jsx"
import LecturerRoster from "./pages/lecturer/Roster.jsx"
import LecturerResults from "./pages/lecturer/Results.jsx"
import LecturerAtRisk from "./pages/lecturer/AtRisk.jsx"
import LecturerNotifications from "./pages/lecturer/Notifications.jsx"
import LecturerAssistant from "./pages/lecturer/Assistant.jsx"

import AdminLayout from "./pages/admin/AdminLayout.jsx"
import AdminOverview from "./pages/admin/Overview.jsx"
import AdminUsers from "./pages/admin/Users.jsx"
import AdminModules from "./pages/admin/Modules.jsx"

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />

      <Route path="/student" element={<ProtectedRoute role="student"><StudentLayout /></ProtectedRoute>}>
        <Route index element={<StudentOverview />} />
        <Route path="timetable" element={<StudentTimetable />} />
        <Route path="assignments" element={<StudentAssignments />} />
        <Route path="attendance" element={<StudentMarkAttendance />} />
        <Route path="ratings" element={<StudentRatings />} />
        <Route path="assistant" element={<StudentAssistant />} />
      </Route>

      <Route path="/lecturer" element={<ProtectedRoute role="lecturer"><LecturerLayout /></ProtectedRoute>}>
        <Route index element={<LecturerOverview />} />
        <Route path="attendance" element={<LecturerAttendance />} />
        <Route path="roster" element={<LecturerRoster />} />
        <Route path="results" element={<LecturerResults />} />
        <Route path="at-risk" element={<LecturerAtRisk />} />
        <Route path="notifications" element={<LecturerNotifications />} />
        <Route path="assistant" element={<LecturerAssistant />} />
      </Route>

      <Route path="/admin" element={<ProtectedRoute role="admin"><AdminLayout /></ProtectedRoute>}>
        <Route index element={<AdminOverview />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="modules" element={<AdminModules />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
