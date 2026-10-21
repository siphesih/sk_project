import React, { useEffect, useState } from "react"
import { useAuth } from "../../context/AuthContext.jsx"

const weekDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
const todayIndex = new Date().getDay() - 1

const moduleColorIndex = (moduleCode) => {
  return [...moduleCode].reduce((total, character) => total + character.charCodeAt(0), 0) % 6
}

const fetchJson = async (path, { method = "GET", body } = {}) => {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || data.error || `Request failed with status ${res.status}`)
  return data
}

export default function Timetable() {
  const { auth } = useAuth()
  const [rows, setRows] = useState(null)

  useEffect(() => {
    fetchJson(`/api/student/timetable?userId=${auth.user.id}`).then(setRows)
  }, [])

  const classesByDay = weekDays.reduce((schedule, day) => {
    schedule[day] = (rows || [])
      .filter((row) => row.day === day)
      .sort((first, second) => first.time.localeCompare(second.time))
    return schedule
  }, {})

  return (
    <div>
      <h4 className="fw-bold mb-1">Timetable</h4>
      <p className="text-muted mb-4">Your weekly class schedule across all enrolled modules.</p>

      <div className="ct-week-grid">
        {rows === null ? (
          <div className="text-center text-muted py-4">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="text-center text-muted py-4">No classes on your timetable yet.</div>
        ) : weekDays.map((day, index) => {
          const dayClasses = classesByDay[day]
          const isToday = index === todayIndex

          return (
            <div className={"ct-day-col" + (isToday ? " ct-day-col--today" : "")} key={day}>
              <div className="ct-day-col__header">
                {isToday && <span className="ct-today-dot" aria-label="Today" />}
                <span>{day}</span>
                {isToday && (
                  <div className="ct-day-popover">
                    <div className="ct-day-popover__title">Today's schedule</div>
                    {dayClasses.length === 0 ? (
                      <div className="ct-day-popover__row text-muted">No classes scheduled.</div>
                    ) : dayClasses.map((classItem, classIndex) => (
                      <div className="ct-day-popover__row" key={`${classItem.moduleCode}-${classIndex}`}>
                        <div className="fw-semibold">{classItem.moduleCode}</div>
                        <div className="small text-muted">{classItem.time} · {classItem.venue}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="ct-day-col__body">
                {dayClasses.length === 0 ? (
                  <div className="ct-day-empty">No classes</div>
                ) : dayClasses.map((classItem, classIndex) => (
                  <div
                    className={`ct-class-block ct-class-block--${moduleColorIndex(classItem.moduleCode)}`}
                    key={`${classItem.moduleCode}-${classIndex}`}
                  >
                    <div className="ct-class-block__code">{classItem.moduleCode}</div>
                    <div className="ct-class-block__meta">{classItem.time}</div>
                    <div className="ct-class-block__meta">{classItem.venue}</div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
