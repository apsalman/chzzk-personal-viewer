# Project workflow

- The user requests that future program updates also be committed and pushed to `https://github.com/apsalman/chzzk-personal-viewer` as part of completing the update. This is standing authorization; do not ask again for routine commits and pushes within the requested work.
- Run the checks appropriate to the change before pushing. Preserve unrelated user changes and do not force-push.
- Keep login profiles, cookies, logs, recordings, downloads, build caches, and other personal data out of Git. Distribution ZIPs and desktop runtime files remain excluded by `.gitignore`.
- Update the local desktop distribution when application source changes so that `start-app.cmd` runs the updated version.
