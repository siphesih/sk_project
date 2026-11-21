-- Fixes databases created from a copy of campustrack_db.sql that defined the
-- `ratings` table with utf8mb4_general_ci while every other table uses
-- utf8mb4_unicode_ci. MariaDB/MySQL then refuse every query that joins ratings
-- ("Illegal mix of collations"), which breaks the roster, attendance lists,
-- session lists, the assistant and predictions.
-- The server also applies this automatically on start-up (ensureMatchingCollations).

ALTER TABLE ratings CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
