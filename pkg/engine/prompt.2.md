# MetaFor Display Layers — Space + HUD в одном WebGPU canvas

## Контекст

Проект: `zavx0z/metafor`, ветка `arch`.

Нужно не добавлять “режимы отображения”, а правильно оформить архитектуру **слоёв отображения** внутри одного WebGPU
canvas.

Правильная модель:

```txt
ONE CANVAS / ONE FRAME
━━━━━━━━━━━━━━━━━━━━━━
1. Space layer — мир, сцена, объекты, граф, пространство
2. HUD layer   — фиксированный дисплей перед камерой / перед лицом
━━━━━━━━━━━━━━━━━━━━━━
````

HUD — это не DOM поверх canvas, не native overlay, не iframe, не CSS-панель и не отдельный canvas.

HUD должен быть частью WebGPU-рендера и работать в том же canvas, что и пространство.

Ментальная модель:

```txt
[камера / глаза / XR headset]
        ↓
[HUD: дашборд, статусы, команды, подсказки]
        ↓
[SPACE: мир, сцена, граф, объекты]
```

То есть:

```txt
SPACE = то, куда мы смотрим
HUD   = то, через что мы смотрим
```

## Важное уточнение

Это НЕ:

```ts
mode = "hud" | "space"
```

Это:

```ts
frame = space + hud
```

HUD и Space существуют одновременно.

Space находится “за” камерой в world-space.

HUD находится “перед” камерой в camera/head-space и всегда остаётся перед лицом.

Для desktop это HUD перед обычной камерой.

Для будущего XR это HUD перед head pose / HMD, рендерящийся для каждого глаза, но с той же логикой слоя.

## Что уже есть в проекте

Перед изменениями обязательно изучи:

* `AGENT.md`
* `pkg/engine/src/renderer/index.ts`
* `pkg/engine/src/core/ViewPoint.ts`
* `pkg/engine/src/ui/UIDisplay.ts`
* `pkg/engine/src/scenes/Scene.ts`
* `pkg/engine/src/core/Object3D.ts`
* `pkg/engine/src/index.ts`
* при необходимости `bulk/web/index.ts`
* при необходимости roadmap-файлы в `pkg/engine/roadmap/`

Особенно проверь:

1. В `Renderer` уже есть единый WebGPU canvas.
2. В `Renderer` уже есть `collectSceneObjectsByType`, где объекты делятся на `glassObjects`, `regularObjects`,
   `uiObjects`.
3. В `UIDisplay` уже есть идея физического UI-дисплея.
4. В `ViewPoint` уже есть `viewMatrix`, `projectionMatrix`, `position`, `target`, управление камерой.
5. В правилах проекта указано, что единица мира — миллиметры. Проверь `UIDisplay`, потому что там в комментариях может
   быть терминология “метры”. Не вводи новый конфликт единиц. Новый HUD API должен быть в mm или явно согласован с
   контрактом движка.

## Цель

Сделать минимальную, аккуратную архитектурную основу для двух слоёв отображения в одном WebGPU canvas:

```txt
SpaceLayer
HudLayer
DisplayFrame / RenderFrame
```

Нужно, чтобы движок умел рендерить кадр так:

```txt
1. clear canvas
2. render Space layer через обычный ViewPoint / world camera
3. render HUD layer поверх Space
   - без очистки color
   - без зависимости от world depth
   - alpha blend включён
   - HUD всегда перед камерой
4. submit frame
```

## Нельзя делать

Не делать отдельный DOM HUD поверх canvas.

Не делать второй canvas.

Не делать iframe.

Не делать CSS overlay как архитектурное решение.

Не превращать это в переключатель режимов `hud | space`.

Не ломать существующий публичный API `renderer.render(scene, viewPoint)`, если он уже используется. Сохрани обратную
совместимость, а новый API добавь рядом.

Не переписывать весь renderer без необходимости.

Не смешивать HUD с обычными world-space объектами так, чтобы он зависел от глубины пространства.

Не менять терминологию проекта без необходимости.

## Предлагаемая архитектура

Добавить в `pkg/engine` минимальные типы/классы.

Вариант структуры, но сначала проверь текущий стиль проекта:

```txt
pkg/engine/src/display/
  DisplayLayer.ts
  SpaceLayer.ts
  HudLayer.ts
  DisplayFrame.ts
```

или, если в проекте нет отдельного `display`, подобрать более естественное место внутри `pkg/engine/src`.

Базовая идея:

```ts
export type DisplayLayerKind = "space" | "hud"

export interface DisplayLayer {
  readonly kind: DisplayLayerKind
  readonly scene: Scene
  readonly renderOrder: number
}

export class SpaceLayer implements DisplayLayer {
  readonly kind = "space"
  readonly scene: Scene
  readonly renderOrder = 0
}

