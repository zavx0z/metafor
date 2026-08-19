# NODES-012 — Исправить порядок SVG-слоёв выносок портов

## Коротко

В dev-only SVG playground линии, соединяющие точный порт с внешней debug-подписью,
не проходят поверх листовых нод и их текста. Сокеты и внешние рамки с подписями
остаются поверх сцены и читаются полностью.

## История и evidence

* NODES-010 создала fixed/adaptive SVG playground и закрыта коммитом
  `ba19ca17c`.
* Correction `f2c91c1b1` вынесла debug labels за route bounds и доказала, что
  label boxes не пересекают semantic routes и друг друга. Порядок SVG-слоёв
  относительно листовых нод тогда не был закреплён.
* NODES-011 перевела интерфейс на русский и закрыта коммитом `65cc67581`.
* 19 августа 2026 года владелец прислал screenshot fixed RIGHT: серые пунктирные
  `port-label-leader` проходят поверх `observer`, `producer`, `consumer-a` и
  `consumer-b`.

## Подтверждённая причина

`svg.ts` материализует leader, label box и label text одним `port-label` group
внутри последнего слоя `ports`. В SVG порядок элементов задаёт painting order,
поэтому leader оказывается выше слоя `nodes`. Это presentation defect; layout,
routing и координаты портов корректны.

## Решение

1. Разделить линии выносок и их внешние рамки/текст на разные SVG-слои.
2. Рисовать semantic edges, затем leaders, затем nodes, gateways и exact ports,
   затем внешние label boxes/text.
3. Сохранить общий `PlaygroundPortLabel` projection и одну вычисленную geometry:
   presentation не дублирует placement подписей.
4. Закрепить структурным regression точный относительный порядок слоёв и
   browser screenshot на nested fixed RIGHT/DOWN и flat adaptive RIGHT/DOWN.

## Границы

* Не менять public layout input/result, routing, side-selection и coordinates.
* Не вводить CSS `z-index`: для SVG contract используется явный DOM order.
* Не менять Surface, Card, Hamiltonian, Worker или package exports.
* Не добавлять nested adaptive fixture: текущая adaptive matrix остаётся
  плоской; этот обнаруженный пробел не считается закрытым данной задачей.

## Критерии готовности

1. Ни один `port-label-leader` не рисуется поверх leaf node fill или текста.
2. Exact socket, label box и label text остаются видимыми поверх сцены.
3. Fixed/adaptive RIGHT/DOWN сохраняют прежние result hashes и geometry.
4. Structural regression доказывает `edges → leaders → nodes → gateways →
   ports → labels` и отсутствие leader внутри верхнего label layer.
5. `bun test pkg/nodes`, playground typecheck, browser console и
   `git diff --check` проходят.
6. В открытом через `ai-macos` playground владелец получает исправленную сцену
   без перекрытия карточек пунктирными leader lines.

## Состояние

`IN_PROGRESS`, исполнитель `/root`.
