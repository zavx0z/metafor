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
cd app/electron && bun run webrtc:linux
cd app/electron && bun run dev:webrtc:linux
```

The host scripts bind the local HTTP API to `127.0.0.1:32123`. If host mode is enabled without `METAFOR_ELECTRON_HOST_PORT`, Electron listens on an ephemeral loopback port and prints the selected URL to stdout.

Host mode uses a separate Electron user data directory and session partition from the regular shell.

Linux server WebRTC sender mode is Wayland-first. `webrtc:linux` starts
Electron as a sender-only WebRTC process: no managed browser window, no
Playwright, and no snapshot polling as the live video path. It uses Chromium
`getDisplayMedia` with the GNOME/PipeWire system picker and publishes the
desktop stream into the `remote-desktop` signaling room. The existing
Mutter/PipeWire Node host can remain on `127.0.0.1:32123` as the EIS input and
diagnostic snapshot backend.

`webrtc:linux` sets `ELECTRON_DISABLE_SANDBOX=1` because the repo-local Electron
binary is not installed with a setuid `chrome-sandbox` on the server. It also
sets Wayland/Ozone, WebRTC PipeWire capture, `METAFOR_ELECTRON_WEBGPU=0`, and
Vulkan/VAAPI disable flags. On the current GNOME/NVIDIA server, visible
Electron BrowserWindows crash in the GPU/Viz process; sender-only mode avoids
that path while still using Electron's browser media APIs.

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
- `METAFOR_REMOTE_DESKTOP_SENDER_ONLY` - run only the hidden WebRTC sender page; do not create the managed browser window.
- `METAFOR_REMOTE_DESKTOP_CAPTURE_SOURCE` - `screen` or `window`; server desktop defaults to `screen`.
- `METAFOR_REMOTE_DESKTOP_CAPTURE_NAME` - optional source-name filter.
- `METAFOR_REMOTE_DESKTOP_AUDIO` - enable/disable audio track.
- `METAFOR_REMOTE_DESKTOP_AUDIO_SOURCE` - `auto`, `system`, `loopback`, `loopback-with-mute`, `browser`, `browser-frame`, or `off`.
- `METAFOR_REMOTE_DESKTOP_SYSTEM_PICKER` - when truthy, let Chromium use the system picker instead of Electron's programmatic `desktopCapturer` source selection.
- `METAFOR_REMOTE_DESKTOP_AUTO_SELECT_SOURCE` - Chromium auto-select source name used with the system picker path.
- `METAFOR_REMOTE_DESKTOP_DIRECT_INPUT_API` - optional direct JSON input endpoint, for example `http://127.0.0.1:32123/desktop/input`, used by the WebRTC data channel input proxy.
- `METAFOR_ELECTRON_WEBGPU=0` - disable Electron WebGPU for the sender process; the captured browser/app can still use WebGPU in its own Chrome process.

First Wayland portal use shows the GNOME "screen sharing" dialog. Select
`Экран` and click `Дать доступ`. After confirmation,
`GET /desktop/rtc/state` should show `webRtc: true`, `transport:
"electron-webrtc"`, `status: "ready"` or `control-open`, and connected peers.

macOS media permission prompts only run on `process.platform === "darwin"`. Linux host mode does not depend on Playwright at runtime.
