# NODES-002 — Минимизировать пересечения рёбер

## Коротко

Параллельные линии не должны пересекаться на каждом повороте. Если пересечение
можно убрать правильным порядком routing lanes или перестановкой связанных
строк параметров, система обязана выбрать вариант без пересечения.

## Зачем

В текущей живой Hamiltonian-сцене две длинные связи пересекаются при переходе
между вертикальными и горизонтальными участками одного corridor. Аналогичное
пересечение рядом с `Service Worker` устраняется простой перестановкой строк
`MessagePort` и `WS`, без перемещения карточки. Такие пересечения создают
ложные визуальные junctions и увеличивают сложность чтения графа.

## Связь с дорожной картой

Задача продолжает общую node-system линию раздела «Наблюдаемость и управление
Hamiltonian». Алгоритмическая часть принадлежит `@nodes/layout`, подготовка
строк — `nodes`; Hamiltonian предоставляет только реальный acceptance graph.
NODES-001 ожидает эту задачу, потому что обе меняют тот же routing path.

## Подтверждённые факты

* Общий снимок и три его увеличенных фрагмента показывают инверсию порядка двух
  зелёных lanes на северо-западном, юго-западном и восточном поворотах.
* Пересечения находятся на прямых ортогональных участках и существуют до
  renderer rounding.
* На снимке `Service Worker` зелёная вертикаль пересекает голубой горизонтальный
  участок. Перестановки только двух связанных parameter rows достаточно, чтобы
  убрать этот crossing без перемещения ноды.
* Exact sockets, semantic edge identities и compound boundaries менять для
  показанных исправлений не требуется.

## Решения владельца

* После hard validity алгоритм прежде всего минимизирует total crossings, затем
  max crossings одного edge; старый порядок, где crossings были последней
  soft-целью, заменён.
* Инверсия порядка параллельных lanes на общем повороте запрещена, если доступен
  непересекающийся transition с теми же hard laws.
* Если crossing устраняется перестановкой связанных parameter rows, adapter
  выбирает её до перемещения карточек или добавления route bends.
* Общие законы закреплены в
  [`@nodes/layout`](../../pkg/nodes/layout/requirements/COMMON.md), а подготовка
  строк — в [`nodes`](../../pkg/nodes/REQUIREMENTS.md).

## Границы

* Не менять domain facts, parameter IDs, semantic edges или их exact sockets.
* Не добавлять ручные lanes, coordinates, gateways, fixture IDs и
  Hamiltonian-specific offsets.
* Не ослаблять containment, obstacle clearance, WEST/EAST transitions,
  orthogonality или determinism ради уменьшения crossings.
* Не менять renderer: дефект должен исчезнуть в layout geometry до скругления.
* Сохранять пользовательский порядок несвязанных строк.

## Рабочая гипотеза

Router независимо выбирает участки каждого edge и допускает perpendicular
edge-edge intersection как позднюю soft-цель. Требуется учитывать уже занятые
segments в search cost/legality и сохранять топологический порядок lanes на
поворотах. Presentation adapter должен сравнивать ограниченные стабильные
перестановки связанных rows по той же crossing-first оценке.

## Критерии готовности

* Микрофикстуры доказывают непересекающиеся переходы двух и трёх lanes на всех
  четырёх ортогональных поворотах.
* Router минимизирует total/max crossings без нарушения общих hard laws.
* Связанные parameter rows переставляются детерминированно, когда это уменьшает
  crossings; обычные строки остаются на месте.
* Показанные пять screenshot-дефектов воспроизводятся machine-readable graph и
  исчезают после исправления.
* `RIGHT` и `DOWN`, три повтора и стабильные перестановки входных массивов дают
  одинаковую geometry и одинаковые crossing metrics.
* Focused tests и typecheck проходят; затем открытая Hamiltonian-вкладка
  подтверждает результат без запуска нового runtime.

## Проверка результата

```bash
bun test pkg/nodes/layout/src pkg/nodes/layout-engine.test.ts
bun run --cwd pkg/nodes/layout typecheck
bun run --cwd pkg/nodes typecheck
```

## Реализованный срез

* Routing score и итоговый graph selection сравнивают total/max crossings до
  turns и Manhattan.
* Product search ограничен восемью детерминированно выбранными placement
  candidates и двумя стабильными edge schedules; входные перестановки не
  влияют на выбор.
* Shared U-corridor получает validator-gated bundle-uncross без новых
  coordinates: существующие legal tracks назначаются semantic edges в одном
  порядке на всех четырёх поворотах.
* Nodes-adapter выполняет один ограниченный connected-row pass и принимает его
  только при crossing-first улучшении всей раскладки.
* Reproducible performance benchmark запускает чистый `@nodes/layout` на двух
  frozen `LayoutGraph` отдельно от UI, Worker и test assertions. Подробные
  samples и сопоставление с историческим MF-419/ELK baseline находятся в
  artifacts: текущий median `47.83 ms` для `RIGHT` и `285.78 ms` для `DOWN`;
  snapshots с разным числом нод не выдаются за одинаковый input.
* Frozen и live evidence записаны в artifacts; runtime не запускался и не
  перезапускался.

## Приёмка владельца

2026-08-10 владелец визуально принял результат в открытом Hamiltonian contour и
принял зафиксированный benchmark `RIGHT`/`DOWN`. Дальнейшая стадия — независимая
закрывающая проверка документации, договоров, кода, tests и evidence; визуальный
gate повторно открывать не требуется, если проверка не обнаружит изменение
геометрии.

Владелец уточнил package-процесс: benchmark снимается один раз для уже готового
результата непосредственно перед `REVIEW`, а не после каждой промежуточной
итерации. Решение о необходимости performance-оптимизации принимается после
review и при необходимости оформляется отдельной задачей.

## Closing handoff

* Result commit: `e17a3394f61194dccda790a97406ac7c92118f37` (`feat(nodes):
  compact layout and minimize crossings`). Final benchmark/documentation
  supplement: `35d3183f4` (`docs(nodes): record final layout benchmark`).
* Затронутые владельцы: routing `@nodes/layout`, connected-row presentation-
  adapter `nodes` и измерение parameter rows в `@nodes/ui`; Hamiltonian — только
  live acceptance consumer.
* Постоянные документы для сверки:
  [`layout/requirements/COMMON.md`](../../pkg/nodes/layout/requirements/COMMON.md),
  [`layout/README.md`](../../pkg/nodes/layout/README.md),
  [`nodes/REQUIREMENTS.md`](../../pkg/nodes/REQUIREMENTS.md) и
  [`ui/REQUIREMENTS.md`](../../pkg/nodes/ui/REQUIREMENTS.md).
* Долговечные выводы: crossing-first objective, стабильный lane order на
  поворотах, ограниченная перестановка только связанных parameter rows и
  обязательный final benchmark перед `REVIEW` перенесены постоянным владельцам.
* Свежая проверка перед handoff: `26/26` focused tests, typecheck пакетов
  `@nodes/layout` и `nodes`, `git diff --check` — green. Frozen proofs дают
  `RIGHT 10→4`, `DOWN 10→6`, live acceptance устраняет показанные crossings;
  final median ядра — `47.83 ms RIGHT` и `285.78 ms DOWN`.
* Владелец 2026-08-10 визуально принял результат и benchmark. Performance-
  оптимизация не входит в это закрытие и создаётся отдельной задачей только по
  последующему решению владельца.

## Артефакты

Исходные снимки и их provenance находятся в
[`project/artifacts/NODES-002`](../artifacts/NODES-002/README.md).
