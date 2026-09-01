import { Sequelize } from "sequelize";
import { authsequelize } from "../db/index.js";

/**
 * Permissions / role matrix queries. Shape mirrors the reference
 * repo's roles.queries.js — kept thin because admin UI is out of
 * scope for Phase 1 of JK-Dashboard (only the read endpoints are
 * exposed today; the mutation endpoint is wired but unused).
 */
const rolesQueries = {
  getFeaturesPermissionRoles: async () => {
    return authsequelize.query(
      `SELECT f.featureId, f.featureName, p.permission, r.roleId, r.role
       FROM Features f
       LEFT JOIN RoleFeatures rf ON rf.featureId = f.featureId
       LEFT JOIN Permissions p ON rf.permissionId = p.permissionId
       LEFT JOIN Roles r ON rf.roleId = r.roleId`,
      { type: Sequelize.QueryTypes.SELECT },
    );
  },

  getRoleFeaturePermissions: async () => {
    return authsequelize.query(
      `SELECT r.roleId, r.role,
              f.featureId, f.featureName,
              p.permission, p.permissionName
       FROM Roles r
       LEFT JOIN RoleFeatures rf ON rf.roleId = r.roleId
       LEFT JOIN Features f ON rf.featureId = f.featureId
       LEFT JOIN Permissions p ON rf.permissionId = p.permissionId`,
      { type: Sequelize.QueryTypes.SELECT },
    );
  },

  updateRoleFeaturePermission: async (rows) => {
    // rows: [{ roleId, featureId, permissionId }]
    for (const row of rows) {
      await authsequelize.query(
        `INSERT INTO RoleFeatures (roleFeatureId, roleId, featureId, permissionId, createdAt, modifiedAt)
         VALUES (UUID(), :roleId, :featureId, :permissionId, NOW(), NOW())
         ON DUPLICATE KEY UPDATE permissionId = VALUES(permissionId), modifiedAt = NOW()`,
        {
          replacements: row,
          type: Sequelize.QueryTypes.UPSERT,
        },
      );
    }
  },
};

export default rolesQueries;
