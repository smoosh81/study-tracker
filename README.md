# Study Tracker

A stopwatch for studying that grows a garden. Windows desktop app built with Electron.

## Download

Get the newest `Study-Tracker-Portable-X.Y.Z.zip` from [Releases](https://github.com/smoosh81/study-tracker/releases/latest), unzip it anywhere, and run `Study Tracker.exe`. After that the app updates itself.

Your saves live in `%APPDATA%\Study Tracker` and are never touched by updates.

## Releasing an update

1. Bump `version` in `package.json` and write what changed in `RELEASE_NOTES.md`.
2. Push to `main`. The Release workflow builds the app on Windows and publishes a GitHub release tagged `vX.Y.Z` with the portable zip, `app-X.Y.Z.asar` and `latest.json`.
3. Installed apps pick it up on their next launch and install it when they close.

To build locally instead: `npx electron-builder --win dir --x64` (on Linux this needs wine), then `node build/make-release.js "notes"`.
