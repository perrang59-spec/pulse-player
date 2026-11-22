# Deploy Pulse Player to GitHub Pages

This creates a separate public link such as `https://perrang59-spec.github.io/pulse-player/`. It does not touch `torquecode.co.za`.

## One-time setup

1. Sign in to GitHub as `perrang59-spec` in the browser.
2. Go to <https://github.com/new>.
3. Repository name: `pulse-player`
4. Description: `Offline music player PWA for Android`
5. Choose **Public**.
6. Do **not** add a README, `.gitignore` or licence yet — the upload will create the initial commit.
7. Click **Create repository**.
8. On the next screen choose **uploading an existing file** (or **Add file → Upload files**).
9. Drag in everything from the `torquecode-player` folder, including `player.zip`.
10. Commit summary: `Initial Pulse Player release`
11. Commit directly to `main`.

## Enable Pages

1. Open the new repo → **Settings** → **Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Branch: `main`, folder: `/(root)`.
4. Click **Save**.
5. Wait for the deployment to finish, then open:
   `https://perrang59-spec.github.io/pulse-player/`

## Update later

Upload changed files via **Add file → Upload files** and commit. GitHub Pages republishes automatically. If you change `sw.js`, bump `CACHE_NAME` in `sw.js` so returning phones pick up the new version.

## Notes

- No paid hosting, no domain purchase, no DNS change.
- No new account is needed beyond the existing GitHub account.
- If GitHub asks you to sign in again, sign in and repeat the upload.
