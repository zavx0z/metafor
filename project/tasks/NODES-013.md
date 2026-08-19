# NODES-013 — Добавить adaptive compound matrix в playground

## Коротко

Dev-only SVG playground явно показывает и сравнивает адаптивную раскладку
вложенных compound-нод в RIGHT и DOWN. Оба варианта вызывают существующий public
`@nodes/layout/adaptive`; playground не добавляет собственный solver.

## История и evidence

* NODES-010 реализовала общий solver, fixed/adaptive policies и SVG playground;
  закрыта коммитом `ba19ca17c`.
* `COMMON.md` уже требует универсальности по числу и вложенности нод, а
  `ADAPTIVE.md` передаёт каждый side assignment тому же общему solver.
* Текущий fixed baseline содержит два compounds и проверяется в RIGHT/DOWN.
  Текущая adaptive matrix содержит только три root leaf-ноды.
* 19 августа 2026 года владелец спросил, сделаны ли вложенные варианты. Проверка
  показала неполную matrix: adaptive nested fixtures отсутствуют.
* Read-only проба public adaptive policy с `source-zone → source` и
  `target-zone → target-a,target-b` уже дала RIGHT bounds `604×424`, shared
  port=`EAST`; DOWN bounds `316×588`, shared port=`WEST`; по 2 bounded candidates.

## Решение

1. Сохранить существующую flat adaptive family как отдельный простой случай.
2. Добавить family `adaptive-compound-side-selection` с одной и той же topology
   и разными viewport для RIGHT/DOWN.
3. Вложить `source` в `source-zone`, `target-a` и `target-b` — в `target-zone`;
   ports, edges, capabilities и allowed sides оставить прежними.
4. Заморозить result/SVG hashes, bounds, resolved shared side, compound/gateway
   metrics и детерминизм повторов.
5. Добавить русские labels/descriptions и browser comparison evidence.

## Границы

* Не менять adaptive/fixed/common solver, objective, routing или validation.
* Не добавлять Card, UI Surface, WebGPU, Worker или Hamiltonian consumer.
* Не считать playground screenshot product acceptance.
* Не удалять flat adaptive fixtures: nested — дополнительная форма topology,
  а не замена минимального shared-port случая.

## Критерии готовности

1. Scenario selector содержит adaptive flat и adaptive nested RIGHT/DOWN.
2. Nested pair отличается только viewport и использует одну topology с двумя
   compounds и тремя leaf descendants.
3. Public adaptive result имеет expected direction, два compounds, generated
   gateways и одну resolved side shared exact port для обеих semantic edges.
4. Repeats и permutations дают bit-identical result/diagnostics.
5. Все прежние fixed/flat-adaptive result hashes остаются неизменными.
6. `bun test pkg/nodes`, playground typecheck, browser console и
   `git diff --check` проходят.
7. Открытый через `ai-macos` playground оставлен на русском adaptive nested
   RIGHT/DOWN comparison для проверки владельцем.

## Состояние

`REVIEW`.

## Результат

* Playground содержит шесть fixtures: fixed compound RIGHT/DOWN, adaptive flat
  RIGHT/DOWN и adaptive compound RIGHT/DOWN.
* Новая nested pair использует прежние shared port, capabilities, allowed sides
  и edges; добавлены только `source-zone`, `target-zone` и `parentId`.
* Public adaptive policy вернула RIGHT `604×424`, shared=`EAST`, и DOWN
  `316×588`, shared=`WEST`; оба результата имеют 2 compounds и 4 gateways.
* Repeats и reversed nodes/ports/allowedSides/edges дают тот же result,
  diagnostics и SVG. Все прежние baselines остались неизменными.
* [Browser evidence](../artifacts/NODES-013/README.md) показывает русскую nested
  adaptive matrix после NODES-012 painting-order correction.

## Проверки

* `bun test pkg/nodes` — 128 pass, 0 fail, 2295 expect.
* Playground TypeScript typecheck — pass.
* `git diff --check` — pass.
* Browser DOM: обе панели имеют 2 compounds, 3 leaves, 4 gateways и parent-first
  node order `source-zone → source → target-zone → target-a → target-b`.
* `ai-macos` console capture — 0 entries; visual inspection соответствует
  ожидаемой nested RIGHT/DOWN matrix без z-order regression.
