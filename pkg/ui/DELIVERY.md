# Production delivery WebGPU UI

Этот документ владеет только поставкой production-модулей `@metafor/engine`,
`@ui/elements`, `@ui/components` и `@nodes/ui`. Семантика и visual contracts
остаются у документов соответствующих packages, а dev Workbench принадлежит
`@ui/playground` и не входит product bundle.

## Зависимости и identity

1. Единственное направление зависимостей:
   `Engine → Elements → Components → Node UI`. Нижний слой не импортирует
   верхний, а production source не импортирует playground.
2. `@metafor/engine` является одной канонической module identity внутри одного
   product/release graph. Разные aliases, URL либо revisions одного Engine не
   считаются общим модулем и запрещены внутри одного воплощения продукта.
3. Product bootstrap создаёт один `UiRuntime` на canvas/scene и владеет его
   lifecycle. Динамически загруженный модуль не создаёт runtime и не хранит
   глобальный runtime singleton.
4. Function-based Element либо Component получает уже подключённую `UiSurface`.
   Surface-component создаётся как обычный объект и подключается владельцем
   продукта через `runtime.addSurface()`, который передаёт runtime вызовом
   `surface.attachCanvas()`.

## Public ESM imports

1. Root package imports сохраняют полный совместимый API для статических
   consumers. Независимый consumer использует exact subpath import и не начинает
   свой graph с общего barrel.
2. Elements публикует runtime/surface, layout/theme и exact primitive subpaths.
   Components публикует по одному lowercase subpath на production component.
   Node UI сохраняет независимые `node-editor`, `blender-node` и `link-curve`.
3. Subpath указывает прямо на единственный production source owner. Alias на
   тот же leaf, generated copy, compatibility bundle и export playground source
   запрещены.
4. `@ui/playground` является только dev dependency package consumers. Story,
   fixture, route и shell symbols не входят production exports.

## Dynamic loading и shared code

1. Динамическая загрузка выполняется стандартным `import()` exact public
   specifier. Повторный import того же specifier/revision использует стандартный
   module cache среды исполнения.
2. Product/release build получает все используемые entrypoints одним ESM module
   graph и включает code splitting. Engine, UiRuntime, Elements и реально общие
   зависимости Components материализуются в shared chunks и встречаются в
   output graph ровно один раз.
3. Собирать каждый Button, Field либо NodeEditor отдельным self-contained bundle
   со своей копией Engine/Elements запрещено. Если packages доставляются уже
   собранными независимо, их общие dependencies остаются external и разрешаются
   в один канонический URL/revision владельцем product loader.
4. Leaf chunk содержит только leaf implementation и imports shared chunks.
   Загрузка leaf не создаёт второй scene graph, renderer, geometry cache либо
   input runtime.
5. Dev Workbench может хранить metadata eager и вызывать lazy factory, но factory
   обязана импортировать эти production subpaths. Workbench не переопределяет
   production specifier, chunk boundary или runtime ownership.

## Проверка

Production boundary считается доказанной только вместе:

* manifest target существует и не указывает в playground;
* representative exact imports typecheck/build independently;
* product fixture содержит настоящий dynamic `import()`;
* split output имеет отдельные leaf entry/chunks и единственную реализацию
  Engine/UiRuntime во всём graph;
* bootstrap является единственным местом создания `UiRuntime`;
* сумма split graph существенно меньше суммы отдельных self-contained builds.
