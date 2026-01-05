function serializeCookie(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.path) parts.push(`Path=${opts.path}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  return parts.join("; ");
}

export default function handler(req, res) {
  const isProd = process.env.NODE_ENV === "production";
  res.setHeader("Set-Cookie", [
    serializeCookie("sp_refresh", "", {
      httpOnly: true,
      secure: isProd,
      sameSite: "Lax",
      path: "/",
      maxAge: 0,
    }),
  ]);
  res.redirect("/");
}
