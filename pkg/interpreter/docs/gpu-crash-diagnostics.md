# WebGPU Crash Diagnostics

Этот план относится к WebGPU runtime интерпретатора, а не к `app/web`.
Цель - получить устойчивый след последней успешной GPU-операции перед macOS
kernel panic на Chrome/Metal/Dawn path.

## Контур

- Target UI: browser page интерпретатора, один WebGPU `Space` и `UiRuntime`.
- Init path: `pkg/interpreter/web/main.ts` -> `ui/elements/runtime.ts` ->
  `pkg/engine/src/renderer/index.ts`.
- Renderer/WebGPU objects: `pkg/engine/src/renderer/index.ts` и texture loader
  `pkg/engine/src/loaders/TextureLoader.ts`.
- Не внедрять эту диагностику в `app/web`: AppWeb сейчас только продуктовый
  контур, а падающий WebGPU canvas находится в интерпретаторе.

## Что Нужно Получить После Следующего Panic

- Выбранный adapter: `adapter.info`, features, limits и выбранный режим
  `default` / `low` / `high`.
- Requested device features/limits.
- `userAgent`, URL/query, build/git hash при наличии.
- Последние 200-500 breadcrumbs из `localStorage`, переживающие reboot.
- Последний незакрытый session heartbeat и отметка, что предыдущий WebGPU
  session завершился не cleanly.
- Конкретная последняя операция: shader/pipeline/resource/queue submit/pass.

## Реализация

1. Добавить dev-only module `pkg/interpreter/web/gpu-crash-debug.ts`.
2. Ввести выбор adapter mode для interpreter URL:
   - `?gpu=low` -> `requestAdapter({powerPreference: "low-power"})`;
   - `?gpu=high` -> `requestAdapter({powerPreference: "high-performance"})`;
   - `?gpu=default` или отсутствие -> текущая логика;
   - выбранный режим сохранять в `localStorage` через
     `window.__gpuCrashDebug.setMode(...)`.
3. На старте WebGPU session писать active marker и heartbeat раз в 1 секунду;
   на normal unload отмечать clean shutdown.
4. При старте, если previous session был active и не clean, печатать в console
   и показывать в debug surface последние breadcrumbs.
5. Обернуть device/queue/encoder methods минимальным proxy/wrapper:
   `createShaderModule`, render/compute pipeline sync/async, texture/buffer,
   `queue.writeBuffer`, `queue.writeTexture`, `queue.submit`, render pass
   begin/end.
6. Проставить понятные `label` всем создаваемым WebGPU objects, особенно
   shader modules, pipelines, uniform/storage buffers, render targets,
   depth/MSAA textures и texture-loader resources.
7. Подключить `device.pushErrorScope/popErrorScope`, `uncapturederror` и
   `device.lost`; писать ошибки и `device.lost` в тот же ring buffer.
8. Добавить console API:
   - `window.__gpuCrashDebug.dump()`;
   - `window.__gpuCrashDebug.clear()`;
   - `window.__gpuCrashDebug.setMode("low" | "high" | "default")`.

## Правила Внедрения

- Не делать большой рефактор renderer/runtime.
- Не добавлять постоянный render loop или polling renderer-а ради диагностики.
- Breadcrumb writes должны быть синхронными `localStorage.setItem`, но компактными.
- Stack писать только в dev/debug mode и обрезать, чтобы не раздувать storage.
- Если wrapper ломает native WebGPU object identity, откатить wrapper на точечные
  helper calls рядом с опасными операциями.

## Тестовый Порядок

1. Сначала тестировать `?gpu=low`, потому что нужно изолировать Intel path.
2. После ребута открыть interpreter с тем же origin и вызвать:
   `window.__gpuCrashDebug.dump()`.
3. Сохранить из dump: previous session, adapter summary, последний breadcrumb,
   последние `queue.submit` и pipeline/shader/resource labels.
4. Затем отдельно повторить на `?gpu=high` для AMD Radeon Pro 560.

