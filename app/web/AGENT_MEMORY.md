# Память AppWeb

`app/web` сейчас является тонкой браузерной поверхностью Bulk.

Текущий контракт:

- AppWeb не управляет interpreter и не вызывает interpreter API.
- HUD содержит только Settings и fullscreen.
- AppWeb не содержит Codex, terminal, voice, Android, TODO, source inspector или WebRTC tooling.
- `app/web/server.ts` импортирует `dark/server`, получает `globalThis.boundary` и отдаёт браузеру Bulk snapshot через `boundary.bulkRuntime()`.
- AppWeb не открывает SQLite напрямую.
- Browser settings идут через `bulk/settings`: `src`, `layoutSettings`, `renderSettings`.
- Interpreter workflow и source-editing rules лежат в `pkg/interpreter/AGENTS.md`, а не в AppWeb.

Не восстанавливать в AppWeb:

- `runtime/*.worker.ts` как основной runtime;
- browser IndexedDB как runtime DB mirror;
- interpreter process/source inspector;
- AppWeb-owned voice/WebRTC/Android/Codex/terminal/TODO panels;
- AppWeb scripts, которые управляют interpreter `process.*` tools.
