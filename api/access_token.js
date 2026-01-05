import crypto from "crypto";

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach((part) => {
    const [k, ...v] = part.trim().split("=");
    if (!k) return;
    out[k] = decodeURIComponent(v.join("=") || "");
  });
  return out;
}

function b64urlToBuf(s) {
  const pad = 4 - (s.length % 4 || 4);
  const b64 = (s + "=".repeat(pad)).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64");
}

function verifySignedRefreshToken(signed, secret) {
  // signed = base64url(refresh_token) + "." + base64url(hmac)
  if (!signed || typeof signed !== "string") return null;
  const idx = signed.lastIndexOf(".");
  if (idx <= 0) return null;

  const tokenPart = signed.slice(0, idx);
  const sigPart = signed.slice(idx + 1);
  if (!tokenPart || !sigPart) return null;

  const refreshToken = b64urlToBuf(tokenPart).toString("utf8");
  const expected = crypto
    .createHmac("sha256", secret)
    .update(refreshToken, "utf8")
    .digest("base64url");

  // constant-time compare
  const a = Buffer.from(expected);
  const b = Buffer.from(sigPart);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  return refreshToken;
}

export default async function handler(req, res) {
  try {
    const client_id = process.env.SPOTIFY_CLIENT_ID;
    const client_secret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!client_id || !client_secret) {
      return res.status(500).json({ error: "Missing Spotify client env vars" });
    }

    const cookies = parseCookies(req);
    const cookieSecret = process.env.SPOTIFY_COOKIE_SECRET;

    // Prefer cookie refresh token; optionally fallback to old single-kiosk env var
    let refresh_token = null;

    if (cookieSecret && cookies.sp_refresh) {
      refresh_token = verifySignedRefreshToken(cookies.sp_refresh, cookieSecret);
    }

    if (!refresh_token) {
      refresh_token = process.env.SPOTIFY_REFRESH_TOKEN || null;
    }

    if (!refresh_token) {
      return res.status(401).json({ error: "Not logged in to Spotify" });
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token,
    });

    const r = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(`${client_id}:${client_secret}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const data = await r.json();
    if (!r.ok) {
      return res
        .status(400)
        .json({ error: "Spotify token refresh failed", details: data });
    }

    res.status(200).json({
      access_token: data.access_token,
      expires_in: data.expires_in,
      token_type: data.token_type,
    });
  } catch (e) {
    res.status(500).json({ error: "Server error", details: e.message });
  }
}
