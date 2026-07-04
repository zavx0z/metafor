# Память AppWeb

`app/web` сейчас является тонкой браузерной поверхностью Bulk.

Текущий контракт:

- AppWeb не является сервером и не запускается как server-dev target.
- AppWeb не открывает Boundary/SQLite и не владеет `/ws`, `/force`, Matrix или Energy.
- HTML entry находится в `bulk/index.html` и напрямую загружает `app/web/client.ts`.
- HUD содержит только Settings и fullscreen.
- Browser settings идут через `bulk/settings`: `src`, `layoutSettings`, `renderSettings`.
- Interpreter workflow и source-editing rules лежат в `pkg/interpreter/AGENTS.md`, а не в AppWeb.

Не восстанавливать в AppWeb:

- `server.ts` или package-local server scripts;
- Matrix/Energy bridge endpoints;
- `runtime/*.worker.ts` или Bulk process runtime;
- browser IndexedDB как runtime DB mirror;
- interpreter process/source inspector;
- AppWeb-owned voice/WebRTC/Android/Codex/terminal/TODO panels;
- AppWeb scripts, которые управляют interpreter `process.*` tools.
