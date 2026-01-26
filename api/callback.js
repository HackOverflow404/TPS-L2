function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;

  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

function isHttps(req) {
  const xfProto = req.headers["x-forwarded-proto"];
  if (typeof xfProto === "string") return xfProto.includes("https");
  return req.connection?.encrypted === true;
}

function serializeCookie(name, value, options = {}) {
  const opts = {
    path: "/",
    httpOnly: true,
    secure: isHttps(req),
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
  const code = req.query.code || null;
  const state = req.query.state || null;

  if (!code) return res.status(400).send("Missing authorization code");

  // Verify state (CSRF protection)
  const cookies = parseCookies(req.headers.cookie);
  const expectedState = cookies.spotify_oauth_state;
  if (!state || !expectedState || state !== expectedState) {
    return res.status(400).send("Invalid state");
  }

  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
    });

    const r = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(
            `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
          ).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const data = await r.json();
    if (!r.ok) {
      console.error("Token exchange failed:", data);
      return res.status(400).json(data);
    }

    if (!data.refresh_token) {
      // Usually means they already authorized before and Spotify didn't return it this time.
      // show_dialog=true helps, but user might still need to revoke + re-authorize.
      return res
        .status(400)
        .send("No refresh_token returned. Try reconnecting (show dialog) or revoke access and try again.");
    }

    // Store refresh token in Secure HttpOnly cookie (per-user)
    const oneYear = 60 * 60 * 24 * 365;

    res.setHeader("Set-Cookie", [
      // refresh token used by /api/access_token
      serializeCookie("spotify_refresh_token", data.refresh_token, {
        maxAge: oneYear,
      }),
      // clear one-time oauth state
      serializeCookie("spotify_oauth_state", "", { maxAge: 0 }),
    ]);

    // After auth, go to the dashboard (we'll gate it client-side if not authed)
    res.redirect("/"); // or "/index.html" depending on your hosting behavior
  } catch (err) {
    console.error("Callback error:", err);
    res.status(500).send("Server error");
  }
}
