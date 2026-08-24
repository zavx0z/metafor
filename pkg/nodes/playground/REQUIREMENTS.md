# Требования @nodes/playground

`@nodes/playground` владеет единым dev-каталогом всех production-пакетов
семейства Nodes. Production contracts остаются у своих пакетов; playground не
входит ни в один production export.

## Один каталог и один процесс

1. Всё семейство запускается одним Bun process на одном origin
   `http://127.0.0.1:4018`. Параллельные package servers и отдельные ports для
   layout или UI запрещены.
2. Главная страница `/` перечисляет каждый production-пакет, простое описание
   его ответственности, содержание playground и ссылку на package overview:
   `/core/`, `/editor/`, `/layout/`, `/layout-worker/` либо `/ui/`.
3. Каталог содержит `@nodes/core`, `@nodes/editor`, `@nodes/layout`,
   `@nodes/layout-worker` и `@nodes/ui`; скрытый package-specific стенд не
   допускается.
4. Один browser target этого origin переходит между package routes. Навигация
   не создаёт второй target или второй runtime process.
5. На каждом package overview, prefix overview и detail route видна общая
   кнопка `Home`, возвращающая на главный каталог `/`; она не рисуется отдельно
   в DOM, SVG и WebGPU consumers.

## Package routes

1. `core` показывает живой NodeTree, revisions, snapshot, ordered document и
   атомарный reconcile без layout и renderer.
2. `editor` показывает полный authoring path NodeTreeEditor → NodeTree →
   projection → NodeEditor, изменение Node/Parameter/Link и явную кнопку
   перестройки layout.
3. `layout` сохраняет независимый числовой fixed/adaptive стенд и настоящий
   DOM/SVG output без Engine, WebGPU, NodeTree или editor.
4. `layout-worker` показывает exact serializable request/result/error envelopes
   fixed и adaptive executors без UI или main-thread fallback semantics.
5. `ui` сохраняет полный каталог NodeEditor, Frame, Node, Parameter, Socket и
   Link stories. Story route получает prefix `ui/`, но story identity и lazy
   source module не меняются.
6. Sidebar `ui` сначала показывает группу `Редактор` с NodeEditor, Frame и
   Link, затем группу `Компоненты` с `Параметры` и `Сокеты` именно в таком
   порядке, после неё — `Сравнение`.
7. `Параметры` показывают все public Field kinds в порядке `text`, `number`,
   `integer`, `boolean`, `enum`, `color`, `vector`, `rotation`, `matrix`,
   `reference`, `collection`, `path`, `readonly`. Каждый Field kind имеет exact
   variants `field`, `input`, `output`, `both`, `connected`, поэтому detail
   route имеет форму `/ui/parameter/<field-kind>/<variant>`. Package overview
   использует первый detail `parameter/text/field`; старые разделы
   `parameter/composition` и `parameter/connection` не являются routes.
8. Default addresses принадлежат одному manifest и не дублируются строками в
   server, catalog и skill.
9. Каждый package mount и каждый префикс его внутреннего route является
   каноническим overview со слешем в конце. Например, `/ui/socket/` показывает
   все Socket types, `/ui/socket/boolean/` — его направления, а
   `/ui/socket/boolean/input` — один detail story. Тот же переход
   `package → component → section → detail` действует для всех package pages;
   leaf не подставляется в pathname при выборе более высокого уровня. Внутри
   Node UI overview сохраняет прежний five-panel Workbench и отображает первый
   detail descendant как preview/source state; отдельная generic overview
   Surface не заменяет NodeEditor, Socket preview или code panel.

## Структура модулей

1. Package pages находятся только в `packages/<package>/` центрального
   playground. Имя production package явно присутствует в directory и public
   module name; общие файлы вроде безымянных `client.ts`, `fixtures.ts` или
   `types.ts` вне package directory запрещены.
2. Общие catalog, route manifest и server modules не содержат NodeTree, layout
   policy, renderer или story semantics конкретного пакета.
3. Package page импортирует production только через exact public entrypoints.
   Относительный импорт обратно в production source запрещён.
4. Перенос в центральный каталог сохраняет все layout fixtures/baselines и все
   UI stories/assets/tests; централизация lifecycle не уменьшает покрытие.
5. На одном document монтируется ровно один package page. Editor и UI создают
   один UiRuntime своего canvas; DOM pages не загружают Engine/WebGPU chunks.

## Server и browser evidence

1. Все pages публикуют общий marker `nodesPlayground=ready` только после своего
   фактического первого результата. Package-specific datasets остаются
   дополнительной диагностикой.
2. Server no-HMR: после source checkpoint выполняются один restart и exact
   route reload. Он обслуживает общие font/reference assets и отдельные
   browser bundles/styles каждого package page.
3. `$nodes-dev` находится внутри `@nodes/playground`, владеет одним selector
   `nodes`, одним process и одним origin. Lifecycle-команды больше не принимают
   `--playground`.
4. Browser wrapper принимает exact `--route`, выводит package из центрального
   manifest, fail-closed отклоняет неизвестный route и canvas/touch/profile
   actions для DOM/SVG pages. Неканоническая форма overview без `/` либо leaf с
   `/` нормализуется server redirect, но не является вторым route.
5. Catalog, core, layout и layout-worker требуют route/DOM/console evidence;
   editor и UI дополнительно требуют non-black exact canvas. Layout отдельно
   доказывает наличие SVG.
