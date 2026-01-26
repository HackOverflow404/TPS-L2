import crypto from "crypto";

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

export default function handler(req, res) {
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

  res.setHeader(
    "Set-Cookie",
    serializeCookie("spotify_oauth_state", state, {
      maxAge: 10 * 60, // 10 minutes
    })
  );

  res.redirect("https://accounts.spotify.com/authorize?" + params.toString());
}
