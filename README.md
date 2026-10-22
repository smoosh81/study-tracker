# Study Tracker

A stopwatch for studying that grows a garden. Windows desktop app built with Electron.

## Download

Get the newest `Study-Tracker-Portable-X.Y.Z.zip` from [Releases](https://github.com/smoosh81/study-tracker/releases/latest), unzip it anywhere, and run `Study Tracker.exe`. After that the app updates itself.

Your saves live in `%APPDATA%\Study Tracker` and are never touched by updates.

## Releasing an update

1. Bump `version` in `package.json`.
2. Build: `npx electron-builder --win dir --x64` (on Linux this needs wine).
3. Pack: `node build/make-release.js "what changed"` makes `release/X.Y.Z/` with the zip, `app-X.Y.Z.asar` and `latest.json`.
4. Create a GitHub release tagged `vX.Y.Z` with those three files attached. Installed apps pick it up on their next launch.
