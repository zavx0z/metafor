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
cd app/electron && bun run webrtc:chrome:monitor # compatibility wrapper
cd app/electron && bun run xwayland:display
cd app/electron && bun run xwayland:browser
cd app/electron && bun run webrtc:chrome:browser
cd app/electron && bun run webrtc:xwayland:screen
cd app/electron && bun run webrtc:pipewire:screen
cd app/electron && bun run webrtc:x11:window
```

Generic host scripts bind the local HTTP API to `127.0.0.1:32123`. The current
server remote desktop sender uses `127.0.0.1:32133`. If host mode is enabled
without `METAFOR_ELECTRON_HOST_PORT`, Electron listens on an ephemeral loopback
port and prints the selected URL to stdout.

Host mode uses a separate Electron user data directory and session partition from the regular shell.

Current Linux server browser-display mode uses a user-owned Wayland/Mutter
virtual monitor, not a physical monitor and not the macOS user's display. The
active low-latency sender implementation lives in
`pkg/interpreter/remote-desktop` and listens on `127.0.0.1:32133`: it
opens Google Chrome on `WAYLAND_DISPLAY=wayland-0`, keeps
`https://meta.proizvodstvo1.ru/` as the visible development browser, creates a
separate service sender target at
`http://127.0.0.1:32133/desktop/rtc/sender`, runs
`navigator.mediaDevices.getDisplayMedia()` there, captures the whole server
monitor at 60 fps target, and joins the interpreter `remote-desktop` signaling
room. Product page reload/navigation must not own or reset the sender.

For the server-dev contour, agents should control this through the interpreter
lifecycle API instead of calling Electron/Chrome scripts directly:
`GET|POST http://10.66.0.10:6500/remote-desktop/lifecycle`. The
`webrtc:chrome:monitor` command in this package is only a compatibility wrapper
to the interpreter module. Do not migrate older diagnostics/fallbacks into
interpreter runtime code unless they are proven to be actively used.

Do not leave the older `127.0.0.1:32123` remote desktop host running next to
`32133`: it creates a second `MetaVendor` virtual monitor, so Chrome can render
on one monitor while WebRTC captures the other. `webrtc:chrome:browser`,
`xwayland:display`, `webrtc:xwayland:screen`, `webrtc:pipewire:screen` and
`webrtc:x11:window` remain diagnostics/fallbacks.

`webrtc:linux` still starts Electron as a sender-only diagnostic/fallback
process: no managed browser window and no Playwright. The Electron sender first
tries Chromium's native desktop media stream and probes the first frame; on the
current GNOME/Wayland/NVIDIA server Electron may negotiate `screen:*` while
delivering black frames, so black native capture is rejected instead of being
published. If a local video fallback is configured, `video/webm; codecs=vp8`
from `127.0.0.1:32123/desktop/video.webm` is preferred over the older MJPEG
canvas path (`/desktop/stream.mjpeg`). Fallback audio prefers low-latency PCM
(`/desktop/audio.pcm`) before the older WebM/Opus adapter (`/desktop/audio.webm`).
The Linux scripts default to `WAYLAND_DISPLAY=wayland-0` and
`METAFOR_ELECTRON_OZONE_PLATFORM=wayland` while still exporting `DISPLAY=:0`
and Mutter's Xwayland `XAUTHORITY` for compatibility. On the GNOME server,
X11/Ozone `screen:*` capture can negotiate WebRTC while delivering black video;
use `METAFOR_ELECTRON_OZONE_PLATFORM=x11` only as an explicit diagnostic opt-in.

