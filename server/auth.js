import jwt from "jsonwebtoken";

const SESSION_SECRET = process.env.SESSION_SECRET || "dev-only-secret-change-me-before-deploying";
if (!process.env.SESSION_SECRET) {
  console.warn(
    "⚠️  SESSION_SECRET is not set — using an insecure default. Set a real SESSION_SECRET env var before deploying."
  );
}

export const COOKIE_NAME = "tqtc_session";
export const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function signSession(user) {
  return jwt.sign({ id: user.id, name: user.name }, SESSION_SECRET, { expiresIn: "30d" });
}

/** Returns { id, name } or null if the token is missing/invalid/expired. */
export function verifySession(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, SESSION_SECRET);
    return { id: payload.id, name: payload.name };
  } catch {
    return null;
  }
}
