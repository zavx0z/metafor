# @metafor/voice

Bun FFI bridge к Vosk C API для распознавания русских голосовых команд и локальный wake playground.

Пакет загружает русскую модель Vosk, принимает 16-bit mono PCM, читает JSON-результаты Vosk, нормализует произнесённые английские технические термины через русские фонетические aliases и запускает найденные команды из Bun.

## Файлы

- `src/vosk.ts` загружает `libvosk` через `bun:ffi` и оборачивает lifecycle модели/recognizer-а.
- `src/commands.ts` сопоставляет русские командные фразы, фонетические aliases и небольшие ошибки распознавания через Levenshtein distance.
- `src/wav.ts` извлекает PCM из простого 16-bit mono WAV-файла.
- `src/web/server.ts` обслуживает браузерный wake playground и стримит microphone PCM через WebSocket.
- `examples/recognize-file.ts` распознаёт WAV или raw PCM файл.
- `examples/recognize-mic.ts` захватывает локальный macOS microphone через ffmpeg.

## Runtime-требования

Локальные native/runtime assets ожидаются рядом с пакетом:

- `lib/libvosk.dylib`
- `models/ru`
- опционально `bin/ffmpeg`
- опционально `samples/*.wav`

Эти assets намеренно игнорируются Git, потому что они большие и зависят от машины. Их также можно указать явно.

Скачать native-библиотеку Vosk и малую русскую модель:

```sh
bun run voice:assets
```

Прямо из этого пакета:

```sh
bun run assets
```

```sh
export VOSK_LIB="$PWD/lib/libvosk.dylib"
export VOSK_MODEL="$PWD/models/ru"
```

Audio, отправляемое в Vosk, должно быть 16-bit mono PCM. WAV input разбирается автоматически; для raw PCM нужны `--raw-pcm --sample-rate`.

## Wake Playground

Из этого пакета:

```sh
bun run playground
```

Из корня production workspace:

```sh
bun --filter @metafor/voice playground
```

или:

```sh
bun run voice:playground
```

Затем открыть wake playground:

```text
http://127.0.0.1:4765
```

Wake playground работает только с локальным Vosk server на `/ws` и не управляет ASR-туннелем.

ASR/Whisper playground вынесен отдельно:

```text
http://127.0.0.1:4765/whisper
```

ASR/Whisper page использует явно заданный WebSocket URL. По умолчанию это:

```text
ws://127.0.0.1:8787/ws
```

Локальный ASR tunnel запускается отдельной командой из корня production workspace:

```sh
bun run voice:asr:tunnel
```

или напрямую:

```sh
ssh -N -L 127.0.0.1:8787:127.0.0.1:8787 ai-srv
```

Проверить wake service:

```sh
bun run voice:vosk:health
```

Проверить ASR tunnel после ручного запуска:

```sh
bun run voice:asr:health
```

ASR service принимает context prompt из поля `Context` на `/whisper` и передаёт его в Whisper как `initial_prompt`.

Environment:

```sh
PORT=4765
HOST=127.0.0.1
VOICE_SAMPLE_RATE=16000
VOICE_GRAMMAR=1
VOSK_LOG_LEVEL=-1
```

Браузер захватывает microphone audio, запрашивает 16 kHz `AudioContext`, конвертирует mono float samples в 16-bit PCM, стримит chunks в `/ws` и отображает partial/final recognition вместе с command matches.

## CLI

```sh
bun run recognize ./speech.wav
bun run recognize ./speech.pcm --raw-pcm --sample-rate 16000
```

Локальный native smoke test:

```sh
bun run smoke
```

Из корня workspace:

```sh
bun run voice:smoke
```

Локально сгенерированный sample:

```sh
bun run recognize:sample
```

Live microphone capture на macOS:

```sh
bun run recognize:mic --list-devices
bun run recognize:mic --device ":0"
bun run recognize:mic --device ":0" --partial
```

Первый запуск microphone может потребовать macOS Microphone permission для терминала, в котором работает Bun. Если `--list-devices` не показывает audio devices или возвращает `Input/output error`, выдайте разрешение в System Settings и повторите.

По умолчанию recognizer-ы используют малую русскую grammar с командными фразами и `[unk]`. Используйте `--no-grammar` в CLI или `VOICE_GRAMMAR=0` в playground server, чтобы работать с полным словарём модели.

## Команды

Команды по умолчанию находятся в `src/commands.ts`:

- `lights.on`: `включи свет`, `зажги свет`
- `door.open`: `открой дверь`
- `github.open`: `открой github`, распознаётся как `открой гитхаб` или `открой гит хаб`
- `bun.run`: `запусти bun`, распознаётся как `запусти бан`
- `webgpu.check`: `проверь webgpu`, распознаётся как `проверь веб джи пи ю`

Замените функцию `run()` каждой команды на нужное package-side действие.

## Фонетические Aliases

Aliases по умолчанию находятся в `src/commands.ts`:

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

После нормализации aliases command matching сначала пробует exact match, затем phrase containment, затем guarded Levenshtein fallback. Fallback отклоняет частую небезопасную пару `включи/выключи`.

## Важные детали

Bun не конвертирует JavaScript strings в C strings для pointer arguments. `src/vosk.ts` кодирует пути модели и grammar JSON как null-terminated UTF-8 buffers перед передачей в FFI.

Vosk возвращает JSON strings вида `{ "text": "открой гит хаб" }` или `{ "partial": "открой" }`. Команды запускаются только из финальных utterance results, а не из нестабильного partial text.
