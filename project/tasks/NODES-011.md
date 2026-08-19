# NODES-011 — Перевести стенд раскладки на русский язык

## Коротко

Весь пользовательский интерфейс dev-only SVG playground отображается по-русски:
заголовки, кнопки, статусы, описания раскладок, fixtures, diagnostics и подписи
панелей. Технические идентификаторы graph data и имена contracts остаются
неизменными.

## Зачем

После закрытия NODES-010 playground функционально готов, но его видимый chrome
и пояснения смешивают английский и русский. Владельцу нужен целиком русский
интерфейс без изменения layout algorithms, fixtures и public API.

## Связанные задачи и история

* NODES-010 создала fixed/adaptive SVG playground и закрыта коммитом
  `ba19ca17c`.
* Correction `f2c91c1b1` сделала port labels inspectable и не меняла layout
  result.
* 19 августа 2026 года владелец прямо потребовал перевести весь интерфейс.

## Решения владельца

1. Все пользовательские надписи playground переводятся на русский.
2. `RIGHT`, `DOWN`, policy IDs, JSON field names, node/port/edge IDs и точные
   machine diagnostics остаются техническими данными; интерфейс объясняет их
   по-русски и при необходимости показывает technical token в скобках.
3. Layout, routing, side-selection, fixture topology, result hashes и package
   boundaries не меняются. SVG hashes меняются только вместе с русским
   доступным заголовком `<title>`.

## Границы

* Не переводить source identifiers, serialized JSON keys и public API.
* Не менять geometry, SVG coordinates, policy registry IDs и benchmark law.
* Не добавлять i18n framework для одного dev-only interface.
* Не запускать Hamiltonian и не менять WebGPU/product code.

## Критерии готовности

1. `html[lang]` равен `ru`.
2. Header, controls, buttons, status, sections, descriptions, layers, export,
   result и diagnostics UI не содержат необъяснённых английских фраз.
3. Fixed/adaptive и RIGHT/DOWN по-прежнему выбираются и сравниваются.
4. Structural test перечисляет canonical русские labels и запрещает прежние
   English UI strings.
5. Playground tests/typecheck/browser build, full `bun test pkg/nodes` и
   `git diff --check` проходят.
6. Уже открытая `ai-macos` вкладка обновлена; console чиста, screenshot визуально
   подтверждает русский интерфейс без новых overlap.

## Состояние

`REVIEW`.

## Результат

* Весь видимый chrome стенда, описания fixed/adaptive сценариев, статусы,
  метрики, кнопки и доступные SVG-заголовки переведены на русский.
* `RIGHT`, `DOWN`, `WEST`, `EAST`, `inout`, JSON keys и graph IDs сохранены как
  технические значения и объяснены русским текстом.
* Счётчики используют русские формы слов, а время отображается в `мс`.
* Layout result hashes и geometry не изменились; обновлены только SVG hashes,
  содержащие локализованный `<title>`.

## Проверки

* `bun test pkg/nodes` — 127 pass, 0 fail, 2140 expect.
* Playground TypeScript typecheck — pass.
* `git diff --check` — pass.
* `ai-macos` target `116F2A03988C2FA4FD5515BDAE7A83F5`: adaptive RIGHT/DOWN
  comparison отображает русские labels и `мс`; console — 0 entries; screenshot
  визуально не обнаружил overlap.
