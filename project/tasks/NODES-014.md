# NODES-014 — Соединить edge с exact socket в SVG playground

## Коротко

Semantic edge в dev-only SVG playground визуально непрерывно доходит от
generated compound gateway до exact socket дочерней ноды. Compound background
находится под route, leaf card — над route, а arrow marker имеет цвет edge.

## История и evidence

* NODES-010 создала SVG playground и exact endpoint geometry.
* NODES-012 исправила leaders и parent/child z-order, но закрепила слишком
  грубый порядок «все routes под всеми nodes»; закрыта `60471bc41`.
* Действующий `@nodes/ui` regression уже задаёт более точный закон:
  `routes above every containing owner and below child cards`.
* 19 августа 2026 года владелец прислал fixed RIGHT screenshot, где между
  `reply` gateway и `observer/in-reply` socket визуально нет cyan segment.
* Live DOM доказал: `reply.endPoint={84,178}` равен socket center `{84,178}`;
  gateway source-zone находится `{56,178}`. Геометрическая дистанция endpoint
  до socket равна `0`.

## Подтверждённая причина

1. SVG layer `edges` рисуется до общего `nodes`. Полупрозрачный compound fill
   (`opacity=0.72`) затем накрывает законный terminal segment `56→84` внутри
   owner, хотя gateway и socket рисуются позже и остаются яркими.
2. Marker path не имеет собственного fill и получает browser default black,
   поэтому оставшийся перед socket arrow визуально усиливает разрыв.

## Решение

1. Разделить compound на background и foreground chrome без дублирования
   layout geometry.
2. Painting order: `bounds → compound backgrounds → semantic edges → debug
   leaders → compound chrome → leaf nodes → gateways → exact ports → labels`.
3. Compound background содержит fill без stroke/text; foreground содержит
   border и title/size без fill. Parent-first order сохраняется в обоих слоях.
4. Edge arrow marker получает тот же cyan, что semantic edge stroke.
5. Toggle `nodes` скрывает backgrounds, chrome и leaf layers вместе; toggle
   `ports` сохраняет прежнее владение leaders/ports/labels.

## Границы

* Не менять layout input/result, router, endpoint, gateway и side geometry.
* Не импортировать `@nodes/ui` в playground; применяется уже действующий закон,
  но package boundary остаётся прежней.
* Не менять Card, Surface, Worker, WebGPU или Hamiltonian consumer.

## Критерии готовности

1. Каждый edge start/end по-прежнему точно равен центру source/target socket.
2. Terminal segments внутри containing compound видимы до leaf boundary.
3. Compound fill находится под edges; compound border/text и leaf cards — над
   edges; gateways, ports и labels остаются верхними слоями.
4. Marker fill совпадает с edge stroke и не создаёт чёрного разрыва.
5. Fixed/adaptive flat/compound RIGHT/DOWN сохраняют прежние result hashes.
6. Structural regression, `bun test pkg/nodes`, playground typecheck, browser
   console и `git diff --check` проходят.
7. Открытый `ai-macos` playground оставлен на сценарии владельца для проверки.

## Состояние

`REVIEW`.

## Результат

* Compound rectangle материализуется один раз в layout result, но SVG рисует
  его fill в `compound-backgrounds`, а border/title/size — в
  `compound-chrome`. Leaf cards принадлежат отдельному `leaf-nodes`.
* Итоговый order: `compound-backgrounds → edges → port-label-leaders →
  compound-chrome → leaf-nodes → gateways → ports → port-labels`.
* Arrow marker имеет `fill=#7dd3fc`, совпадающий с edge stroke.
* `nodes` toggle управляет всеми тремя node layers, `ports` toggle — leaders,
  exact ports и external labels; после browser proof controls восстановлены.
* Все шесть result hashes fixed/adaptive flat/compound RIGHT/DOWN неизменны;
  обновились только SVG presentation hashes.
* [Owner-before и after evidence](../artifacts/NODES-014/README.md) сохранены в
  карточке result.

## Проверки

* `bun test pkg/nodes` — 129 pass, 0 fail, 2434 expect.
* Playground TypeScript typecheck — pass.
* `git diff --check` — pass.
* Live fixed RIGHT: `reply.endPoint={84,178}` равен
  `observer/in-reply center={84,178}`, gateway=`{56,178}`, distance=`0`.
* Computed styles: compound background fill `rgb(22,37,54)`/stroke `none`;
  compound chrome fill `none`; edge stroke и marker fill `rgb(125,211,252)`.
* Browser console — 0 entries; visual inspection показывает непрерывный cyan
  terminal segment и сохраняет foreground leaf cards/chrome.
