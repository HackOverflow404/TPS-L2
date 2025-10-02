export default async function handler(req, res) {
  try {
    const refresh_token = process.env.SPOTIFY_REFRESH_TOKEN;
    const client_id = process.env.SPOTIFY_CLIENT_ID;
    const client_secret = process.env.SPOTIFY_CLIENT_SECRET;

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token,
    });

    const r = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Authorization": "Basic " + Buffer.from(`${client_id}:${client_secret}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const data = await r.json();
    if (!r.ok) {
      return res.status(400).json({ error: "Spotify token refresh failed", details: data });
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
