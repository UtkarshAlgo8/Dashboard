import { Sequelize, DataTypes } from "sequelize";
import { authsequelize } from "../../db/index.js";

/**
 * Mirrors the reference repo's PlatformUsers table exactly so we
 * can reuse the same DDL / migrations. `timestamps: false` matches
 * the reference; we manage createdAt/modifiedAt manually.
 */
const PlatformUsers = authsequelize.define(
  "PlatformUsers",
  {
    userId: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    roleId: { type: DataTypes.STRING },
    firstName: { type: DataTypes.STRING },
    lastName: { type: DataTypes.STRING },
    userName: { type: DataTypes.STRING },
    reportingManager: { type: DataTypes.STRING },
    plant: { type: DataTypes.STRING },
    department: { type: DataTypes.STRING },
    designation: { type: DataTypes.STRING },
    profilePicUrl: { type: DataTypes.STRING },
    address: { type: DataTypes.STRING },
    region: { type: DataTypes.STRING },
    country: { type: DataTypes.STRING },
    geoLocation: { type: DataTypes.STRING },
    timezone: { type: DataTypes.STRING },
    language: { type: DataTypes.STRING },
    email: { type: DataTypes.STRING },
    phone: { type: DataTypes.STRING },
    password: { type: DataTypes.STRING },
    pin: { type: DataTypes.STRING },
    refreshToken: { type: DataTypes.TEXT },
    forgotPasswordToken: { type: DataTypes.STRING },
    forgotPasswordExpiry: { type: DataTypes.DATE },
    section: { type: DataTypes.STRING(100) },
    userSection: { type: DataTypes.JSON },
    status: { type: DataTypes.STRING },
    otp: { type: DataTypes.STRING },
    otpExpiry: { type: DataTypes.DATE },
    employeeId: { type: DataTypes.STRING, allowNull: true },
    shift: { type: DataTypes.STRING, allowNull: true },
    createdBy: { type: DataTypes.STRING },
    createdAt: { type: DataTypes.DATE, defaultValue: Sequelize.NOW },
    modifiedBy: { type: DataTypes.STRING },
    modifiedAt: {
      type: DataTypes.DATE,
      defaultValue: Sequelize.NOW,
      onUpdate: Sequelize.NOW,
    },
  },
  { timestamps: false, tableName: "PlatformUsers" },
);

export default PlatformUsers;