`webrtc:linux` sets `ELECTRON_DISABLE_SANDBOX=1` because the repo-local Electron
binary is not installed with a setuid `chrome-sandbox` on the server. It also
sets Ozone/Wayland, WebRTC screen capture, `METAFOR_ELECTRON_WEBGPU=0`, and
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
- `GET /desktop/video.webm` - VP8/WebM stream from the active Mutter/PipeWire desktop stream, used by `webrtc:pipewire:screen`.
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
- `METAFOR_REMOTE_DESKTOP_SIGNAL_URL` - signaling URL. The generic app default is `ws://127.0.0.1:6500/webrtc/signaling`; Linux dev sender scripts default to `ws://10.66.0.10:6500/webrtc/signaling` so the sender and the external interpreter UI share one signaling room. Override it only when the browser UI is intentionally served from another interpreter signaling host.
- `METAFOR_REMOTE_DESKTOP_ICE_SERVERS` / `METAFOR_RTC_ICE_SERVERS` - optional ICE servers for the sender, as JSON `RTCIceServer[]` or a comma-separated URL list. Production server desktop uses direct UDP forwarding, so TURN is a fallback for other network topologies, not the primary path.
- `METAFOR_REMOTE_DESKTOP_UDP_PORT_RANGE` / `METAFOR_RTC_UDP_PORT_RANGE` - restrict Chromium WebRTC UDP sockets. The Linux dev sender defaults to `40000-40100`, matching the production voice/media forwarding range.
- `METAFOR_REMOTE_DESKTOP_PUBLIC_ICE_HOST` / `METAFOR_RTC_PUBLIC_ICE_HOST` - rewrite published UDP host candidates to the public media host. The Linux dev sender defaults to `130.49.151.168`.
- `METAFOR_REMOTE_DESKTOP_ICE_INTERFACE` / `METAFOR_RTC_ICE_INTERFACE` - preferred private interface address for diagnostics/filtering. The Linux dev sender defaults to `10.66.0.10`; Chromium may still report another local address for a `0.0.0.0` socket, so candidates inside the configured UDP range are published through `METAFOR_REMOTE_DESKTOP_PUBLIC_ICE_HOST`.
- `METAFOR_REMOTE_DESKTOP_IP_HANDLING_POLICY` / `METAFOR_RTC_IP_HANDLING_POLICY` - optional Chromium WebRTC IP handling policy. The Linux dev sender defaults to `default_public_and_private_interfaces`.
- `METAFOR_REMOTE_DESKTOP_SENDER_ONLY` - run only the protocol WebRTC sender context; do not create the managed product browser window.
- `METAFOR_REMOTE_DESKTOP_CAPTURE_SOURCE` - `screen` or `window`; server desktop defaults to `screen`.
- `METAFOR_REMOTE_DESKTOP_CAPTURE_NAME` - optional source-name filter.
- `METAFOR_REMOTE_DESKTOP_AUDIO` - enable/disable audio track.
- `METAFOR_REMOTE_DESKTOP_AUDIO_SOURCE` - Electron sender fallback audio source: `auto`, `system`, `loopback`, `loopback-with-mute`, `browser`, `browser-frame`, or `off`.
- `METAFOR_REMOTE_DESKTOP_CAPTURE_MODE` - Electron sender fallback capture mode: `native-first`, `native-only`, or `frame-stream`. Defaults to `native-first`, so Chromium captures one native desktop media stream with video and audio before falling back to PipeWire MJPEG/PCM adapters. `native-only` is for diagnostics: black or unsupported browser capture fails instead of being masked by the PipeWire fallback.
- `METAFOR_REMOTE_DESKTOP_VIDEO_URL` / `METAFOR_REMOTE_DESKTOP_VIDEO_STREAM_URL` - optional local WebM/VP8 desktop video source for the Electron sender page. `webrtc:pipewire:screen` defaults this to `http://127.0.0.1:32123/desktop/video.webm` and sets `METAFOR_REMOTE_DESKTOP_CAPTURE_MODE=frame-stream`.
- `METAFOR_REMOTE_DESKTOP_VIDEO_BITRATE` - VP8 bitrate for `/desktop/video.webm`. Defaults to `METAFOR_REMOTE_DESKTOP_RTC_VIDEO_BITRATE` or `8000000`.
- `METAFOR_REMOTE_DESKTOP_FRAME_STREAM_URL` - optional local MJPEG frame fallback source for the sender page. The Linux WebRTC scripts keep this configured so GNOME/Wayland black-frame cases can still fall back without losing the display.
- `METAFOR_REMOTE_DESKTOP_FRAME_SNAPSHOT_URL` - optional local snapshot source paired with the frame stream. The Electron fallback scripts default to `http://127.0.0.1:32123/desktop/snapshot`.
- `METAFOR_REMOTE_DESKTOP_AUDIO_PCM_URL` - optional local S16LE 48 kHz stereo PCM audio fallback source for the Electron sender page. The Electron fallback scripts default to `http://127.0.0.1:32123/desktop/audio.pcm`; the sender keeps a short bounded queue before adding the track to the same WebRTC connection.
- `METAFOR_REMOTE_DESKTOP_AUDIO_URL` - optional local WebM/Opus audio fallback source for the sender page. The Electron fallback scripts default to `http://127.0.0.1:32123/desktop/audio.webm`; the sender decodes it only when native Chromium desktop audio and PCM fallback are unavailable.
- `METAFOR_REMOTE_DESKTOP_AUDIO_TARGET` - optional PipeWire target object for the audio stream. When unset, the local PipeWire host picks the running/default `Audio/Sink`.
- `METAFOR_REMOTE_DESKTOP_AUDIO_BITRATE` - Opus bitrate for `/desktop/audio.webm`. Defaults to `128000`.
- `METAFOR_REMOTE_DESKTOP_AUDIO_UNMUTE` - when enabled, the local PipeWire host unmutes the selected audio sink before streaming. Defaults to enabled.
- `METAFOR_REMOTE_DESKTOP_AUDIO_VOLUME` - volume applied with `wpctl set-volume` before audio streaming. Defaults to `0.70`.
- `METAFOR_REMOTE_DESKTOP_RTC_VIDEO_BITRATE` - target max WebRTC video bitrate in bits per second. The Linux WebRTC scripts default to `12000000`.
- `METAFOR_REMOTE_DESKTOP_SYSTEM_PICKER` - opt-in diagnostic mode. When truthy, let Chromium use the system picker instead of Electron's programmatic `desktopCapturer` source selection.
- `METAFOR_REMOTE_DESKTOP_AUTO_SELECT_SOURCE` - Chromium auto-select source name used with the system picker path.
- `METAFOR_REMOTE_DESKTOP_DIRECT_INPUT_API` - optional direct JSON input endpoint, for example `http://127.0.0.1:32123/desktop/input`, used by the WebRTC data channel input proxy.
- `METAFOR_REMOTE_DESKTOP_CHROME_RTC` - enable the Linux host Chrome-native WebRTC sender. Defaults to enabled for `pipewire:host`.
- `METAFOR_REMOTE_DESKTOP_MANAGED_BROWSER` - enable the browser process managed by `pipewire:host`. Defaults to the same value as `METAFOR_REMOTE_DESKTOP_CHROME_RTC`; set both to `0` when `32123` is used only as the input/snapshot host.
- `METAFOR_REMOTE_DESKTOP_CHROME_CAPTURE_SURFACE` - Chrome `getDisplayMedia` surface: `monitor`, `window` or `browser`. `webrtc:chrome:monitor` sets `monitor`; `webrtc:chrome:browser` is a current-tab fallback.
- `METAFOR_REMOTE_DESKTOP_CHROME_AUDIO_SOURCE` - Chrome sender audio source: `display`, `pipewire` or `both`. `webrtc:chrome:monitor` defaults to `pipewire`, which routes the active Google Chrome PipeWire `Stream/Output/Audio` node through `/desktop/audio.pcm`, `MediaStreamTrackGenerator(AudioData)` and the same WebRTC PeerConnection; the default sink monitor and `/desktop/audio.webm` are fallback/diagnostic paths.
- `METAFOR_REMOTE_DESKTOP_CHROME_AUTO_SELECT_SOURCE` / `METAFOR_REMOTE_DESKTOP_AUTO_SELECT_SOURCE` - Chromium desktop source name for the Linux `pipewire:host` Chrome sender. Defaults to `Entire Screen`.
- `METAFOR_REMOTE_DESKTOP_CHROME_FAKE_UI` - allow Chromium to accept the auto-selected desktop capture source without a manual picker confirmation. Defaults to enabled when an auto-select source is configured.
- `METAFOR_REMOTE_DESKTOP_CHROME_RTC_PICKER` - enable automatic Chrome/GNOME picker clicks through the Mutter/EIS input adapter. `webrtc:chrome:monitor` enables this because the standard Wayland portal must approve the selected monitor before WebRTC frames start.
- `METAFOR_REMOTE_DESKTOP_CHROME_DEV_LAYOUT` - enable the default Web UI debugging layout for the Linux Chrome monitor sender: one maximized Chrome window, AppWeb in mobile emulation on the left, docked DevTools on the right, `Sources` selected, and the console drawer open. `chrome-webrtc-monitor.sh` enables this by default. Override `METAFOR_REMOTE_DESKTOP_CHROME_DEV_MOBILE_WIDTH`, `METAFOR_REMOTE_DESKTOP_CHROME_DEV_MOBILE_HEIGHT`, `METAFOR_REMOTE_DESKTOP_CHROME_DEV_MOBILE_DPR`, or `METAFOR_REMOTE_DESKTOP_CHROME_DEVTOOLS_SPLIT_WIDTH` only when intentionally changing that shared workspace layout.
- `METAFOR_ELECTRON_USE_OZONE_FEATURE` - opt into Chromium's legacy `UseOzonePlatform` feature flag for Electron. The current X11 window sender leaves it disabled and relies on `--ozone-platform=x11`.
- `METAFOR_ELECTRON_WEBGPU=0` - disable Electron WebGPU for the sender process; the captured browser/app can still use WebGPU in its own Chrome process.

