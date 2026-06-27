# MetaFor Electron

Chromium shell for `https://meta.proizvodstvo1.ru/` with an optional local browser-host mode.

```bash
bun --filter @app/electron start
bun --filter @app/electron dev
bun --filter @app/electron build
```

`start` opens the regular Electron shell. `dev` keeps the same shell behavior and only enables CDP on port `9230`.

## Browser Host Mode

Host mode is disabled by default. Enable it with `METAFOR_ELECTRON_HOST=1` or by setting `METAFOR_ELECTRON_HOST_PORT`.

```bash
bun --filter @app/electron host
bun --filter @app/electron dev:host
bun --filter @app/electron host:linux
bun --filter @app/electron dev:host:linux
```

The host scripts bind the local HTTP API to `127.0.0.1:32123`. If host mode is enabled without `METAFOR_ELECTRON_HOST_PORT`, Electron listens on an ephemeral loopback port and prints the selected URL to stdout.

Host mode uses a separate Electron user data directory and session partition from the regular shell.

Linux server host mode is Wayland-first and uses WebRTC as the primary remote
desktop channel. `host:linux` sets `ELECTRON_DISABLE_SANDBOX=1` because the
repo-local Electron binary is not installed with a setuid `chrome-sandbox` on
the server. It also passes Wayland/PipeWire capture flags to Chromium before
Electron loads. The in-app `METAFOR_ELECTRON_NO_SANDBOX` and
`METAFOR_ELECTRON_OZONE_PLATFORM` envs remain diagnostic state, but they are not
early enough to replace the process-level sandbox/Ozone flags.

## HTTP API

All endpoints are local-only by default and return `Cache-Control: no-store`.

- `GET /health` - health and explicit browser state.
- `GET /state` - same state payload as `/health`.
- `POST /navigate` - set the managed URL and navigate. Body: `{"url":"https://example.test/"}`. Alias: `POST /url`.
- `POST /reload` - reload the current page. Body: `{"ignoreCache":true}` or `{"hard":true}` for cache-bypass.
- `POST /back` / `POST /forward` - navigate browser history.
- `POST /devtools` - open, close or toggle detached DevTools. Body: `{"open":false}` or `{"toggle":true}`.
- `POST /fullscreen` - set or toggle fullscreen. Body: `{"enabled":true}`.
- `POST /viewport` - update viewport. Body: `{"width":1280,"height":720,"deviceScaleFactor":1}`. Use `"deviceScaleFactor": null` to disable device emulation.
- `POST /input` - send focused input to the page: `focus`, `click`, `doubleclick`, `pointerMove`, `pointerDown`, `pointerUp`, `wheel`, `keyDown`, `keyUp`, `char`, `text`.
- `GET /desktop/health` - remote desktop host state, including WebRTC capture, audio and configured adapters.
- `GET /desktop/rtc/state` - WebRTC sender state.
- `POST /desktop/rtc/restart` - recreate the WebRTC sender page.
- `GET /desktop/snapshot` - diagnostic fallback snapshot. WebRTC is the primary live channel.
- `POST /desktop/input` - send remote desktop input over the host adapter or fallback page input.
- `POST /restart` - recreate the BrowserWindow. Optional body: `{"url":"https://example.test/","viewport":{"width":1280,"height":720,"deviceScaleFactor":1}}`.
- `GET /snapshot` or `POST /snapshot` - capture the current page once and return `image/png`. Add `?format=json` to receive base64 JSON.

Snapshot capture is request-driven only. Concurrent snapshot requests return `429` while a capture is pending. The host also caps in-flight HTTP requests and body size for basic backpressure.

Example:

```bash
curl http://127.0.0.1:32123/health
curl -X POST http://127.0.0.1:32123/navigate \
  -H 'content-type: application/json' \
  -d '{"url":"https://meta.proizvodstvo1.ru/"}'
curl http://127.0.0.1:32123/snapshot --output snapshot.png
```

## Environment

- `METAFOR_URL` - initial managed URL. Defaults to `https://meta.proizvodstvo1.ru/`.
- `METAFOR_ELECTRON_HOST` - enable host mode when truthy.
- `METAFOR_ELECTRON_HOST_PORT` - local HTTP API port. Setting it also enables host mode.
- `METAFOR_ELECTRON_HOST_BIND` - HTTP bind address. Defaults to `127.0.0.1`; only loopback hosts are accepted.
- `METAFOR_ELECTRON_USER_DATA_DIR` - host-mode user data directory override.
- `METAFOR_ELECTRON_DEBUG_PORT` - CDP port for Chromium remote debugging.
- `METAFOR_ELECTRON_VIEWPORT_WIDTH` - initial window width. Defaults to `1440`.
- `METAFOR_ELECTRON_VIEWPORT_HEIGHT` - initial window height. Defaults to `960`.
- `METAFOR_ELECTRON_DEVICE_SCALE_FACTOR` - initial device scale factor emulation.
- `METAFOR_ELECTRON_HOST_MAX_IN_FLIGHT` - max concurrent HTTP requests. Defaults to `8`.
- `METAFOR_ELECTRON_HOST_BODY_LIMIT_BYTES` - max JSON body size. Defaults to `65536`.
- `METAFOR_REMOTE_DESKTOP_RTC` / `METAFOR_REMOTE_DESKTOP_WEBRTC` - enable the WebRTC remote desktop sender.
- `METAFOR_REMOTE_DESKTOP_SIGNAL_URL` - signaling URL. Defaults to `ws://127.0.0.1:6500/webrtc/signaling`.
- `METAFOR_REMOTE_DESKTOP_CAPTURE_SOURCE` - `screen` or `window`; server desktop defaults to `screen`.
- `METAFOR_REMOTE_DESKTOP_CAPTURE_NAME` - optional source-name filter.
- `METAFOR_REMOTE_DESKTOP_AUDIO` - enable/disable audio track.
- `METAFOR_REMOTE_DESKTOP_AUDIO_SOURCE` - `auto`, `system`, `loopback`, `loopback-with-mute`, `browser`, `browser-frame`, or `off`.
- `METAFOR_REMOTE_DESKTOP_SYSTEM_PICKER` - when truthy, let Chromium use the system picker instead of Electron's programmatic `desktopCapturer` source selection.
- `METAFOR_REMOTE_DESKTOP_AUTO_SELECT_SOURCE` - Chromium auto-select source name used with the system picker path.

macOS media permission prompts only run on `process.platform === "darwin"`. Linux host mode does not depend on Playwright at runtime.
