// /api/callback.js
export default async function handler(req, res) {
  const code = req.query.code || null;
  if (!code) {
    return res.status(400).send("Missing authorization code");
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
        "Authorization":
          "Basic " + Buffer.from(
            process.env.SPOTIFY_CLIENT_ID + ":" + process.env.SPOTIFY_CLIENT_SECRET
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

    // ⚠️ IMPORTANT: Vercel’s filesystem is ephemeral — you can’t just write refresh tokens to disk.
    // Instead:
    //   • For a single kiosk: copy the refresh_token once into your Vercel env vars.
    //   • For multi-user: store in a DB (Supabase, Vercel KV, Firebase, etc.)

    if (data.refresh_token) {
      console.log("Copy this refresh token into your Vercel env vars:", data.refresh_token);
    }

    // Redirect back to your frontend (index.html)
    res.redirect("/?authed=1");
  } catch (err) {
    console.error("Callback error:", err);
    res.status(500).send("Server error");
  }
}
