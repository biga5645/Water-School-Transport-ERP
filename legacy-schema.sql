-- ================================================================
-- LEGACY SCHEMA — Association Management System
-- Original single-row JSON blob architecture
-- Preserved as backup reference. Do NOT run this in production.
-- ================================================================

-- Table 1: app_config
CREATE TABLE IF NOT EXISTS app_config (
  cfg_key    VARCHAR(64)  NOT NULL COMMENT 'Configuration key (e.g. secret)',
  cfg_value  LONGTEXT     NOT NULL COMMENT 'Configuration value',
  updated_at TIMESTAMP    NOT NULL
             DEFAULT CURRENT_TIMESTAMP
             ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (cfg_key)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Table 2: store_data (single-row JSON blob)
CREATE TABLE IF NOT EXISTS store_data (
  id         INT          NOT NULL COMMENT 'Always 1 (single-row store)',
  data       LONGTEXT     NOT NULL COMMENT 'Full application state as JSON',
  updated_at TIMESTAMP    NOT NULL
             DEFAULT CURRENT_TIMESTAMP
             ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci
  COMMENT='Single-row JSON application store — LEGACY backup only';
