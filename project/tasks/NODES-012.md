# NODES-012 — Исправить порядок SVG-слоёв вложенной сцены

## Коротко

В dev-only SVG playground линии, соединяющие точный порт с внешней debug-подписью,
не проходят поверх листовых нод и их текста. Родительский compound рисуется до
своих потомков и не затемняет их полупрозрачным fill. Сокеты и внешние рамки с
подписями остаются поверх сцены и читаются полностью.

## История и evidence

* NODES-010 создала fixed/adaptive SVG playground и закрыта коммитом
  `ba19ca17c`.
* Correction `f2c91c1b1` вынесла debug labels за route bounds и доказала, что
  label boxes не пересекают semantic routes и друг друга. Порядок SVG-слоёв
  относительно листовых нод тогда не был закреплён.
* NODES-011 перевела интерфейс на русский и закрыта коммитом `65cc67581`.
* 19 августа 2026 года владелец прислал screenshot fixed RIGHT: серые пунктирные
  `port-label-leader` проходят поверх `observer`, `producer`, `consumer-a` и
  `consumer-b`, а полупрозрачные parent compounds затемняют дочерние карточки.

## Подтверждённая причина

В SVG порядок элементов задаёт painting order. `svg.ts` материализовал leader,
label box и label text одним `port-label` group внутри последнего слоя `ports`,
поэтому leader оказывался выше слоя `nodes`. Внутри `nodes` все элементы
сортировались только по ID; `source-zone` и `target-zone` поэтому рисовались
после своих детей и накрывали их полупрозрачным fill. Оба расхождения являются
presentation defects; layout, routing и координаты портов корректны.

## Решение

1. Разделить линии выносок и их внешние рамки/текст на разные SVG-слои.
2. Рисовать semantic edges, затем leaders, затем nodes, gateways и exact ports,
   затем внешние label boxes/text.
3. Внутри слоя nodes рисовать каждого ancestor до его descendants, сохраняя
   детерминированный ID-order среди нод одинаковой глубины.
4. Сохранить общий `PlaygroundPortLabel` projection и одну вычисленную geometry:
   presentation не дублирует placement подписей.
5. Закрепить структурным regression точный относительный порядок слоёв,
   ancestor/descendant painting order и
   browser screenshot на nested fixed RIGHT/DOWN и flat adaptive RIGHT/DOWN.

## Границы

* Не менять public layout input/result, routing, side-selection и coordinates.
* Не вводить CSS `z-index`: для SVG contract используется явный DOM order.
* Не менять Surface, Card, Hamiltonian, Worker или package exports.
* Не добавлять nested adaptive fixture: текущая adaptive matrix остаётся
  плоской; этот обнаруженный пробел не считается закрытым данной задачей.

## Критерии готовности

1. Ни один `port-label-leader` не рисуется поверх leaf node fill или текста.
2. Каждый parent compound предшествует всем своим descendants в SVG и не
   затемняет дочерние карточки.
3. Exact socket, label box и label text остаются видимыми поверх сцены.
4. Fixed/adaptive RIGHT/DOWN сохраняют прежние result hashes и geometry.
5. Structural regression доказывает `edges → leaders → nodes → gateways →
   ports → labels` и отсутствие leader внутри верхнего label layer.
6. `bun test pkg/nodes`, playground typecheck, browser console и
   `git diff --check` проходят.
7. В открытом через `ai-macos` playground владелец получает исправленную сцену
   без перекрытия карточек пунктирными leader lines.

## Checkpoints

* `a402ad171` — leaders отделены от внешних labels и помещены между semantic
  edges и nodes; fixed RIGHT screenshot доказал, что пунктир скрыт листовыми
  карточками, и одновременно выделил оставшееся затемнение детей parent fill.

## Состояние

`REVIEW`.

## Результат

* `port-label-leader`, exact ports и внешние labels разделены на независимые
  SVG-слои. Toggle `ports` по-прежнему управляет всеми тремя слоями.
* Node painting order строится parent-first обходом: один индекс parent IDs,
  один индекс children, stable ID-order siblings. Parent предшествует любому
  descendant без квадратичного поиска по graph nodes.
* Fixed/adaptive RIGHT/DOWN result hashes не изменились. SVG hashes обновлены
  только из-за presentation DOM order.
* В [артефактах](../artifacts/NODES-012/README.md) сохранены owner-before,
  nested fixed after и обе сравнительные after-матрицы.

## Проверки

* `bun test pkg/nodes` — 127 pass, 0 fail, 2190 expect.
* Playground TypeScript typecheck — pass.
* `git diff --check` — pass.
* Browser DOM fixed RIGHT/DOWN: `edges → port-label-leaders → nodes → gateways
  → ports → port-labels`; node order `source-zone → observer → producer →
  target-zone → consumer-a → consumer-b`.
* Browser DOM adaptive RIGHT/DOWN: тот же общий layer order, по 3 leaders,
  0 leaders внутри верхнего label layer.
* `ai-macos` console capture — 0 entries; визуальная проверка всех трёх after
  screenshots не обнаружила leader поверх leaf-ноды или parent fill поверх
  потомка.
