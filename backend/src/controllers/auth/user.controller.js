import crypto from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Op } from "sequelize";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { authsequelize } from "../../db/index.js";
import userQueries from "../../queries/auth.queries.js";
import {
  generateAccessToken,
  generateRefreshToken,
  generateHashPassword,
  isPasswordCorrect,
  generateTemporaryToken,
} from "../../utils/jwt.js";

/**
 * Port of the reference repo's user controller. Only the routes we
 * actually expose on JK-Dashboard are kept:
 *   loginUser, logoutUser, refreshAccessToken, getCurrentUser,
 *   changeCurrentPassword, forgotPasswordRequest,
 *   resetForgottenPassword, userList, getUserPermission.
 *
 * The OTP/mail-based flows (`requestForgotPassword`,
 * `verifyOtpAndResetPassword`) are intentionally NOT ported — the
 * user said credentials are managed out-of-band, so the mailgun
 * dependency would be dead weight.
 */

const parseStoredUserSections = (value) => {
  if (value === undefined || value === null || value === "") return [];
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = [];
    }
  }
  if (!Array.isArray(parsed)) parsed = [parsed];
  return parsed
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n > 0);
};

const generateAccessAndRefreshTokens = async (userId) => {
  const user = await userQueries.findOne({ where: { userId } });
  const accessToken = await generateAccessToken({
    userId: user.userId,
    email: user?.email ?? "",
    roleId: user.roleId,
  });
  const refreshToken = await generateRefreshToken({
    userId: user.userId,
    email: user?.email ?? "",
    roleId: user.roleId,
  });
  user.refreshToken = refreshToken;
  await user.save();
  return { accessToken, refreshToken };
};

const fetchPermissionsForRole = async (roleId) => {
  const rows = await authsequelize.query(
    `SELECT f.featureId, f.featureName, p.permission
     FROM RoleFeatures rf
     JOIN Features f ON rf.featureId = f.featureId
     JOIN Permissions p ON rf.permissionId = p.permissionId
     WHERE rf.roleId = :roleId`,
    { replacements: { roleId }, type: authsequelize.QueryTypes.SELECT },
  );
  const map = {};
  for (const { featureId, featureName, permission } of rows) {
    const kind = String(permission).toLowerCase();
    if (!map[featureId]) {
      map[featureId] = { featureId, featureName, read: false, write: false };
    }
    if (kind === "read") map[featureId].read = true;
    if (kind === "write") map[featureId].write = true;
  }
  return Object.values(map);
};

const buildUserPayload = (row) => ({
  userId: row.userId,
  email: row?.email ?? "",
  roleId: row.roleId,
  firstName: row.firstName,
  lastName: row.lastName,
  phoneNumber: row.phoneNumber,
  profilePicture: row.profilePicUrl,
  emailVerified: row.emailVerified,
  phoneNumberVerified: row.phoneNumberVerified,
  createdAt: row.createdAt,
  updatedAt: row.modifiedAt,
  role: row.role,
  description: row.description,
  plant: row?.plant || null,
  department: row?.department || null,
  employeeId: row.employeeId,
  shift: row.shift,
  section: row.section,
  userSection: parseStoredUserSections(row.userSection),
});

export const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!password || !email) {
      return next(new ApiError(400, "Password or email is required"));
    }

    const user = await userQueries.findOne({
      where: { [Op.or]: [{ email }, { employeeId: email }] },
    });
    if (!user) return next(new ApiError(404, "User does not exist"));

    const ok = await isPasswordCorrect(password, user.password);
    if (!ok) return next(new ApiError(401, "Invalid user credentials"));

    const { accessToken, refreshToken } =
      await generateAccessAndRefreshTokens(user.userId);

    const loggedInUser = await userQueries.findById(user.userId);
    const permissions = await fetchPermissionsForRole(loggedInUser.roleId);

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          user: buildUserPayload(loggedInUser),
          accessToken,
          refreshToken,
          permissions,
        },
        "User logged in successfully",
      ),
    );
  } catch (error) {
    next(new ApiError(500, error.message));
  }
};

export const logoutUser = async (req, res, next) => {
  try {
    await userQueries.findOneAndUpdate(
      { where: { userId: req.user.userId } },
      { refreshToken: null },
    );
    return res
      .status(200)
      .json(new ApiResponse(200, {}, "User logged out"));
  } catch (error) {
    next(new ApiError(500, error.message));
  }
};

