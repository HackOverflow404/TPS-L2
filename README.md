# TPS-L2: Spotify Now Playing Kiosk (Raspberry Pi)

Named after the Sony TPS-L2, the original 1979 Walkman.

A single-page, kiosk-friendly web app that shows your current Spotify track with gorgeous album art, a blurred backdrop, synced/unsynced lyrics, progress bar, media-key controls, and volume/seeking — designed to run on a wall-mounted panel driven by a Raspberry Pi 4, and hosted at [tps-l2.vercel.app](https://tps-l2.vercel.app).

---------------------------------

## Features

- Now Playing dashboard: track title, artists, album art, device name
- Playback controls: play/pause, next/previous, seek via progress bar
- Volume control: slider + keyboard/media keys
- Synced lyrics (LRC) with auto-scroll and highlighting (via LRCLIB), plus plain lyrics fallback (lyrics.ovh)
- Lyrics romanization for Korean (es-hangul), Japanese (Kuroshiro + Kuromoji) and Chinese (pinyin), loaded on demand
- Background blur + cover art mirror with a kiosk-ready layout
- Media Session API: integrates with hardware/media keys
- Connect with Spotify: any Spotify user can log in with their own account
- Link a display from your phone: displays without a keyboard show a QR code instead of a login form

## How it's built

- `public/`: the dashboard itself, plain HTML, CSS and JavaScript with no build step.
- `api/`: Vercel serverless functions. They hold the Spotify client secret, run the OAuth
  login, and turn each user's refresh token (kept in a secure, HttpOnly cookie) into
  short-lived access tokens for the page.
- `kiosk/`: the service that runs the dashboard full screen on the Pi's panel.

Environment variables on Vercel: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`,
`SPOTIFY_REDIRECT_URI` (must also be listed under Redirect URIs in the Spotify developer
dashboard), and `KV_REST_API_URL`/`KV_REST_API_TOKEN` for the display-linking store.
The old domain, spotify-web-controller-chi.vercel.app, permanently redirects here.

## Linking a display from your phone

A display with no keyboard can't type a Spotify login, and Spotify has no sign-in flow
for devices like TVs have. So the app provides one, and it works the same for any
screen that can show a QR code and make HTTPS requests: this kiosk today, a
microcontroller (ESP32) display later. The login flow doesn't depend on how the display
renders anything.

On a display, the connect page shows a QR code and a short code such as `BXQ7-M4TK`.
Scan it, check that the code on your phone matches the display, and log in with Spotify
there. Your phone isn't logged in; the display picks up the login within a few seconds
and keeps it for a year. You can also open `/link.html` and type the code.

How it works:

1. `POST /api/device/start` returns a short code for people (10 minutes) and a secret
   device code for the display. The device code carries its expiry and an HMAC signature,
   so it can be checked without a database lookup.
2. The phone logs in through `/api/login?link=CODE`. The callback stores the Spotify
   refresh token under that display's device code for 2 minutes, instead of setting it
   as the phone's cookie.
3. The display polls `POST /api/device/poll` with its device code (every 3 s for the first
   code, every 15 s after that). One poll collects the login exactly once (Redis `GETDEL`)
   and receives it as the normal login cookie.

The codes and the 2-minute handoff live in Upstash Redis. Each poll costs at most one
Redis command, and forged or expired device codes cost none, so even a display left on
the QR screen around the clock stays well inside Upstash's free tier (500K commands a
month). A linked display uses no Redis at all. A Vercel Firewall rule limits
`/api/device/*` to 60 requests a minute per IP; requests over it never reach the functions.

## Kiosk on a Raspberry Pi

`kiosk/` runs the dashboard full screen on the Pi's display with no desktop. Cog, a
minimal WPE WebKit browser, draws straight to the screen through DRM/KMS, so there's no
X11 session or window manager. It started as Chromium on X11, which needed a whole
desktop stack for a single page; Cog runs the same page with much less memory on a Pi
that also runs other services.

On the Pi, run `kiosk/install`: it installs `cog` and the `tps-l2-kiosk` system service,
which runs Cog in a login session on the first console (tty1) so it may take over the
display, and restarts it if it exits. `kiosk/uninstall` removes the service.

The service sets the display mode with `COG_PLATFORM_DRM_VIDEO_MODE`: 1280x720, because
the LVDS panel's controller board doesn't offer the panel's native 1366x768 and 1280x720
has the same shape. `rotation=3` turns the picture 90 degrees clockwise for the
portrait-mounted panel. Cookies, including the year-long login, are saved in
`~/.local/share/tps-l2/`.
