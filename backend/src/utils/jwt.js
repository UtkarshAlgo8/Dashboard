import crypto from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

/**
 * JWT + password hashing helpers used by the auth controllers.
 * Mirrors the reference repo so token issuance is identical
 * (same algorithms, same expiry semantics).
 */

export async function generateHashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function isPasswordCorrect(plain, hashed) {
  if (!plain || !hashed) return false;
  return bcrypt.compare(plain, hashed);
}

export async function generateAccessToken(details) {
  return jwt.sign(details, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "1d",
  });
}

export async function generateRefreshToken(details) {
  return jwt.sign(details, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "1y",
  });
}

export async function generateTemporaryToken() {
  const unHashedToken = crypto.randomBytes(20).toString("hex");
  const hashedToken = crypto
    .createHash("sha256")
    .update(unHashedToken)
    .digest("hex");
  const tokenExpiry = Date.now() + 20 * 60 * 1000; // 20 minutes
  return { unHashedToken, hashedToken, tokenExpiry };
}
