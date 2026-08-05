# LAD-003 — Артефакты

## apply-lada-send.ts

* Источник: воспроизводимый Monad RPC-клиент текущей задачи.
* Дата: 2026-08-05.
* Версия проекта: `d53ffda4e`.
* Ожидание: Agent сохраняет причинный message key, Model получает отдельный
  system message, а готовый черновик становится одним долговечным outbox intent
  без прямого вызова Chat API.
* Чувствительные сведения: отсутствуют.

## finish-lada-send-types.ts

* Источник: Monad RPC-клиент типового выравнивания Process wrappers.
* Дата: 2026-08-05.
* Версия проекта: `d53ffda4e`.
* Ожидание: peer TypeScript принимает общий Process envelope без изменения
  поведения Agent и Model actions.
* Чувствительные сведения: отсутствуют.

## finish-lada-model-types.ts

* Источник: Monad RPC-клиент artifact-only recovery с изменённым Process label.
* Дата: 2026-08-05.
* Версия проекта: `d53ffda4e`.
* Ожидание: Model wrapper и его декларация публикуются одним непустым patch.
* Чувствительные сведения: отсутствуют.

## send-proof.test.mjs

* Источник: автономная проверка Model persona и причинного Chat outbox.
* Дата: 2026-08-05.
* Версия проекта: `d53ffda4e`.
* Ожидание: persona уходит отдельным `system` message, один `intent` сохраняет
  исходный `messageKey`, а ack и realtime echo переводят его в `sent` без
  скрытого повтора ошибочного намерения.
* Чувствительные сведения: отсутствуют.
