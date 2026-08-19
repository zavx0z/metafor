# NODES-010 — Отделить карточку от ноды и поддержать две раскладки

## Коротко

Одна semantic topology должна отображаться разными presentation presets и
раскладываться fixed либо adaptive policy без копирования алгоритмов. Для
разработки и сравнения раскладок появляется лёгкий SVG playground, который не
зависит от WebGPU, Engine или продуктового consumer.

## Зачем

Сейчас `NodeSystemDocument` одновременно описывает topology и конкретную Card
Model: `title`, `summary`, `facts`, `actions`, а port обязан принадлежать
`fact`. Одновременно public layout protocol, Worker, placement и router
реализуют только fixed закон `source=out/EAST`, `target=in/WEST`, хотя общая
model уже допускает `inout`, независимую visual side и обратное движение
message marker по одному edge.

Если adaptive добавить поверх этой структуры локальными условиями, Card,
fixed/adaptive policies и routing переплетутся, оба algorithms попадут в один
bundle, а новые presentation presets потребуют копий adapters. Требуется сначала
исправить границы, затем реализовать второй policy через общее числовое ядро.

## Связь с дорожной картой

Задача продолжает универсальную node-system в разделе
[`Наблюдаемость и управление Hamiltonian`](../ROADMAP.md#наблюдаемость-и-управление-hamiltonian).
Она не изменяет Hamiltonian lifecycle, Bulk Node View или WebGPU Engine и не
восстанавливает закрытую NODES-009. Продуктовая интеграция adaptive policy
будет отдельной задачей consumer после доказательства универсального пакета.

## Связанные задачи и история

* Закрытая NODES-009 (`9ae82ba1d`, `9c569e9c9`, `c97afabb9`) физически
  разделила `nodes`, `@nodes/layout`, HUD-free `@nodes/ui` и optional
  `@nodes/hud`, но сознательно не реализовывала adaptive socket design.
* NODES-009 сохранила один `NodeSystemDocument`, явно назвала
  `@nodes/ui/fixed-card-layout` и доказала independent core, fixed-card и
  custom-positioned bundles.
* Текущая NODES-008 исправляет spacing/compaction уже существующего fixed
  solver. NODES-010 не меняет её принятые hard laws и должна перенести их без
  регрессии в fixed policy entrypoint.
* Владелец 19 августа 2026 года подтвердил отделение Card Model от semantic
  topology и потребовал лёгкий layout playground без WebGPU для fixed,
  adaptive и экспериментальных вариантов по образцу назначения ELK Live.

## Подтверждённые факты

1. `NodeSystemNode` требует `title` и содержит `summary`, `tone`, `facts`,
   `actions`; `NodeSystemPort.parameterId` обязан ссылаться на `fact`.
2. `NodeSystemPort` уже различает capability `in | out | inout`, optional
   `left | right`, connection type и tone; message direction существует
   отдельно как `forward | reverse`.
3. `LayoutGraph` не передаёт capability или side. `layout.ts` выводит их из
   edge role, запрещает одному port быть source и target и создаёт только
   `out/EAST` и `in/WEST` ports.
4. `route-graph.ts` и его validator повторно закрепляют fixed endpoint law.
5. `LayoutWorkerRequest` напрямую связан с единственным `LayoutGraph`, а
   executor без policy boundary вызывает только `@nodes/layout.layout()`.
6. `PositionedNodeSystemPort` содержит semantic port и center, но не содержит
   выбранную layout policy side.
7. `fixed-card-layout.ts` объединяет measurement, identity mapping,
   canonicalization, row ordering, fixed endpoint enforcement, Worker вызов,
   scoring и result materialization.
8. Bundle baseline на Bun 1.3.14: core `3045/1044 gzip`, fixed-card
   `96443/30476`, custom-positioned WebGPU `258292/75090` bytes.
   Custom-positioned fixture доказывает только физическую границу Surface, а не
   существование adaptive solver.
9. После закрытия NODES-009 код `pkg/nodes` не менялся; задача начинает работу
   от `625b9dfa5eb4ac8f676f569d6b61ae64a94aa961`.

## Решения владельца

1. `NodeSystemDocument` становится минимальной semantic/topological моделью.
   Port принадлежит node, а не `fact` или другому Card element.
2. Нынешние `title`, `summary`, `tone`, `facts`, `actions` сохраняются как Card
   presentation preset/adapter в `@nodes/ui`, а не как обязательный kernel.
3. Presentation adapter связывает semantic ports с measured anchors/rows и
   передаёт layout только числовую geometry и side constraints.
4. Fixed и adaptive являются независимыми policies над одним routing core.
   Fixed закрепляет input/WEST и output/EAST; adaptive выбирает WEST/EAST для
   `inout` по geometry.
5. Edge source/target остаются стабильной topology identity и не подменяют
   socket capability либо направление живого сообщения.
6. Layout result явно возвращает resolved side каждого port; renderer её не
   угадывает и semantic port не мутируется.
7. Fixed consumer не загружает adaptive implementation, adaptive consumer не
   загружает fixed policy. Общие geometry, validation, containment, routing и
   objectives не копируются.
8. До WebGPU/product integration создаётся отдельный dev-only SVG playground
   над normalized measured input и public layout results. Он показывает fixed,
   adaptive и зарегистрированные experimental variants без собственного
   layout/routing кода.
9. Playground не экспортируется из production package, не импортирует
   `@nodes/ui`, `@nodes/hud`, `@metafor/engine`, Hamiltonian или Bulk и не
   считается WebGPU/live acceptance.
10. Card separation и playground baseline выполняются до adaptive, чтобы
    второй policy не строился вокруг старой Card anatomy.

## Целевая граница

```text
semantic NodeSystem
        ↓
presentation preset / content adapter
        ↓
measured nodes + semantic port anchors / constraints
        ↓
fixed | adaptive policy
        ↓
common placement / routing / validation
        ↓
PositionedNodeSystem with resolved port sides
        ├── SVG playground
        └── consumer Surface
```

Accepted workspace packages сохраняются. Новые algorithms подключаются
independent subpath entrypoints внутри `@nodes/layout` и `@nodes/ui`, а не новым
монолитным runtime switch и не обязательными новыми workspace packages.

## Подзадачи

| ID | Срез | Состояние |
| --- | --- | --- |
| NODES-010.1 | Закрепить semantic, Card, measured и positioned contracts | CLOSED |
| NODES-010.2 | Отделить fixed policy от общего placement/routing core | CLOSED |
| NODES-010.3 | Создать dev-only SVG playground и fixed baseline | CLOSED |
| NODES-010.4 | Реализовать bounded adaptive side-selection | CLOSED |
| NODES-010.5 | Подключить adaptive через measured и Card adapters · `/root/nodes_010_5` | IN_PROGRESS |
| NODES-010.6 | Разделить fixed/adaptive Worker и bundle entrypoints · `/root/nodes_010_6` | IN_PROGRESS |
| NODES-010.7 | Доказать adapters, performance, playground и package boundary | WAITING |

Каждый срез получает отдельный result checkpoint. `.2` и `.3` начинаются после
`.1`; `.4` зависит от `.2` и playground baseline `.3`; `.5` и `.6` независимо
зависят от `.4`; `.7` закрывает все предыдущие результаты.

## Результат NODES-010.1

* Kernel `NodeSystemDocument` больше не содержит обязательную Card anatomy:
  `title`, `summary`, `tone`, facts, actions, размеры и row anchor принадлежат
  `@nodes/ui/card-model`.
* `NodeSystemCardPresentation` связывает semantic node/edge/port с Card content
  по ID; `portId → rowId` materialization проверяет полноту и ambiguity до
  измерения.
* Общий `MeasuredNodeSystem` содержит только semantic topology, intrinsic
  размеры, content boundary и числовые `offsetY`. Card content физически не
  попадает в measured result.
* `PositionedNodeSystemPort.side` обязателен и валидируется относительно
  фактической границы ноды. Move, resize и viewport transform сохраняют
  resolved side независимо от optional semantic constraint.
* Existing fixed solver, row-order search, Worker path и renderer переведены на
  новые contracts без adaptive implementation. Все прежние focused node tests
  и новые contract regressions проходят: `96 pass`, `0 fail`, `1707 expect()`.
  Typecheck `nodes`, `@nodes/ui`, `@nodes/hud` и `bun run docs:layout` успешны.
* Root `tsc --project tsconfig.json` намеренно остаётся красным на старом
  Hamiltonian consumer: `orchestration.ts`, `layout-transition.ts`,
  `lifecycle-projection.ts` и их tests всё ещё импортируют Card fields из
  `nodes/types`, передают `parameterId` и не materialize resolved side.
  Product migration запрещена границей NODES-010 и должна быть зарегистрирована
  отдельным consumer-срезом; этот isolated package result не является live или
  visual acceptance Hamiltonian.
* Gate NODES-010.2: public `@nodes/layout` protocol и общий router пока всё ещё
  выводят `source=out/EAST`, `target=in/WEST`; следующий срез должен принимать
  уже resolved endpoints из fixed policy, не добавляя adaptive и не копируя
  placement/routing/validation core.

### Closing review NODES-010.1

Root независимо перечитал public types, Card adapter, measured validation,
fixed materialization и propagation resolved side через move/resize. Повторены
Card/model/validation/incremental/fixed/package-boundary tests: `35 pass`,
`0 fail`, `1361 expect()`. Typecheck `nodes`, `@nodes/layout`, `@nodes/ui` и
`@nodes/hud`, а также `git diff --check` успешны. Срез принят и закрыт;
consumer-adoption gate Hamiltonian остаётся вне NODES-010.1.

## Результат NODES-010.2

* Public `@nodes/layout/fixed` владеет fixed endpoint policy и предоставляет
  `layoutFixed`; root `layout` остаётся compatibility alias того же закона.
* Common `layoutResolved` получает `ResolvedLayoutGraph` с явными WEST/EAST
  sides. Placement, router и validator больше не содержат socket capability и
  выводят departure/arrival только из resolved side.
* Router доказан для WEST→EAST, EAST→WEST и одинаковых endpoint sides без
  копирования algorithm. `LayoutResult.ports[]` возвращает resolved side.
* Frozen geometry сохранилась: RIGHT
  `a44c90fd466ed57bf97ffd5d6018307b57f2f2f6118b37afbeb1dda26e3b6f41`,
  DOWN `fe8c74a324c5f3c51607aee320ba6c262168d54675221e39e20f9cbb697d5f78`.
  Fixed browser bundle — `75565/23429 gzip` bytes.

## Результат NODES-010.3

* `pkg/nodes/layout/playground` содержит private Bun/SVG tool поверх единственного
  registry import `layoutFixed` из `@nodes/layout/fixed`.
* Playground редактирует normalized JSON, показывает nodes/compound/ports,
  resolved sides, edges, bends, gateways, bounds, IDs, diagnostics и metrics,
  сравнивает frozen RIGHT/DOWN fixtures и экспортирует input/result/SVG.
* SVG/result hashes детерминированы. Boundary test доказывает отсутствие
  production export, WebGPU, Engine, UI/HUD и product imports.

### Closing review NODES-010.2–NODES-010.3

Root независимо перечитал fixed policy/core diff и playground registry/SVG,
повторил весь `pkg/nodes`: `106 pass`, `0 fail`, `1785 expect()`. Typecheck
четырёх packages и playground, TypeDoc и `git diff --check` успешны. Оба среза
приняты и закрыты; gate adaptive открыт.

## Результат NODES-010.4

* Добавлен independent public `@nodes/layout/adaptive`: measured ports задают
  capability и allowed WEST/EAST sides, а один exact port получает одну side
  для всех incident edges.
* Search использует hard budget `16`, stable semantic-ID order, deterministic
  seeds и local flips без полного `2^N`. Diagnostics фиксируют theoretical,
  generated, attempted и routable candidates, selected sides и fixed/dynamic
  counts.
* Невозможный graph возвращает typed `AdaptiveLayoutError` с code
  `NO_LEGAL_ADAPTIVE_SIDE_ASSIGNMENT` и machine-readable witness для empty
  constraints, capability-role conflict либо bounded unroutable attempts.
* Regressions доказывают geometry-dependent EAST/WEST, shared inout port,
  mixed constraints, WEST→EAST/EAST→EAST routes, capability/side independence,
  permutations/repeats и bounded `64 → 16` search.
* Playground получил одну adaptive registry entry и frozen RIGHT/DOWN matrix;
  fixed result/SVG hashes не изменились.
* Bundle evidence: fixed `75580/23707 gzip`, adaptive `81141/25581` bytes;
  implementation-specific symbols не пересекаются.

### Closing review NODES-010.4

Root перечитал adaptive normalization, capability validation, candidate queue,
common-objective comparison, typed witnesses и playground integration.
Implementation не импортирует Worker, UI или product code и не копирует
placement/router/validators. Срез принят; следующие independent gates —
presentation adapter и policy-specific Worker transport.

## Поведение процесса

Задача выполняется в worktree
`/Users/zavx0z/repozitarium/metafor-node-layot`, branch `codex/node-layot`.
Перед каждым срезом проверяются current HEAD, эта карточка, project-файлы и
owner documents. Новое требование, другой mechanism или product integration
не расширяет текущий срез и получает отдельную подзадачу либо новую задачу.

Первый срез меняет постоянные contracts и public types до code migration.
Существующий fixed behavior сохраняется через compatibility adapter только
внутри того же result; скрытый второй semantic model и временный монолитный
barrel запрещены.

## Границы

* Не менять Hamiltonian, Bulk, `pkg/visual` или Engine product behavior.
* Не переносить Card Model в kernel под новым именем.
* Не добавлять универсальный ViewModel с необязательными UI-полями без
  доказанной необходимости.
* Не добавлять runtime `policy: fixed | adaptive` в entrypoint, который
  импортирует обе implementations.
* Не копировать router, validators, objective или containment laws между
  policies.
* Не выполнять неограниченный `2^N` adaptive side search. Candidates
  группируются по exact port, детерминированно ограничиваются и проходят общий
  hard validator.
* Не считать playground SVG доказательством WebGPU либо consumer acceptance.
* Не ослаблять NODES-008 spacing, exact endpoints, compound gateways,
  determinism и routing validity.

## Критерии готовности

1. Semantic topology не требует Card fields, а Card preset сохраняет нынешнее
   отображение и связывает ports с rows через adapter-owned anchors.
2. Один semantic topology fixture совместим минимум с Card и Bare/Compact
   presentation без фиктивных facts.
3. Общий measured contract не содержит Card, DOM, text, WebGPU или product
   vocabulary.
4. Fixed public entrypoint сохраняет byte-identical geometry действующих
   regression fixtures и не содержит adaptive implementation.
5. Adaptive public entrypoint принимает `inout`, выбирает обе sides на разных
   fixtures, возвращает resolved sides и не содержит fixed policy adapter.
6. Один inout port получает одну side для всех своих edges; source/target edge
   role не меняет capability и reverse marker движется по тому же edge.
7. Common router/validator поддерживает resolved WEST/EAST endpoints без
   policy-specific branches и отбрасывает hard-invalid candidates.
8. Fixed и adaptive используют отдельные Worker executors поверх общего
   transport lifecycle; stale generation/error/dispose contracts сохраняются.
9. SVG playground запускает actual public policies, показывает nodes, ports,
   resolved sides, edges, bends, gateways, bounds, diagnostics и metrics,
   сравнивает RIGHT/DOWN и registered variants и экспортирует input/result/SVG.
10. Playground source отсутствует в production bundles и не имеет запрещённых
    imports.
11. Regression builds фиксируют raw/gzip bytes core, fixed, adaptive,
    custom-positioned и Worker consumers. Cold import/layout benchmark хранит
    input/result hashes, samples и candidate counts.
12. Package tests, TypeScript checks, TypeDoc, `git diff --check`, focused SVG
    checks и полный `bun test pkg/nodes` проходят; runtime claims делаются
    только после отдельной product проверки.

## Проверка результата

* public/package import graph и forbidden-symbol builds;
* topology/Card/measured/positioned contract tests;
* fixed frozen geometry parity;
* adaptive microfixtures, mixed fixed/adaptive и no-legal-side witness;
* repeat/permutation determinism;
* Worker structured-clone and stale generation checks для обеих policies;
* SVG structural snapshots и fixture matrix;
* final layout benchmark по правилам `@nodes/layout`;
* package/root typechecks и полный `bun test pkg/nodes`.

## Артефакты

Machine-readable benchmark, bundle measurements и принятые SVG fixtures будут
храниться в `project/artifacts/NODES-010/` до closing cleanup.
