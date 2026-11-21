ALTER TABLE sessions
  ADD COLUMN lecturer_lat DECIMAL(9,6) NULL,
  ADD COLUMN lecturer_lng DECIMAL(9,6) NULL,
  ADD COLUMN lecturer_accuracy_m INT NULL;

ALTER TABLE attendance
  ADD COLUMN latitude DECIMAL(9,6) NULL,
  ADD COLUMN longitude DECIMAL(9,6) NULL,
  ADD COLUMN accuracy_m INT NULL,
  ADD COLUMN distance_m INT NULL,
  ADD COLUMN location_status ENUM('verified','outside_radius','no_location','not_checked') NOT NULL DEFAULT 'not_checked';