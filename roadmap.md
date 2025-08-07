# Roadmap MetaFor

Цель: довести ядро до стабильного, предсказуемого API с надежной персистентностью (браузер/сервер), корректной жизнью цикла, строгими реакциями по сообщениям и полноценной документацией. Для клиента — VanillaJS без сборщиков; для сервера — TypeScript на Bun; тесты — bun:test (Happy DOM).

## Вехи

### 0.3.x (stability/quality)

- Реализовать IndexedDBStore
  - Файлы: `web/store.ts`
  - Методы: `saveMetaIsNotExists`, `getMeta`, `saveActorIsNotExist`
  - Схема: object store `meta(meta, fingerprint)`, `actor(id, meta, parent_id, idx, snapshot, timestamp)`, индексы по `meta`, `parent_id`
  - Критерии: меты и актеры сохраняются/читаются, восстановление работает в перезагрузке (e2e тест в Happy DOM/mock)
- Закрытие BroadcastChannel и очистка слушателей
  - Файл: `core/index.ts` — в `disconnectedCallback()` закрыть канал и снять обработчики
  - Тест: `core/view/test/lifecycle.with-channel.spec.ts`
- Родитель/ребенок в сторе
  - Использовать `getParentMeta()` и `getIndexAmongSiblings()` для вычисления `parent_id` и `idx`; добавить `Store.getActorByMeta()` (web) и использовать `getNextIndexQuery` (server) при отсутствии явного `idx`
  - Файлы: `server/store/index.ts`, `web/store.ts`, `core/index.ts`
- Реакции: строгая фильтрация по хешу мета
  - Обновить примеры: везде `meta: childHash`, а не строковое имя
  - Тест: `core/react/test/filter.meta.hash.spec.ts`
  - Файлы: `README.md`, `index.js` (демо)
- DEV/PROD режим
  - Отключить `enableHtmlDebug()` по умолчанию; включать только при `globalThis.DEV === true`
  - Файл: `core/html/index.ts` (+ проверка глобального флага)
  - Тест: `core/html/tests/html/debug.mode.spec.ts`
- Документация и примеры
  - Актуализировать `README.md` (передача `core`, parent-child, dev-режим, IndexedDB)
  - Сгенерировать HTML-доку через `typedoc` (без JSDoc — использовать `title/description`)
- Покрытие тестами
  - Минимум: контекст, состояния, процессы, реакции, view-передача `context/core`, lifecycle
  - Стиль имен: dot-separated (напр., `view.lifecycle.channel.spec.ts`)

### 0.4.0 (persistence/API)

- Полная персистентность акторов в браузере
  - Восстановление актора по `meta` из IndexedDB, корректное определение `parent_id/idx`
  - Миграции схемы IndexedDB (версионирование)
- Конфигурация `persist` и интеграция со стором
  - На web: флаг `persist` активирует IndexedDBStore; без него — volatile-режим
  - На server: `SQLiteStore` как по умолчанию
- Снимки и инспекция
  - Публичный метод элемента `getSnapshot()` (документация), JSON-экспорт

### 0.5.0 (DX/observability)

- Диагностика и мониторинг
  - Встроенные события (инициализация/переход/процесс/ошибка) с опциональным логированием в DEV
- Улучшения HTML-движка
  - Микрооптимизации `render()` и батчинг перерисовок при серии сообщений
- Инструменты разработчика
  - Скрипты на Bun: e2e билды web/server, локальная дока

## Технические задачи

- IndexedDBStore
  - Реализация с транзакциями, индексы: `meta`, `parent_id`
  - E2E тесты: создание/монтирование/восстановление актора
- Channel lifecycle
  - Закрытие канала, отписка слушателей, отсутствие утечек
- Parent/child в сторах
  - Сервер: использовать `getNextIndexQuery` для `idx`
  - Браузер: вычислять `idx` сканированием по `parent_id` (или счетчик)
- Reactions meta hash
  - Обновить примеры и тесты, зафиксировать в доках правило «только хеш мета»
- DEV-флаг для HTML debug
  - Включать предупреждения только в DEV, тест отрицательных кейсов в PROD
- Тесты (bun:test, Happy DOM)
  - Имена — dot-separated; сообщения в `expect()` — короткие по-русски
- Документация (HTML)
  - Typedoc в `docs/`, примеры VanillaJS (без сборщиков) для клиента

## Производительность и безопасность

- TrustedTypes и sanitizer
  - Оставить хук `setSanitizer`; пример подключения в доке
- Микробенчи рендера и реакций
  - Сценарии списков (`repeat`) и частых апдейтов контекста

## Процесс релизов

- Сценарии (Bun):
  - Тесты: `bun test`
  - Доки: `bun run docs`
  - Веб/сервер: `bun run web:build:prod`, `bun run server:build:prod`
- Версионирование: semver; 0.3.x — стабилизация; 0.4.0 — персистентность; 0.5.0 — DX

## Критерии готовности релиза

- Все тесты зелёные, покрытие ключевых путей
- Демо (`index.html` + `index.js`) работает без сборщиков
- Документация актуальна, примеры корректны
- В браузере — IndexedDB персистентна; на сервере — SQLite стабилен