In the current server contour `GET /desktop/rtc/state` on `32133` should show
`webRtc: true`, `transport: "chrome-webrtc"`,
`capture.frameSource: "chrome-get-display-media:monitor"`,
`capture.frameWidth: 1920`, `capture.frameHeight: 1080`,
`capture.frameRate: 60`, `audio.transport:
"pipewire-pcm-track-generator-stream"`, `audio.trackCount: 1`, a connected peer, and
an open data channel. Chrome 148 reads the UDP port range from profile preference
`webrtc.udp_port_range`; the host writes that preference before launching
Chrome so ICE candidates stay inside the production forwarding range. The
published candidate address is rewritten to `METAFOR_REMOTE_DESKTOP_PUBLIC_ICE_HOST`.
`pipewire-mjpeg` with `pipewire-pcm` in Electron sender state means the older
MJPEG/canvas fallback is active. If the receiver gets an audio track but hears
silence, check `wpctl status`, `/desktop/audio.pcm`, and receiver diagnostics
`rtc-audio-receiver-stats` (`muted:false`, growing `bytesReceived`,
`audioLevel`/`totalAudioEnergy`). On the current server, Chrome stream capture
is the reliable audio source; sink-monitor capture can stay connected while
recording silence.

macOS media permission prompts only run on `process.platform === "darwin"`. Linux host mode does not depend on Playwright at runtime.
