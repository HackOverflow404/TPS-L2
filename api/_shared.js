// Helpers shared by the device-linking routes. Files starting with "_" are not routes.
import crypto from "crypto";

export function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function serializeCookie(name, value, options = {}) {
  const opts = { path: "/", httpOnly: true, secure: true, sameSite: "Lax", ...options };
  let cookie = `${name}=${encodeURIComponent(value)}`;
  if (opts.maxAge != null) cookie += `; Max-Age=${opts.maxAge}`;
  if (opts.path) cookie += `; Path=${opts.path}`;
  if (opts.httpOnly) cookie += `; HttpOnly`;
  if (opts.secure) cookie += `; Secure`;
  if (opts.sameSite) cookie += `; SameSite=${opts.sameSite}`;
  return cookie;
}

// Upstash Redis over its REST API, so the project stays dependency-free.
// The Vercel Marketplace integration sets the KV_* names; the UPSTASH_* names are Upstash's own.
export async function redis(...command) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Redis is not configured");
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(command),
  });
  const data = await r.json();
  if (!r.ok || data.error) throw new Error(`Redis: ${data.error || r.status}`);
  return data.result;
}

// A link code lives this long; the phone must finish logging in within it.
export const LINK_SECONDS = 10 * 60;
// A finished login waits this long for the device to collect it.
export const HANDOFF_SECONDS = 2 * 60;
export const POLL_SECONDS = 3;
export const ONE_YEAR = 60 * 60 * 24 * 365;

// No vowels (so codes never spell words) and no look-alikes (0/O, 1/I/L).
const ALPHABET = "BCDFGHJKMNPQRSTVWXZ23456789";

export function newUserCode() {
  let code = "";
  for (let i = 0; i < 8; i++) code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function newDeviceCode() {
  return crypto.randomBytes(32).toString("base64url");
}

/** "bxq7m4tk", "BXQ7 M4TK" -> "BXQ7-M4TK"; anything else -> null. */
export function normalizeUserCode(input) {
  const code = String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 8 || [...code].some((c) => !ALPHABET.includes(c))) return null;
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function origin(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${req.headers.host}`;
}
