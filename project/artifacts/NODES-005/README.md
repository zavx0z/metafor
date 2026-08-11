# NODES-005 — Артефакты

## Исходные наблюдения

Три снимка владельца показывают один дефект на разных участках сцены:
связанные зелёные semantic edges строятся отдельными U-маршрутами возле уже
существующего совместимого trunk. Ожидается один общий generated trunk с
отдельными exact terminal stubs и без объединения semantic IDs.

* `stacked-targets-u-loop.png` — 468×572 px, SHA-256
  `02114c00013ccd322d21ad7f0d8cf6d83dbe6d89f714b05f4cf776595784132c`;
* `avoidable-u-junction.png` — 308×134 px, SHA-256
  `87b8bf94116bae592097ca8ad04b0e9e0cb9f04fe9c507bb729e99d02c65045d`;
* `branch-junction.png` — 156×92 px, SHA-256
  `cbd15c39cf85cedfd753464b699ba6ee60bbc60334baa528875f63a18ff90961`.

Результаты offline/live-проверок добавляются к result commit после
воспроизводимого исправления.
