# NODES-018 — Артефакты

## Standalone browser evidence

* Источник: checkout-owned `@nodes/ui` playground через skill
  `node-system-dev` и exact `@meta/chrome` CDP target.
* Дата: 2026-08-19.
* Версия проекта: preparation checkpoint NODES-018.5 записывается до запуска.
* Ожидание: desktop, portrait `390×844 @2` и landscape `844×390 @2` показывают
  полные retained Nodes без detached text/Socket scale, обрезаются viewport-ом
  без horizontal overflow и не создают console errors.
* Фактическое наблюдение: ожидает browser proof.
* Чувствительные сведения: нет.

Планируемые exact canvas captures:

* `node-system-desktop.png`;
* `node-system-portrait.png`;
* `node-system-landscape.png`.

## Retained performance evidence

* Источник: dev-only read-only diagnostics representative NodeEditor в том же
  exact target.
* Дата: 2026-08-19.
* Ожидание: чистая серия pan/zoom не меняет `localLayoutPlans` и
  `materializations`, увеличивает только `transformOnlyFrames`; actual
  `matrixWorld` samples сохраняют одинаковый parent/child scale ratio, а Link
  endpoints совпадают с raw exact Socket centers.
* Фактическое наблюдение: ожидает browser proof.
* Чувствительные сведения: нет.

Планируемые machine-readable files:

* `browser-evidence.json`;
* `retained-performance.json`.
