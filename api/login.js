import crypto from "crypto";
import { normalizeUserCode, redis } from "./_shared.js";

function serializeCookie(name, value, options = {}) {
  const opts = {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    ...options,
  };

  let cookie = `${name}=${encodeURIComponent(value)}`;
  if (opts.maxAge != null) cookie += `; Max-Age=${opts.maxAge}`;
  if (opts.domain) cookie += `; Domain=${opts.domain}`;
  if (opts.path) cookie += `; Path=${opts.path}`;
  if (opts.httpOnly) cookie += `; HttpOnly`;
  if (opts.secure) cookie += `; Secure`;
  if (opts.sameSite) cookie += `; SameSite=${opts.sameSite}`;
  return cookie;
}

export default async function handler(req, res) {
  // ?link=CODE: this login links a display (see /api/device/*) instead of this browser.
  let link = "";
  if (req.query.link) {
    link = normalizeUserCode(req.query.link);
    try {
      if (!link || !(await redis("GET", `link:code:${link}`))) {
        return res.redirect("/link.html?error=expired");
      }
    } catch (e) {
      console.error("login link check:", e.message);
      return res.status(500).send("Server error");
    }
  }

  const scopes = [
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
  ].join(" ");

  // CSRF protection: random state stored in cookie and echoed back by Spotify
  const state = crypto.randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: scopes,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
    state,
    // Helps ensure you actually get a refresh_token for new users
    show_dialog: "true",
  });

  res.setHeader("Set-Cookie", [
    serializeCookie("spotify_oauth_state", state, {
      maxAge: 10 * 60, // 10 minutes
    }),
    // Set for a display link, cleared otherwise so a stale one can't redirect this login.
    serializeCookie("spotify_link_code", link, { maxAge: link ? 10 * 60 : 0 }),
  ]);

  res.redirect("https://accounts.spotify.com/authorize?" + params.toString());
}
