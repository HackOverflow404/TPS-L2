// The display checks whether its link code has been used. The finished login is handed
// over exactly once, as the same refresh-token cookie a normal login sets.
import { ONE_YEAR, redis, serializeCookie } from "../_shared.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const device_code = (req.body && req.body.device_code) || "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(device_code)) return res.status(400).json({ error: "invalid_device_code" });
  try {
    // GETDEL makes the handoff one-time even if two polls race.
    const refresh_token = await redis("GETDEL", `link:token:${device_code}`);
    if (refresh_token) {
      await redis("DEL", `link:device:${device_code}`);
      res.setHeader("Set-Cookie", serializeCookie("spotify_refresh_token", refresh_token, { maxAge: ONE_YEAR }));
      return res.status(200).json({ status: "linked" });
    }
    const pending = await redis("GET", `link:device:${device_code}`);
    if (pending) return res.status(200).json({ status: "pending" });
    res.status(410).json({ status: "expired" });
  } catch (e) {
    console.error("device/poll:", e.message);
    res.status(500).json({ error: "server_error" });
  }
}
