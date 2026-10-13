// security.js
// Small helpers for passwords, keys and encryption.
// We only use Node's built-in "crypto" module.

import crypto from "node:crypto";
import { config } from "./config.js";

// ---------- Passwords ----------
// We never save a password. We save "salt:hash".
// scrypt is slow on purpose, so guessing passwords is hard.

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return salt + ":" + hash;
}

export function checkPassword(password, saved) {
  const [salt, hash] = saved.split(":");
  const tryHash = crypto.scryptSync(password, salt, 32).toString("hex");
  // timingSafeEqual: compare in a way that does not leak timing info.
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(tryHash, "hex"));
}

// ---------- API keys and login tokens ----------
// A key is long and random, so a fast hash (SHA-256) is enough.
// We save only the hash. If the database leaks, the keys still cannot be used.

export function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function newApiKey() {
  return "mcpgw_" + crypto.randomBytes(24).toString("hex");
}

export function newSessionToken() {
  return "sess_" + crypto.randomBytes(24).toString("hex");
}

export function newPassword() {
  return crypto.randomBytes(9).toString("base64url");
}

// ---------- Encryption for upstream credentials ----------
// Upstream tokens must be sent to the upstream server, so we cannot just hash them.
// We encrypt them with AES-256-GCM. The key comes from a Kubernetes Secret.

function encryptionKey() {
  if (!config.encryptionKey) {
    throw new Error("ENCRYPTION_KEY is not set");
  }
  // Turn any text into exactly 32 bytes.
  return crypto.createHash("sha256").update(config.encryptionKey).digest();
}

export function encrypt(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Save all three parts together as one string.
  return [iv, tag, data].map((b) => b.toString("base64")).join(".");
}

export function decrypt(saved) {
  const [iv, tag, data] = saved.split(".").map((part) => Buffer.from(part, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
