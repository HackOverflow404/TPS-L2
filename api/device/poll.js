// The display checks whether its link code has been used. The finished login is handed
// over exactly once, as the same refresh-token cookie a normal login sets. Each poll
// costs at most one Redis command; bogus and expired codes cost none.
import { ONE_YEAR, checkDeviceCode, redis, serializeCookie } from "../_shared.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const device_code = (req.body && req.body.device_code) || "";
  const check = checkDeviceCode(device_code);
  if (check === "invalid") return res.status(400).json({ error: "invalid_device_code" });
  if (check === "expired") return res.status(410).json({ status: "expired" });
  try {
    // GETDEL makes the handoff one-time even if two polls race.
    const refresh_token = await redis("GETDEL", `link:token:${device_code}`);
    if (!refresh_token) return res.status(200).json({ status: "pending" });
    res.setHeader("Set-Cookie", serializeCookie("spotify_refresh_token", refresh_token, { maxAge: ONE_YEAR }));
    res.status(200).json({ status: "linked" });
  } catch (e) {
    console.error("device/poll:", e.message);
    res.status(500).json({ error: "server_error" });
  }
}
