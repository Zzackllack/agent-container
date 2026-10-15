# Project artwork

`logo.png` is the original approved project artwork. The README uses this file;
the dashboard serves smaller copies from `dashboard/public/`:

- `logo.png`: 256 × 256, for the login page and navigation.
- `favicon-16.png` and `favicon-32.png`: browser tab icons.
- `apple-touch-icon.png`: 180 × 180, for saved home-screen shortcuts.

Preserve the original colors, composition, and alpha channel when exporting.
The artwork is raster PNG; these exports resize the approved image without
redrawing it. On macOS, regenerate them from the repository root with:

```sh
sips -z 256 256 assets/logo.png --out dashboard/public/logo.png
sips -z 16 16 assets/logo.png --out dashboard/public/favicon-16.png
sips -z 32 32 assets/logo.png --out dashboard/public/favicon-32.png
sips -z 180 180 assets/logo.png --out dashboard/public/apple-touch-icon.png
```

If asset names change, update `dashboard/index.html`, the shared `Logo` component,
and the Docker build-context allowlist together.
