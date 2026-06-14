# @metafor/android

Самостоятельный пакет для просмотра экрана Android и управления локальными устройствами через ADB.

## Runtime-зависимости

- `adb` из Android Platform Tools.
- `scrcpy` для экспериментов с нативным зеркалированием с низкой задержкой.
- Подключённое Android-устройство с включённой и подтверждённой USB Debugging.

Установка на macOS:

```bash
# MacPorts
sudo port install scrcpy

# Homebrew
brew install --cask android-platform-tools
brew install scrcpy
```

Проверить устройство:

```bash
adb devices -l
```

Если найдено несколько записей, пакет выбирает первую запись со статусом `device` и игнорирует `offline`-эмуляторы. Чтобы явно закрепить устройство:

```bash
ANDROID_SERIAL=12697154CV000558 PORT=3007 bun --hot src/standalone.ts
```

## Запуск

```bash
PORT=3007 bun --hot src/standalone.ts
```

Открыть:

```text
http://127.0.0.1:3007/
```

Браузерный UI использует `/android/h264` для realtime-потока raw H.264 из `adb exec-out screenrecord --output-format=h264`, который декодируется в Chrome через WebCodecs. `/android/stream` остаётся fallback-режимом со скриншотами ADB для браузеров без WebCodecs или на случай сбоя запуска видео.

`scrcpy --record` проверен и корректно записывает видеофайлы, но на macOS scrcpy 3.3 не отдаёт пригодный live browser stream через stdout/FIFO. Поэтому `scrcpy` остаётся нативной зависимостью для зеркалирования и отладки, но не используется как браузерный видеотранспорт. Серверные helper-ы пакета отделены от host-приложений, поэтому `admin/proposal` не нужны Android-специфичные routes или UI.

Настройка видео:

```bash
ANDROID_SERIAL=12697154CV000558
ANDROID_H264_BIT_RATE=4000000
ANDROID_H264_SIZE=720x1600
```
