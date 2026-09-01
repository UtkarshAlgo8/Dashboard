import { Sequelize, DataTypes } from "sequelize";
import { authsequelize } from "../../db/index.js";

const Features = authsequelize.define(
  "Features",
  {
    featureId: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    featureName: { type: DataTypes.STRING },
    description: { type: DataTypes.TEXT },
    createdBy: { type: DataTypes.STRING },
    createdAt: { type: DataTypes.DATE, defaultValue: Sequelize.NOW },
    modifiedBy: { type: DataTypes.STRING },
    modifiedAt: {
      type: DataTypes.DATE,
      defaultValue: Sequelize.NOW,
      onUpdate: Sequelize.NOW,
    },
  },
  { timestamps: false, tableName: "Features" },
);

export default Features;
