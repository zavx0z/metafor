# UI-004 — Артефакты integrated retained UI

Дата: 20 августа 2026 года. Версия до capture:
`41970d955994ec90fbbf22231ddf2d6c7ed71e7b`.

## components-desktop.png

* Источник: background exact-CDP canvas `@ui/components` через `UI dev`.
* Ожидание: historical five-panel public shell, активный Components route и
  package-owned preview видимы без пустого либо чёрного canvas.
* Чувствительные сведения: нет.

## components-portrait.png и components-landscape.png

* Источник: background exact-CDP viewport matrix `@ui/components` через
  `UI dev`, с обязательным native restore.
* Ожидание: portrait/landscape показывают только активный preview, без
  horizontal overflow; после capture возвращаются исходные native metrics.
* Чувствительные сведения: нет.

## components-field.png

* Источник: background exact-CDP route `/field/values` через `UI dev`.
* Ожидание: universal Field controls видимы внутри package-owned retained
  preview, shell остаётся на месте, readiness и bounded counters опубликованы.
* Чувствительные сведения: нет.

## fixture-desktop.png, fixture-portrait.png и fixture-landscape.png

* Источник: background exact-CDP canvas общего `@ui/playground` fixture через
  `UI dev`, с обязательным native restore.
* Ожидание: reusable shell/preview видимы; mobile показывает только preview,
  console чиста, native metrics восстановлены.
* Чувствительные сведения: нет.

Фактические наблюдения и SHA-256 добавляются после просмотра каждого файла.
