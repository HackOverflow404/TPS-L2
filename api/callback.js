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

function serializeCookie(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.path) parts.push(`Path=${opts.path}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);

  return parts.join("; ");
}

function b64url(s) {
  return Buffer.from(s, "utf8").toString("base64url");
}

function signRefreshToken(refreshToken, secret) {
  const sig = crypto
    .createHmac("sha256", secret)
    .update(refreshToken, "utf8")
    .digest("base64url");
  return `${b64url(refreshToken)}.${sig}`;
}

export default async function handler(req, res) {
  const code = req.query.code || null;
  const returnedState = req.query.state || null;

  if (!code) return res.status(400).send("Missing authorization code");

  try {
    const cookies = parseCookies(req);
    const expectedState = cookies.sp_state || null;

    // CSRF check
    if (!returnedState || !expectedState || returnedState !== expectedState) {
      return res.status(400).send("Invalid state");
    }

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
            process.env.SPOTIFY_CLIENT_ID +
              ":" +
              process.env.SPOTIFY_CLIENT_SECRET
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
      // If you ever hit this, Spotify may not be returning a refresh token (rare)
      return res.status(400).send("No refresh_token returned by Spotify");
    }

    const secret = process.env.SPOTIFY_COOKIE_SECRET;
    if (!secret) {
      return res.status(500).send("Missing SPOTIFY_COOKIE_SECRET env var");
    }

    const isProd = process.env.NODE_ENV === "production";
    const signed = signRefreshToken(data.refresh_token, secret);

    // 1 year cookie (tweak as you like)
    const cookieMaxAge = 60 * 60 * 24 * 365;

    res.setHeader("Set-Cookie", [
      // auth cookie
      serializeCookie("sp_refresh", signed, {
        httpOnly: true,
        secure: isProd,
        sameSite: "Lax",
        path: "/",
        maxAge: cookieMaxAge,
      }),
      // clear state cookie
      serializeCookie("sp_state", "", {
        httpOnly: true,
        secure: isProd,
        sameSite: "Lax",
        path: "/",
        maxAge: 0,
      }),
    ]);

    // Redirect back to your frontend
    res.redirect("/?authed=1");
  } catch (err) {
    console.error("Callback error:", err);
    res.status(500).send("Server error");
  }
}
