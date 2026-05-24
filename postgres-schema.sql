-- PostgreSQL schema for Police Department Management Application

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  employee_id VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(128) NOT NULL,
  role VARCHAR(32) NOT NULL,
  password VARCHAR(256) NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE reports (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  area VARCHAR(128) NOT NULL,
  station VARCHAR(128) NOT NULL,
  officer_name VARCHAR(128) NOT NULL,
  priority VARCHAR(32) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  sent_to_commissioner INTEGER NOT NULL DEFAULT 1,
  remarks TEXT DEFAULT NULL
);

CREATE INDEX idx_reports_area ON reports(area);
CREATE INDEX idx_reports_station ON reports(station);
CREATE INDEX idx_reports_priority ON reports(priority);
CREATE INDEX idx_reports_status ON reports(status);
