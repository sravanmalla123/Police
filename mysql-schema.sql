-- ============================================================
-- AP Police Department Portal — MySQL Production Schema
-- Run this script ONCE on your Railway/MySQL database before
-- starting the application for the first time.
-- ============================================================

CREATE DATABASE IF NOT EXISTS police_portal
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE police_portal;

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  employee_id   VARCHAR(64)     NOT NULL,
  name          VARCHAR(128)    NOT NULL,
  role          VARCHAR(32)     NOT NULL,
  password      VARCHAR(256)    NOT NULL,
  is_admin      TINYINT(1)      NOT NULL DEFAULT 0,
  zone          VARCHAR(64)     DEFAULT NULL,
  division      VARCHAR(64)     DEFAULT NULL,
  reporting_station VARCHAR(128) DEFAULT NULL,
  access_modes  VARCHAR(256)    DEFAULT NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_employee_id (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Reports ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id                    INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  user_id               INT UNSIGNED    NOT NULL,
  area                  VARCHAR(128)    NOT NULL,
  station               VARCHAR(128)    NOT NULL,
  officer_name          VARCHAR(128)    NOT NULL,
  priority              ENUM('High','Medium','Low') NOT NULL DEFAULT 'Medium',
  description           TEXT            NOT NULL,
  status                ENUM('pending','in_review','resolved') NOT NULL DEFAULT 'pending',
  assigned_officer      VARCHAR(128)    DEFAULT NULL,
  sent_to_commissioner  TINYINT(1)      NOT NULL DEFAULT 1,
  latitude              DOUBLE          DEFAULT NULL,
  longitude             DOUBLE          DEFAULT NULL,
  incident_photo        LONGTEXT        DEFAULT NULL,
  place_photo           LONGTEXT        DEFAULT NULL,
  remarks               TEXT            DEFAULT NULL,
  access_mode           VARCHAR(64)     DEFAULT 'SB Control',
  incident_date         VARCHAR(128)    DEFAULT NULL,
  created_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_user_id   (user_id),
  KEY idx_status    (status),
  KEY idx_priority  (priority),
  KEY idx_area      (area(32)),
  KEY idx_station   (station(32)),
  KEY idx_created   (created_at),
  CONSTRAINT fk_reports_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Bulletins ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bulletins (
  id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  message     TEXT            NOT NULL,
  severity    ENUM('Critical','High','Medium','Low','Info') NOT NULL DEFAULT 'Info',
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_severity  (severity),
  KEY idx_created   (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
