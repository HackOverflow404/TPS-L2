import crypto from "crypto";

function serializeCookie(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.path) parts.push(`Path=${opts.path}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);

  return parts.join("; ");
}

export default function handler(req, res) {
  const scopes = [
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
  ].join(" ");

  // CSRF state
  const state = crypto.randomBytes(16).toString("hex");

  const isProd = process.env.NODE_ENV === "production";

  res.setHeader(
    "Set-Cookie",
    serializeCookie("sp_state", state, {
      httpOnly: true,
      secure: isProd,
      sameSite: "Lax",
      path: "/",
      maxAge: 10 * 60, // 10 minutes
    })
  );

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: scopes,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
    state,
    // show_dialog: "true", // uncomment if you want Spotify to always show the account picker
  });

  res.redirect("https://accounts.spotify.com/authorize?" + params.toString());
}
