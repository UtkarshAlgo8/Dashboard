-- Auth tables for JK-Dashboard — mirrors the DDL used by
-- JKTyres-Process-Audit-BE so the same seed users / roles can be
-- shared between the two apps.
--
-- Run once against the auth DB (default name: `authdb`).
--   mysql -u root -p authdb < 2026-09-01-auth-tables.sql
--
-- The schema is unchanged from the reference repo on purpose; only
-- names that the Sequelize models explicitly reference are forced
-- (tableName, column types). Indices are kept conservative — the
-- reference repo adds them lazily via later migrations.

-- ---------------------------------------------------------------------------
-- PlatformUsers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS PlatformUsers (
  userId                CHAR(36)     NOT NULL,
  roleId                VARCHAR(36)  NULL,
  firstName             VARCHAR(255) NULL,
  lastName              VARCHAR(255) NULL,
  userName              VARCHAR(255) NULL,
  reportingManager      VARCHAR(255) NULL,
  plant                 VARCHAR(255) NULL,
  department            VARCHAR(255) NULL,
  designation           VARCHAR(255) NULL,
  profilePicUrl         VARCHAR(255) NULL,
  address               VARCHAR(255) NULL,
  region                VARCHAR(255) NULL,
  country               VARCHAR(255) NULL,
  geoLocation           VARCHAR(255) NULL,
  timezone              VARCHAR(255) NULL,
  language              VARCHAR(255) NULL,
  email                 VARCHAR(255) NULL,
  phone                 VARCHAR(255) NULL,
  password              VARCHAR(255) NULL,
  pin                   VARCHAR(255) NULL,
  refreshToken          TEXT         NULL,
  forgotPasswordToken   VARCHAR(255) NULL,
  forgotPasswordExpiry  DATETIME     NULL,
  section               VARCHAR(100) NULL,
  userSection           JSON         NULL,
  status                VARCHAR(50)  NULL,
  otp                   VARCHAR(10)  NULL,
  otpExpiry             DATETIME     NULL,
  employeeId            VARCHAR(255) NULL,
  shift                 VARCHAR(50)  NULL,
  createdBy             VARCHAR(255) NULL,
  createdAt             DATETIME     NULL,
  modifiedBy            VARCHAR(255) NULL,
  modifiedAt            DATETIME     NULL,
  PRIMARY KEY (userId),
  UNIQUE KEY uk_platformusers_email (email),
  UNIQUE KEY uk_platformusers_employeeid (employeeId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Roles (
  roleId      CHAR(36)     NOT NULL,
  role        VARCHAR(255) NULL,
  description TEXT         NULL,
  createdBy   VARCHAR(255) NULL,
  createdAt   DATETIME     NULL,
  modifiedBy  VARCHAR(255) NULL,
  modifiedAt  DATETIME     NULL,
  PRIMARY KEY (roleId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Features
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Features (
  featureId   CHAR(36)     NOT NULL,
  featureName VARCHAR(255) NULL,
  description TEXT         NULL,
  createdBy   VARCHAR(255) NULL,
  createdAt   DATETIME     NULL,
  modifiedBy  VARCHAR(255) NULL,
  modifiedAt  DATETIME     NULL,
  PRIMARY KEY (featureId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Permissions (
  permissionId   CHAR(36)     NOT NULL,
  permissionName VARCHAR(255) NULL,
  permission     TEXT         NULL,
  createdBy      VARCHAR(255) NULL,
  createdAt      DATETIME     NULL,
  modifiedBy     VARCHAR(255) NULL,
  modifiedAt     DATETIME     NULL,
  PRIMARY KEY (permissionId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- RoleFeatures
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS RoleFeatures (
  roleFeatureId CHAR(36)     NOT NULL,
  roleId        VARCHAR(36)  NULL,
  featureId     VARCHAR(36)  NULL,
  permissionId  VARCHAR(36)  NULL,
  createdBy     VARCHAR(255) NULL,
  createdAt     DATETIME     NULL,
  modifiedBy    VARCHAR(255) NULL,
  modifiedAt    DATETIME     NULL,
  PRIMARY KEY (roleFeatureId),
  UNIQUE KEY uk_rolefeatures (roleId, featureId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- UserLoginHistory (login / logout audit trail). Lives on `authdb`
-- alongside the rest of the auth slice — JK-Dashboard has no other
-- MySQL DB (data plane goes through AWS Lambda).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS UserLoginHistory (
  id          VARCHAR(64)  NOT NULL,
  userId      VARCHAR(64)  NOT NULL,
  loginTime   DATETIME     NULL,
  logoutTime  DATETIME     NULL,
  ipAddress   VARCHAR(64)  NULL,
  createdAt   DATETIME     NULL,
  modifiedAt  DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_userloginhistory_userid (userId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
