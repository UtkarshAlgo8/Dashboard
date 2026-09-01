import { Sequelize, DataTypes } from "sequelize";
import { authsequelize } from "../../db/index.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Login / logout audit trail. Lives on `authdb` alongside the rest
 * of the auth slice so JK-Dashboard doesn't need a second MySQL
 * connection (the data plane goes through AWS Lambda).
 */
const UserLoginHistory = authsequelize.define(
  "UserLoginHistory",
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
      defaultValue: () => uuidv4(),
    },
    userId: { type: DataTypes.STRING, allowNull: false },
    loginTime: { type: DataTypes.DATE, allowNull: true },
    logoutTime: { type: DataTypes.DATE, allowNull: true },
    ipAddress: { type: DataTypes.STRING, allowNull: true },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },
    modifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      onUpdate: Sequelize.literal("CURRENT_TIMESTAMP"),
    },
  },
  { timestamps: false, tableName: "UserLoginHistory" },
);

export default UserLoginHistory;
