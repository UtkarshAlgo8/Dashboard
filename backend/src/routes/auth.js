import { Router } from "express";
import {
  loginUser,
  logoutUser,
  refreshAccessToken,
  forgotPasswordRequest,
  resetForgottenPassword,
  changeCurrentPassword,
  getCurrentUser,
  userList,
  getUserPermission,
} from "../controllers/auth/user.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// Unsecured
router.post("/login", loginUser);
router.post("/refresh-token", refreshAccessToken);
router.post("/forgot-password", forgotPasswordRequest);
router.post("/reset-password/:resetToken", resetForgottenPassword);
router.get("/get-user-permissions/:id", getUserPermission);

// Secured
router.post("/logout", verifyJWT, logoutUser);
router.get("/current-user", verifyJWT, getCurrentUser);
router.post("/change-password", verifyJWT, changeCurrentPassword);
router.get("/get-users-list", verifyJWT, userList);

export default router;