export class HudLayer implements DisplayLayer {
  readonly kind = "hud"
  readonly scene: Scene
  readonly renderOrder = 1000
}
```

Для HUD нужен head/camera-locked root.

Идея:

```ts
export interface HudLayerOptions {
  distanceMm: number
  widthMm: number
  heightMm: number
  pixelWidth: number
  pixelHeight: number
}
```

HUD должен быть размещён не в мировых координатах, а относительно текущего `ViewPoint`.

На каждом кадре HUD должен обновлять transform так, чтобы находиться перед камерой.

Не делай это грубо через фиксированный `z`, потому что в движке Z-up, RH, а камера смотрит на target. Нужно вычислять
направление взгляда из `ViewPoint.position` и `ViewPoint.getTarget()` либо аккуратно добавить метод в `ViewPoint`, если
его не хватает.

Пример намерения:

```ts
const forward = normalize(target - cameraPosition)
const hudCenter = cameraPosition + forward * distanceMm
```

Ориентация HUD должна смотреть на камеру или быть выровнена по camera basis. Проверь существующие math-классы (
`Vector3`, `Quaternion`, `Matrix4`) и сделай минимально правильно.

## Renderer API

Добавить новый API, например:

```ts
renderer.renderFrame({
  space,
  hud,
  viewPoint,
})
```

или:

```ts
renderer.renderLayers([spaceLayer, hudLayer], viewPoint)
```

Выбери вариант, который лучше ложится на текущий стиль.

Старый метод оставить:

```ts
renderer.render(scene, viewPoint)
```

Он может внутри вызывать новый API как один `SpaceLayer`, чтобы не ломать существующие места.

## Render pass logic

Сейчас `Renderer.render(scene, viewPoint)` рендерит сцену одним итоговым проходом и отдельно сортирует `regularObjects`,
`glassObjects`, `uiObjects`.

Нужно аккуратно подготовить архитектуру, где:

### Space pass

* использует обычные `viewPoint.viewMatrix` и `viewPoint.projectionMatrix`;
* очищает color/depth;
* рендерит обычный мир;
* работает как сейчас.

### HUD pass

* рисуется после Space;
* не очищает color;
* не должен пропадать из-за depth мира;
* depth для HUD либо отключается, либо используется отдельная depth-текстура/clear depth перед HUD-pass;
* HUD должен быть поверх, но с alpha blend;
* HUD-объекты должны проходить через те же GPU pipelines, насколько возможно.

Минимальный допустимый первый этап:

1. Ввести слои.
2. Оставить Space render как основной.
3. Добавить HUD scene, которая рендерится после Space.
4. Для HUD временно использовать отдельный pass descriptor с `loadOp: "load"` для color и отдельной/очищенной
   depth-логикой.
5. Сохранить визуальный результат старого render.

## UIDisplay

Проверь `pkg/engine/src/ui/UIDisplay.ts`.

Сейчас он концептуально очень близок к HUD-дисплею.

Нужно не выкидывать его, а использовать или подготовить к использованию как содержимое `HudLayer`.

Проверь проблему единиц:

* контракт движка: 1 world unit = 1 mm;
* в `UIDisplay` комментарии могут говорить про “метры”;
* новый HUD API должен не усугублять конфликт.

Лучше в новом API явно использовать `widthMm`, `heightMm`, `distanceMm`.

Если нужно, добавь TODO/комментарий или мягкую миграцию для `UIDisplay`, но не делай большой breaking rename без
необходимости.

## XR-подготовка

Сейчас не нужно делать полноценный WebXR.

Но архитектура должна быть совместима с XR.

Заложи это в названия и комментарии:

```txt
HUD is camera/head locked.
Desktop ViewPoint is the first implementation.
XR head pose can later provide the same camera/head transform.
```

Не надо импортировать WebXR API, если оно сейчас не используется.

Не надо делать XR runtime.

Нужно только не закрыть путь к XR.

## Документация

Добавить короткий архитектурный документ, например:

```txt
pkg/engine/docs/display-layers.md
```

или подходящее место в текущей структуре.

В документе объяснить:

```txt
Space layer:
- world-space
- обычная сцена
- зависит от камеры

HUD layer:
- camera/head-space
- всегда перед камерой
- рендерится после space
- в том же canvas
- готов к XR
```

Обязательно подчеркнуть:

```txt
HUD/Space are display layers, not modes.
```

## Тест / пример

Добавить минимальный пример или тест там, где это принято в проекте.

Цель примера:

* создать обычную space scene;
* создать hud scene / hud layer;
* добавить простой HUD display / panel / rectangle / text;
* убедиться, что renderer может рендерить один frame с двумя слоями;
* старый `renderer.render(scene, viewPoint)` продолжает работать.

Если нет удобной инфраструктуры для визуального теста, добавь минимальный compile/type-level тест и пример кода.

## Проверки

После изменений выполнить минимально релевантные проверки:

```bash
bun run build
```

Если полный build слишком тяжёлый или падает по нерелевантным причинам, выполнить более узкую проверку для `pkg/engine`
и явно описать, что именно проверено.

Также проверь TypeScript-ошибки в изменённых файлах.

## Ожидаемый результат

После задачи в проекте должна появиться понятная основа:

```txt
Renderer
  └── renderFrame / renderLayers
        ├── SpaceLayer
        └── HudLayer

SpaceLayer
  └── world scene

HudLayer
  └── camera/head locked scene
        └── UIDisplay / HUD objects
```

Главный критерий:

HUD и Space не являются режимами.

Они одновременно рендерятся в одном canvas.

HUD всегда перед камерой.

Space остаётся пространством за ним.

Архитектура должна быть минимальной, не ломать текущий renderer и не превращаться в большой переписанный движок.
