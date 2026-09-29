# TPS-L2: Spotify Now Playing Kiosk (Raspberry Pi)

Named after the Sony TPS-L2, the original 1979 Walkman.

A single-page, kiosk-friendly web app that shows your current Spotify track with gorgeous album art, a blurred backdrop, synced/unsynced lyrics, progress bar, media-key controls, and volume/seeking — designed to run locally on a Raspberry Pi 4.

---------------------------------

## Features

- Now Playing dashboard: track title, artists, album art, device name
- Playback controls: play/pause, next/previous, seek via progress bar
- Volume control: slider + keyboard/media keys
- Synced lyrics (LRC) with auto-scroll and highlighting (via LRCLIB), plus plain lyrics fallback (lyrics.ovh)
- Background blur + cover art mirror with a kiosk-ready layout
- Media Session API: integrates with hardware/media keys
- Local-only: static site that talks directly to Spotify’s Web API with a refresh token
- Connect With Spotify: Securely allows you to connect your Spotify account

## Kiosk on a Raspberry Pi

`kiosk/` runs the dashboard full screen on a Pi's display with no desktop: Cog (a WPE
WebKit browser) draws straight to the screen, which is much lighter than Chromium on X11.
On the Pi, run `kiosk/install` (installs `cog` and the `tps-l2-kiosk` system service,
which takes over the first console); `kiosk/uninstall` removes the service.
The service sets the display mode with `COG_PLATFORM_DRM_VIDEO_MODE` (1280x720 for the
LVDS panel's controller board) and saves the login in `~/.local/share/tps-l2/`.
