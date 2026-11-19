import { logger } from "../utils/logger.js";
import { Sequelize } from "sequelize";
import { config } from "../config.js";

/**
 * Single MySQL connection to the auth DB. The dashboard data plane
 * goes through AWS Lambda (`AWS_DATA_URL`), so we don't need a
 * second Sequelize instance — auth tables (PlatformUsers, Roles,
 * Permissions, RoleFeatures, UserLoginHistory) all live on `authdb`.
 *
 * Connection setup mirrors the reference repo so a single credential
 * is enough.
 */
const authsequelize = new Sequelize(
  config.db.authName,
  config.db.user,
  config.db.password,
  {
    host: config.db.host,
    port: config.db.port || 3306,
    dialect: "mysql",
    pool: { max: 10, min: 0, acquire: 60000, idle: 10000 },
    dialectOptions: { connectTimeout: 30000 },
    logging: false,
  },
);
authsequelize
  .authenticate()
  .then(() => {
    logger.info(`[db] connected auth=${config.db.authName}`);
  })
  .catch((err) => {
    logger.error(
      `[db] connect failed auth=${config.db.authName}:`,
      err.name,
    );
  });

export { authsequelize };
