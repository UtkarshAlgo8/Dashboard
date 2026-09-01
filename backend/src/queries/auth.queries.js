import { Sequelize } from "sequelize";
import { authsequelize } from "../db/index.js";
import PlatformUsers from "../models/auth/PlatformUsers.js";
import UserLoginHistory from "../models/auth/UserLoginHistory.js";

/**
 * Thin query layer for the auth DB.
 * Shape mirrors the reference repo's auth.queries.js so the
 * controllers stay 1:1 portable.
 */
const userQueries = {
  findOne: async (filter) => PlatformUsers.findOne(filter),

  findById: async (id) => {
    const rows = await authsequelize.query(
      `SELECT *
       FROM PlatformUsers pu
       LEFT JOIN Roles r ON r.roleId = pu.roleId
       WHERE pu.userId = :id`,
      { replacements: { id }, type: Sequelize.QueryTypes.SELECT },
    );
    return rows[0] || null;
  },

  find: async (filter) => PlatformUsers.findAll(filter),

  create: async (body) => PlatformUsers.create(body),

  findOneAndUpdate: async (filter, body) => {
    const row = await PlatformUsers.findOne(filter);
    if (!row) throw new Error("Record not found");
    return row.update(body);
  },

  getUsers: async () => {
    return authsequelize.query(
      `SELECT pu.firstName, pu.lastName, pu.email, pu.roleId,
              pu.userId, r.role, r.description
       FROM PlatformUsers pu
       LEFT JOIN Roles r ON r.roleId = pu.roleId`,
      { type: Sequelize.QueryTypes.SELECT },
    );
  },

  logUserHistory: async (body) => UserLoginHistory.create(body),

  updateLogUserHistory: async (userId) => {
    const row = await UserLoginHistory.findOne({ where: { userId } });
    if (!row) throw new Error("Record not found");
    return row.update({ logoutTime: new Date() });
  },
};

export default userQueries;
