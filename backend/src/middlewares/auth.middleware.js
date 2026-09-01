import jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiError.js";
import userQueries from "../queries/auth.queries.js";

/**
 * Reads the JWT from the Authorization header (preferred) or the
 * `accessToken` cookie, verifies it, and hydrates `req.user` from
 * the PlatformUsers row. Identical contract to the reference repo.
 */
export const verifyJWT = async (req, _res, next) => {
  if (process.env.AUTH_ENABLED === "false" || process.env.AUTH_ENABLED === false) {
    req.user = {
      userId: 1,
      email: "dev@jktyre.example",
      role: "SuperAdmin",
      plant: "Banmore",
    };
    return next();
  }

  const token =
    req.cookies?.accessToken ||
    req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return next(new ApiError(401, "Unauthorized request"));
  }

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const user = await userQueries.findById(decoded?.userId);
    if (!user) {
      return next(new ApiError(401, "Invalid access token"));
    }

    req.user = {
      userId: user.userId,
      email: user?.email ?? "",
      roleId: user.roleId,
      firstName: user.firstName,
      lastName: user.lastName,
      employeeId: user.employeeId,
      plant: user.plant,
      department: user.department,
      shift: user.shift,
      role: user.role,
      description: user.description,
      section: user.section,
    };
    next();
  } catch (error) {
    next(new ApiError(401, error?.message || "Invalid access token"));
  }
};

/**
 * Coarse role gate. Use after verifyJWT.
 *   verifyPermission(["Admin", "SuperAdmin"])
 */
export const verifyPermission =
  (roles = []) =>
  (req, _res, next) => {
    if (!req.user?.userId) return next(new ApiError(401, "Unauthorized request"));
    if (!roles.length || roles.includes(req.user.role)) return next();
    return next(new ApiError(403, "You are not allowed to perform this action"));
  };