export const refreshAccessToken = async (req, res, next) => {
  const incomingRefreshToken = req.body.refreshToken;
  if (!incomingRefreshToken) {
    return next(new ApiError(401, "Unauthorized request"));
  }
  try {
    const decoded = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET,
    );
    const user = await userQueries.findById(decoded?.userId);
    if (!user) return next(new ApiError(401, "Invalid refresh token"));
    if (incomingRefreshToken !== user?.refreshToken) {
      return next(new ApiError(401, "Refresh token is expired or used"));
    }
    const { accessToken, refreshToken: newRefreshToken } =
      await generateAccessAndRefreshTokens(user.userId);
    return res.status(200).json(
      new ApiResponse(
        200,
        { accessToken, refreshToken: newRefreshToken },
        "Access token refreshed",
      ),
    );
  } catch (error) {
    next(new ApiError(500, error.message));
  }
};

export const forgotPasswordRequest = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await userQueries.findOne({ where: { email } });
    if (!user) return next(new ApiError(404, "User does not exist"));

    const { unHashedToken, hashedToken, tokenExpiry } =
      await generateTemporaryToken();
    user.forgotPasswordToken = hashedToken;
    user.forgotPasswordExpiry = tokenExpiry;
    await user.save();

    // No mail integration on this app — return the unhashed token so
    // an admin can deliver the reset link manually. Mirrors the
    // reference repo's pre-mailgen behaviour.
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          resetToken: unHashedToken,
          resetUrl: `${process.env.RESET_PASSWORD_REDIRECT_URL || ""}/${unHashedToken}`,
        },
        "Password reset token generated",
      ),
    );
  } catch (error) {
    next(new ApiError(500, error.message));
  }
};

export const resetForgottenPassword = async (req, res, next) => {
  try {
    const { resetToken } = req.params;
    const { newPassword } = req.body;
    if (!resetToken || !newPassword) {
      return next(new ApiError(400, "Reset token and new password are required"));
    }
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    const user = await userQueries.findOne({
      where: { forgotPasswordToken: hashedToken },
    });
    if (!user) return next(new ApiError(489, "Token is invalid or expired"));

    user.forgotPasswordToken = null;
    user.forgotPasswordExpiry = null;
    user.password = await generateHashPassword(newPassword);
    user.modifiedAt = new Date();
    await user.save();
    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Password reset successfully"));
  } catch (error) {
    next(new ApiError(500, error.message));
  }
};

export const changeCurrentPassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await userQueries.findById(req.user?.userId);
    if (!user) return next(new ApiError(404, "User not found"));

    const ok = await isPasswordCorrect(oldPassword, user.password);
    if (!ok) return next(new ApiError(400, "Invalid old password"));

    const hash = await generateHashPassword(newPassword);
    await authsequelize.query(
      `UPDATE PlatformUsers SET password = :password, modifiedAt = NOW()
       WHERE userId = :userId`,
      {
        replacements: { password: hash, userId: req.user?.userId },
        type: authsequelize.QueryTypes.UPDATE,
      },
    );
    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Password changed successfully"));
  } catch (error) {
    next(new ApiError(500, error.message));
  }
};

export const getCurrentUser = async (req, res) => {
  // Lightweight payload — controllers downstream of verifyJWT
  // already trust req.user. Refresh the row so callers always see
  // the latest name/email/role.
  const fresh = await userQueries.findById(req.user.userId);
  if (!fresh) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, "User no longer exists"));
  }
  const permissions = await fetchPermissionsForRole(fresh.roleId);
  return res.status(200).json(
    new ApiResponse(
      200,
      { user: buildUserPayload(fresh), permissions },
      "Current user fetched successfully",
    ),
  );
};

export const userList = async (_req, res, next) => {
  try {
    const users = await userQueries.getUsers();
    return res
      .status(200)
      .json(new ApiResponse(200, users, "Users fetched successfully"));
  } catch (error) {
    next(new ApiError(500, error.message));
  }
};

export const getUserPermission = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await userQueries.findById(id);
    if (!user) return next(new ApiError(404, "User not found"));

    const permissions = await fetchPermissionsForRole(user.roleId);
    return res.status(200).json(
      new ApiResponse(
        200,
        { user: buildUserPayload(user), permissions },
        "User permissions fetched successfully",
      ),
    );
  } catch (error) {
    next(new ApiError(500, error.message));
  }
};
