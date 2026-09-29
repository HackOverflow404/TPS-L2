// A display without a keyboard asks for a link code; it shows the code as a QR code
// and polls /api/device/poll until someone logs in with it from a phone.
import {
  LINK_SECONDS, POLL_SECONDS, newDeviceCode, newUserCode, origin, redis,
} from "../_shared.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  try {
    const device_code = newDeviceCode(LINK_SECONDS);
    // Retry the (unlikely) case of a short code that is already in use.
    for (let attempt = 0; attempt < 5; attempt++) {
      const user_code = newUserCode();
      const taken = await redis("SET", `link:code:${user_code}`, device_code, "EX", LINK_SECONDS, "NX");
      if (taken !== "OK") continue;
      return res.status(200).json({
        device_code,
        user_code,
        verification_uri: `${origin(req)}/link.html?code=${user_code}`,
        expires_in: LINK_SECONDS,
        interval: POLL_SECONDS,
      });
    }
    res.status(503).json({ error: "no_code_available" });
  } catch (e) {
    console.error("device/start:", e.message);
    res.status(500).json({ error: "server_error" });
  }
}
