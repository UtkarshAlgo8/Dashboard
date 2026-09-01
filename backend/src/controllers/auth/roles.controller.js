import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import rolesQueries from "../../queries/roles.queries.js";

/**
 * Read-side role / feature / permission lookups. The mutation
 * endpoint (`updateRoleFeaturePermission`) is wired but intentionally
 * not exposed via the router until Phase 2 — see backend/src/routes/roles.js.
 */
export const getFeaturesPermissionRoles = async (_req, res, next) => {
  try {
    const data = await rolesQueries.getFeaturesPermissionRoles();
    return res
      .status(200)
      .json(new ApiResponse(200, data, "Features fetched successfully"));
  } catch (error) {
    next(new ApiError(500, error.message));
  }
};

export const getRoleWiseFeaturePermissions = async (_req, res, next) => {
  try {
    const data = await rolesQueries.getRoleFeaturePermissions();
    return res
      .status(200)
      .json(new ApiResponse(200, data, "Role permissions fetched"));
  } catch (error) {
    next(new ApiError(500, error.message));
  }
};
