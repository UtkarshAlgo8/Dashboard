import { Router } from "express";
import {
  getFeaturesPermissionRoles,
  getRoleWiseFeaturePermissions,
} from "../controllers/auth/roles.controller.js";

const router = Router();

router.get("/get-roles", getFeaturesPermissionRoles);
router.get("/get-role-wise-permissions", getRoleWiseFeaturePermissions);

export default router;
