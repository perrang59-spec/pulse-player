# Pulse Player

A small offline-first music player for Android. It is a PWA (Progressive Web App), so you open it in Chrome and choose **Install app** to add it to your home screen. No APK or app store is needed.

> `player.zip` is the source code/backup only. Extracting it does **not** install the player. Open the hosted link in Chrome to use the app.

## Features

- Add multiple audio files from your device (`mp3`, `m4a`, `aac`, `ogg`, `wav`, `flac`, `opus`, `webm`)
- Download from a direct audio URL and save it into the library (public-domain, Creative Commons, or your own files only)
- Play / pause, previous / next, seek bar and volume
- Playlist with shuffle and repeat modes (off → all → one)
- Files are stored in your browser on your device using IndexedDB, so your playlist survives a reload
- Works offline after the first load (app shell is cached by a service worker)
- Media Session support for lock-screen / notification controls where Android Chrome supports it
- Drag and drop files onto the page on a computer

> Only add music you own or have permission to play. Pulse Player does not download music from the internet.

## Use it

1. Open the live link on your Android phone in Chrome.
2. Tap **Add music** for files already on your device, or paste a direct `https` audio link under **Download from a direct audio link**.
3. Tap a song in the playlist, or press **Play**.
4. Use **🔀** for shuffle and **🔁** to cycle repeat modes: off, all, one.
5. Tap **Install app** when Chrome offers it, then launch Pulse Player from your home screen.

> URL downloads only work when the host allows direct cross-origin downloads. If a site blocks it, download the file with your browser first and use **Add music**. Do not use the URL box for copyrighted music you do not have permission to download.

## Privacy

There is no account, no upload, no analytics and no third-party script. Audio files stay in your browser's local storage on your device. **Clear library** removes them.

## Files

```
index.html                 App UI
css/styles.css             Styles
js/app.js                  Player logic + IndexedDB storage
sw.js                      Offline cache
manifest.webmanifest       PWA install metadata
icons/                     App icons
favicon.svg                Browser icon
player.zip                 Downloadable copy of the app
```

## Change the name

Search for `Pulse Player` in `index.html`, `manifest.webmanifest`, `js/app.js`, `sw.js` and this README, then replace the text. Regenerate the icons if you also want new artwork.
