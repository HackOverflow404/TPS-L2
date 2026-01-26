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
  if (opts.path) cookie += `; Path=${opts.path}`;
  if (opts.httpOnly) cookie += `; HttpOnly`;
  if (opts.secure) cookie += `; Secure`;
  if (opts.sameSite) cookie += `; SameSite=${opts.sameSite}`;
  return cookie;
}

export default function handler(req, res) {
  res.setHeader(
    "Set-Cookie",
    serializeCookie("spotify_refresh_token", "", { maxAge: 0 })
  );
  res.status(200).json({ ok: true });
}
