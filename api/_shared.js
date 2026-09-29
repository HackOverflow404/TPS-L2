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

// A device code is "<expiry>.<random>.<signature>", so a poll can reject a made-up or
// expired code without a Redis command: only codes from /api/device/start pass, and
// those are rate-limited by the firewall. The key is derived from the client secret.
function sign(payload) {
  const key = crypto.createHmac("sha256", process.env.SPOTIFY_CLIENT_SECRET || "")
    .update("tps-l2 device code").digest();
  return crypto.createHmac("sha256", key).update(payload).digest("base64url");
}

export function newDeviceCode(lifetimeSeconds) {
  const payload = `${Math.floor(Date.now() / 1000) + lifetimeSeconds}.${crypto.randomBytes(24).toString("base64url")}`;
  return `${payload}.${sign(payload)}`;
}

/** "valid", "expired" or "invalid", checked without Redis. */
export function checkDeviceCode(code) {
  const match = /^(\d{10})\.([A-Za-z0-9_-]{32})\.([A-Za-z0-9_-]{43})$/.exec(String(code || ""));
  if (!match) return "invalid";
  const expected = Buffer.from(sign(`${match[1]}.${match[2]}`));
  const given = Buffer.from(match[3]);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return "invalid";
  return Number(match[1]) > Date.now() / 1000 ? "valid" : "expired";
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
