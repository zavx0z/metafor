# @metafor/android

Standalone Android screen/control package for local ADB devices.

## Runtime Dependencies

- `adb` from Android Platform Tools.
- `scrcpy` for native low-latency mirroring experiments.
- A connected Android device with USB Debugging enabled and authorized.

macOS install:

```bash
# MacPorts
sudo port install scrcpy

# Homebrew
brew install --cask android-platform-tools
brew install scrcpy
```

Check the device:

```bash
adb devices -l
```

If multiple entries are present, the package picks the first `device` entry and
ignores `offline` emulators. To pin a device explicitly:

```bash
ANDROID_SERIAL=12697154CV000558 PORT=3007 bun --hot src/standalone.ts
```

## Run

```bash
PORT=3007 bun --hot src/standalone.ts
```

Open:

```text
http://127.0.0.1:3007/
```

The browser UI uses `/android/h264` for realtime raw H.264 video from
`adb exec-out screenrecord --output-format=h264`, decoded in Chrome via
WebCodecs. `/android/stream` remains an ADB screenshot fallback for browsers
without WebCodecs or if video startup fails.

`scrcpy --record` was verified to write valid video files, but it does not
flush a usable live browser stream through stdout/FIFO on macOS scrcpy 3.3.
Scrcpy is kept as a native mirroring/debug dependency, not the browser video
transport. The package server helpers are kept separate from host apps, so
admin/proposal does not need Android-specific routes or UI.

Video tuning:

```bash
ANDROID_SERIAL=12697154CV000558
ANDROID_H264_BIT_RATE=4000000
ANDROID_H264_SIZE=720x1600
```
