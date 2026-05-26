-- PostgreSQL schema for Police Department Management Application

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  employee_id VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(128) NOT NULL,
  role VARCHAR(32) NOT NULL,
  password VARCHAR(256) NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  zone VARCHAR(64) DEFAULT NULL,
  division VARCHAR(64) DEFAULT NULL,
  reporting_station VARCHAR(128) DEFAULT NULL,
  access_modes VARCHAR(256) DEFAULT NULL,
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
  assigned_officer VARCHAR(128) DEFAULT NULL,
  sent_to_commissioner INTEGER NOT NULL DEFAULT 1,
  latitude DOUBLE PRECISION DEFAULT NULL,
  longitude DOUBLE PRECISION DEFAULT NULL,
  incident_photo TEXT DEFAULT NULL,
  place_photo TEXT DEFAULT NULL,
  remarks TEXT DEFAULT NULL,
  access_mode VARCHAR(64) DEFAULT 'SB Control',
  incident_date VARCHAR(128) DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE bulletins (
  id SERIAL PRIMARY KEY,
  message TEXT NOT NULL,
  severity VARCHAR(32) NOT NULL DEFAULT 'Info',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_reports_area ON reports(area);
CREATE INDEX idx_reports_station ON reports(station);
CREATE INDEX idx_reports_priority ON reports(priority);
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_bulletins_created ON bulletins(created_at);
