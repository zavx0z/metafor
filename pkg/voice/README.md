# @metafor/voice

Bun FFI bridge to the Vosk C API for Russian command recognition, plus a local web playground.

The package loads a Russian Vosk model, accepts 16-bit mono PCM, reads Vosk JSON recognition results, normalizes spoken English tech terms through Russian phonetic aliases, and dispatches matched commands from Bun.

## Files

- `src/vosk.ts` loads `libvosk` with `bun:ffi` and wraps model/recognizer lifecycle.
- `src/commands.ts` matches Russian command phrases, phonetic aliases, and small recognition errors with Levenshtein distance.
- `src/wav.ts` extracts PCM from a simple 16-bit mono WAV file.
- `src/web/server.ts` serves the browser playground and streams microphone PCM over WebSocket.
- `examples/recognize-file.ts` recognizes a WAV or raw PCM file.
- `examples/recognize-mic.ts` captures a local macOS microphone through ffmpeg.

## Runtime Prerequisites

Local native/runtime assets are expected next to this package:

- `lib/libvosk.dylib`
- `models/ru`
- optional `bin/ffmpeg`
- optional `samples/*.wav`

These assets are intentionally ignored by Git because they are large and machine-specific. You can also point to them explicitly:

Download the Vosk native library and the small Russian model:

```sh
bun run voice:assets
```

From this package directly:

```sh
bun run assets
```

```sh
export VOSK_LIB="$PWD/lib/libvosk.dylib"
export VOSK_MODEL="$PWD/models/ru"
```

Audio sent to Vosk must be 16-bit mono PCM. WAV input is parsed automatically; raw PCM needs `--raw-pcm --sample-rate`.

## Web Playground

From this package:

```sh
bun run playground
```

From the production workspace root:

```sh
bun --filter @metafor/voice playground
```

or:

```sh
bun run voice:playground
```

Then open:

```text
http://127.0.0.1:4765
```

The playground has two recognition engines:

- `Local Vosk` streams microphone PCM to the local Bun/Vosk server at `/ws`.
- `Remote ASR` streams the same PCM to a configurable WebSocket URL. The default is `ws://127.0.0.1:8877/ws`, intended for an SSH tunnel to `ai-srv`.

For `ai-srv`, keep a local tunnel open:

```sh
ssh -N -L 8877:127.0.0.1:8787 ai-srv
```

or:

```sh
bun run voice:asr:tunnel
```

Check both local voice endpoints:

```sh
bun run voice:health
```

The remote ASR service accepts a context prompt from the playground's `Context` field and passes it to Whisper as `initial_prompt`.

Environment:

```sh
PORT=4765
HOST=127.0.0.1
VOICE_SAMPLE_RATE=16000
VOICE_GRAMMAR=1
VOSK_LOG_LEVEL=-1
```

The browser captures microphone audio, asks for a 16 kHz `AudioContext`, converts mono float samples to 16-bit PCM, streams chunks to `/ws`, and renders partial/final recognition plus command matches.

## CLI

```sh
bun run recognize ./speech.wav
bun run recognize ./speech.pcm --raw-pcm --sample-rate 16000
```

Local native smoke test:

```sh
bun run smoke
```

Local generated sample:

```sh
bun run recognize:sample
```

Live microphone capture on macOS:

```sh
bun run recognize:mic --list-devices
bun run recognize:mic --device ":0"
bun run recognize:mic --device ":0" --partial
```

The first microphone run may require macOS Microphone permission for the terminal running Bun. If `--list-devices` shows no audio devices or `Input/output error`, grant that permission in System Settings and retry.

By default, recognizers use a small Russian grammar containing command phrases plus `[unk]`. Use `--no-grammar` in the CLI or `VOICE_GRAMMAR=0` in the playground server to run against the full model vocabulary.

## Commands

Default commands are in `src/commands.ts`:

- `lights.on`: `включи свет`, `зажги свет`
- `door.open`: `открой дверь`
- `github.open`: `открой github`, recognized as `открой гитхаб` or `открой гит хаб`
- `bun.run`: `запусти bun`, recognized as `запусти бан`
- `webgpu.check`: `проверь webgpu`, recognized as `проверь веб джи пи ю`

Replace each command's `run()` function with the package-side action you need.

## Phonetic Aliases

Default aliases are in `src/commands.ts`:

```ts
{
  "гитхаб": "github",
  "гит хаб": "github",
  "бан": "bun",
  "таури": "tauri",
  "раст": "rust",
  "веб сокет": "websocket",
  "веб джи пи ю": "webgpu",
  "тайпскрипт": "typescript",
}
```

After aliases are normalized, command matching tries exact match, phrase containment, then a guarded Levenshtein fallback. The fallback rejects the common unsafe pair `включи/выключи`.

## Important Details

Bun does not convert JavaScript strings to C strings for pointer arguments. `src/vosk.ts` encodes model paths and grammar JSON as null-terminated UTF-8 buffers before passing them to FFI.

Vosk returns JSON strings such as `{ "text": "открой гит хаб" }` or `{ "partial": "открой" }`. Commands are dispatched only from final utterance results, not from unstable partial text.
