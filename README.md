# Spotify Now Playing Kiosk (Raspberry Pi)

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
---------------------------------
## ToDo
- Add PKCE-based authentication
