-- Session quizzes: the lecturer describes what was taught, Groq turns it into a
-- 10-question quiz, and each student's score becomes their understanding rating.
-- The server also applies these automatically on start-up (ensureQuizSchema).

ALTER TABLE sessions
  ADD COLUMN description TEXT NULL AFTER topic;

CREATE TABLE IF NOT EXISTS session_quizzes (
  session_id VARCHAR(36) NOT NULL,
  questions LONGTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quiz_attempts (
  session_id VARCHAR(36) NOT NULL,
  student_id VARCHAR(36) NOT NULL,
  answers LONGTEXT NOT NULL,
  score INT NOT NULL,
  total INT NOT NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, student_id),
  KEY student_id (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
