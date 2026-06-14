# Память AppWeb

Дата фиксации: 2026-06-14.

Этот файл хранит рабочее понимание по `app/web`, которое нужно сохранять после компрессии контекста.

## Текущий статус

`AppWeb` на текущем этапе оставляем в покое как браузерную поверхность визуализации. Не нужно сейчас развивать его через временный browser `IndexedDB`, mirror-пробросы или восстановление старого worker-runtime.

Последний зафиксированный cleanup: `6d5a9bd8 Clean stale AppWeb worker runtime`.

Что уже удалено и не нужно восстанавливать:

- `app/web/runtime/dark.worker.ts`;
- `app/web/runtime/boundary.worker.ts`;
- `app/web/runtime/bulk.worker.ts`;
- браузерная обработка `worker-status`;
- старый browser `createIdbDbActorStore` render-mirror путь в `client.ts`;
- зависимости `@store/actor` и `@store/wimp` из `app/web/package.json`.

## Направление

Правильный ближайший путь - собрать чистую серверную логику без browser `IndexedDB` и без временных мостов.

Серверная сторона должна держать/получать состояние, формировать render projection и отдавать браузеру уже достаточные данные для визуализации. Браузерный `AppWeb` должен остаться тонким viewport-клиентом:

```text
WebSocket -> render events / world rows -> bulkViewport
```

Обычные доменные `Force parts` не равны render projection. Для визуализации нужны готовые render rows/events с полной геометрией, связями, depth, parent, радиусами, полями, цветами и подписями. Поэтому не строить сцену из доменных патчей, если они не несут этих данных.

## Следующий технический слой

Следующий осмысленный проход не в `AppWeb`, а в Bulk/render projection:

- вынести render-row типы из `@store/actor`;
- завести явный Bulk/render projection контракт;
- убрать из `bulk/web` и `bulk/gravity/layout` ожидание `DbWorldRows`, `DbParticleShellRow`, `DbFieldOrbitRow`, `DbActorStore` из `@store/actor`;
- после этого сервер сможет отдавать render projection напрямую, без browser DB-index.

## Правила для дальнейшей работы

- Не открывать новые вкладки браузера, если CDP target уже поднят. Работать с существующим CDP-target напрямую.
- Не восстанавливать `*.worker.ts` в `app/web/runtime`; новый запуск будет строиться иначе, ближе к тестовому/server path.
- Не добавлять обратно browser `IndexedDB` как временное хранилище render projection.
- Не считать `AppWeb` источником истины. Истина и вычисление projection должны быть на серверной/доменной стороне.
- Если нужно редактировать активные файлы внутри текущей среды интерпретатора, использовать API интерпретатора (`/processes/:id/apply_patch`).
