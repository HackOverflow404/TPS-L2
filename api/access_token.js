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

export default async function handler(req, res) {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const refresh_token = cookies.spotify_refresh_token;

    if (!refresh_token) {
      return res.status(401).json({ error: "not_authenticated" });
    }

    const client_id = process.env.SPOTIFY_CLIENT_ID;
    const client_secret = process.env.SPOTIFY_CLIENT_SECRET;

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
      // If refresh token is revoked/expired, treat as logged out
      return res.status(401).json({ error: "refresh_failed", details: data });
    }

    res.status(200).json({
      access_token: data.access_token,
      expires_in: data.expires_in,
      token_type: data.token_type,
    });
  } catch (e) {
    res.status(500).json({ error: "server_error", details: e.message });
  }
}
