# UI-015 — Артефакты Blender-wide UI form

## elements-input-before.png

* Источник: `$ui-dev` exact background canvas, route `input/state/inactive`,
  target `E2087390E08913DD8CA4142D5D9E8C48`, pre-UI-015.2 source.
* Дата: 2026-08-20; loaded Elements PID `64668`.
* Факт: story args radius `28`, production preview `460×50`, full pill
  silhouette; console `0`, native `1920×1088 @2`.
* Контрольная сумма: SHA-256
  `aa7ac15f3b3746864271ec2e07ad9b4f06a85aaebed497e432db58cfdac405d3`.

## elements-input-after.png

* Источник: тот же `$ui-dev` target/route после UI-015.2 `e6f7669bf`.
* Дата: 2026-08-20; loaded Elements PID `66578`.
* Ожидание: equal-scale production input `146×22`, radius `3`, border `1`,
  font `11`, прежняя MetaFor palette; Workbench shell пока не меняется.
* Фактическое наблюдение: ожидание совпало; story args radius `3`, console `0`,
  non-black canvas `495019` bytes, native restored. Визуальная форма приблизилась
  к Blender scalar reference `146×23`; owner acceptance остаётся отдельной.
* Контрольная сумма: SHA-256
  `6445146ec6b852767e159d9a62aff25f2c274fe816222c567b9e7fe563f8ebd5`.

## UI-015.3/.4 — scalar Field и раскрывающийся select

* Reference: Blender catalog commit `62bf479`,
  `node-types_ShaderNodeValue.webp` и
  `node-types_GeometryNodeMenuSwitch.webp`.
* Source: `813f48994`, dropdown correction `ea1af7aa5`, Button ownership
  correction `9365d9af0`.
* Live: `$ui-dev` Elements PID `85299`, target
  `E2087390E08913DD8CA4142D5D9E8C48`; Components PID `85298`, target
  `D0775AE44CFF0E299A0C28EECB3872D2`. Native `1920×1088 @2`, canvas
  `3840×2176`, console `0` на всех routes.
* Факт: scalar Field стал одной row label+control; closed select `146×22`,
  radius `4`, label слева и chevron справа; open popup имеет ту же ширину,
  плоские `22`-unit rows, одну внешнюю тихую границу, selected/disabled state.
  MetaFor palette/font сохранены. Actual retained pointer tests проверяют выбор,
  закрытие после choice/reclick и два последовательных Button press/release без
  geometry shift или timer state.
* Captures:
  * `components-scalar-before.png` — `584763` bytes, SHA-256
    `9fca0f90af997c88cebb68e270cedbaeefa047b2252b3b976059274f3d796217`;
  * `components-scalar-final.png` — `451284` bytes, SHA-256
    `f93d2f24e1d0cee4be1fce9bbf218aaf9aa51aa383ff9ee45afe57c28a610eb0`;
  * `components-enum-final.png` — `458741` bytes, SHA-256
    `ab959a0df1b59cd0836ca68d3ea1d5249d671cebb9552e566f469425410065e8`;
  * `elements-select-closed-final.png` — `422763` bytes, SHA-256
    `3ba81a77e10586f4bd2a5cf99b6809519fc434ccfd470973ca46c070c079cdaf`;
  * `elements-select-open-final.png` — `429178` bytes, SHA-256
    `6b23ca4e3e55117cc4a4a53e16542f425bfa752cb3372a3f3ad8eaabe4623a8c`.

## UI-015.6 — compact Workbench chrome

* Owner screenshot `owner-workbench-override.png` зафиксировал конфликт:
  production button radius `4`, но shell явно передавал `999/12/34/36`.
  Файл `733495` bytes, SHA-256
  `4446599137e33ad742d6db76268f9109618663b5c61e71d65937857cbd6722b2`.
* Source: `cd85f9614`. Shared shell и три package preview используют один owner:
  radius `4`, panel/header/row/dock `24`, control `22`, separators `1`, tight
  padding `3/6`, idle `borderRule`; active/focus остаются material states.
* Before/after exact Elements route `button/state/default`:
  * `workbench-button-before.png` — `491056` bytes, SHA-256
    `0df6cbafaced5e4c367513912db35805c9bc978422716389bbe4316afae46f0f`;
  * `workbench-button-after.png` — `389564` bytes, SHA-256
    `29b28654d474b3b9d6e79febcb41add45f689c659157af398921da776169cf81`.
* Node regression: PID `84906`, target `809BF08D88E4582CA819EFE847FE1450`,
  route `node-editor/scene/default`, console `0`; production Node scene preserved
  under compact shell. `node-workbench-final.png` — `450640` bytes, SHA-256
  `1877f9ddcdd9ed401bf29df411bc64c2e9efb12675a07b3358a742f296abd316`.

## UI-015.6.1 — Workbench hierarchy RED baseline

* Источник: owner live screenshot, 2026-08-20; исходный temporary path перенесён
  в устойчивый artifact до очистки.
* Файл: `workbench-hierarchy-before.png`, `430×994`, `46926` bytes, SHA-256
  `c7f1a4dc5d16b108f90e270dc2723d4c2aaddd1bad78d8d5743866d2fde52132`.
* Наблюдение: expanded branches получают selected blue fill; branch/leaf labels
  centered, disclosure встроен в text, indent отсутствует, каждая row является
  отдельным rounded island. Это RED baseline, не acceptance UI-015.6.
* Primary owner reference: `workbench-accordion-reference.png`, `598×1100`,
  `293480` bytes, SHA-256
  `4bc3c4bde84a06c178ccc6a4ece645dc793309afab90af61900c1c31e5755e45`.
  Кадр задаёт Blender Properties/Preferences accordion: disclosure header и
  expanded section content. Outliner не является visual owner этого sidebar.
* Rejected intermediate: `workbench-accordion-intermediate-red.png`, `752×554`,
  `24623` bytes, SHA-256
  `93999f8291ed237a8f110e1e0f1e65958e7b5460f56ca1e4cbc63176cd95f758`.
  Незакоммиченный patch убрал cards, но оставил чрезмерно разреженный flat list
  без читаемой section composition; это не source result.
* Owner side-by-side current: `workbench-accordion-current-red.png`, `426×512`,
  `22005` bytes, SHA-256
  `3fa7055b48a5f9945ace7830ddd88417e98df29cfe81ac61a782bf6d7494aa92`.
* Exact target crop: `workbench-accordion-blender-target.png`, `604×632`,
  `147597` bytes, SHA-256
  `fe7aedff255eecdc578608ecc70acb54fe61ec5e1b6069a15fea5e4335b0e890`.
  Target требует medium-gray panel headers, compact gaps, no bright expanded
  outline и точный typography/padding rhythm.
* Secondary regression: `workbench-secondary-navigation-red.png`, `352×758`,
  `22402` bytes, SHA-256
  `49dee2c02273289a1adff2acf7ea97f73c09dca638adb87ebc52069c5ebcee70`.
  Ungrouped `Поле` ошибочно получил global left tree layout; он обязан остаться
  самостоятельным selection list без disclosure/indent.
* Stable material target: `workbench-accordion-card-target.png`, `604×662`,
  `150499` bytes, SHA-256
  `86135f9914f74967afc1949b44bf09eb5da5558e88057d9bf7da48bebdf518c9`.
* Stable current RED: `workbench-accordion-material-focus-red.png`, `422×192`,
  `8688` bytes, SHA-256
  `ac03bb67d9a1fe615bcbbdc99a4312c097bff0ad672edafbcf006213e7fb69e6`.
  Outer region/card use one #3d role so cards disappear; `Данные` receives a
  text-white focus outline. Workbench sections are non-reorderable, so no grip
  is expected or rendered.

## UI-015.7.5 — Node Select overlay RED baseline

* Источник: owner live screenshot, 2026-08-20.
* Файл: `node-select-overlay-before.png`, `712×786`, `58541` bytes, SHA-256
  `94f9696d1148ba8e156a421f40394d82f0250867abdb50e7531e0ea3c741903c`.
* Наблюдение: раскрытый Select menu остаётся ordinary retained sibling;
  последующие Parameter labels/controls рисуются поверх popup. Это layering RED,
  а не palette defect; acceptance ждёт generic overlay portal UI-015.7.5.
* Exact Blender composition reference: `blender-select-header-icons-reference.png`,
  `350×446`, `111178` bytes, SHA-256
  `2ec224eb1bb3a9f946193eb01a45ed1942c867ec5a2082e42466fb96011f03ba`.
  Кадр доказывает non-interactive title `Mode`, separator, selected trigger icon
  и shared option icon column; title не является fake option. Header belongs to
  base text-only Select, icon composition/alignment — Components EnumInput.

## UI-015.7.3 — Vector grouped live RED

* Источник: owner live screenshot во время grouped-cell patch, 2026-08-20.
* Файл: `components-vector-grouped-red.png`, `3840×2400`, `473080` bytes,
  SHA-256 `6823c8926f35ad10101d3211ea6b5c38f3bb9d69c78e85a6dfc7f9821e004464`.
* Route: `/field/vector/default`; expected intrinsic control `146×66`.
* Наблюдение: preview показывает сплошную белую plane без X/Y/Z/value; blue
  `XYZ` снизу является variant dock, не control. Кадр предшествует clean reload
  final commit `f1a6a75c1` и поэтому является RED baseline, а не verdict commit.
* Clean after: `components-vector-grouped-after.png`, `3840×2176`, `274224`
  bytes, SHA-256
  `2bc4507eee93fba3b383210b71575027eefeb468a92791ac6ce2ca0136ce3ec6`.
  Components PID `79977`, target `D0775AE44CFF0E299A0C28EECB3872D2`, same
  route, native `1920×1088 @2`, console `0`. X/Y/Z `1/2/3` видимы, white plane
  отсутствует; pointer/owner gates остаются открытыми.

## UI-015.5.2 — Rotation alignment RED

* Источник: owner live screenshot, 2026-08-20.
* Файл: `components-rotation-alignment-red.png`, `624×214`, `13503` bytes,
  SHA-256 `d0c6f7a83497846a21ca9890732304c08cb90f0c3cc4d4911583c89d4dfc41cc`.
* Exact reference:
  `blender-node-catalog/assets/manual/4.5/node-types_FunctionNodeInputRotation.webp`.
* Наблюдение: unit приклеен к axes `X°/Y°/Z°`, values left-aligned с большим
  пустым правым пространством. Target: axes X/Y/Z, values `0°/45°/90°` по общей
  правой кромке, source-backed number text и доказанные Node margins.
* Socket placement references: `GeometryNodeTransform.webp`,
  `FunctionNodeCombineTransform.webp`, `FunctionNodeRotationToQuaternion.webp`
  и `FunctionNodeInputRotation.webp`. Закон: отдельная top label row, Socket
  center на её середине; X/Y/Z editor ниже.

## UI-015.5.2 — Vector numeric alignment RED

* Файл: `components-vector-alignment-red.png`, `468×318`, `11182` bytes,
  SHA-256 `9232b23e3371de9827cfb5780a0108e0f1300b35dab9de9dba56fd30c204ed79`.
* Exact reference: `node-types_FunctionNodeInputVector.webp`.
* Наблюдение: axes/value pinned left, values `1/2/3` без Blender default three
  decimals и общей правой кромки. Target: centered axis column + right-aligned
  `1.000/2.000/3.000`, same numeric origin for caret/selection/pointer.
* Stable after `components-vector-aligned-stable.png` — `283904` bytes,
  SHA-256 `ce1f9c8f06b989b7058fc3e19b7782811fd4f620604fc237cd63f475c77b6278`.
  PID `31534`, target `D0775…`, route `/field/vector/default`, console `0`.
* Node after `node-rotation-aligned-stable.png` — `397233` bytes, SHA-256
  `9b97ec76ccfdd314248c19be0125cea8b20f7f26dd4ca48f74ade84f1d783a0e`.
  PID `31535`, target `809…`, route `/node-editor/scene/default`, console `0`;
  label row/Socket above intrinsic Rotation editor.

## UI-015.7.4 — Color material stable evidence

* `components-color-compact-stable.png` — `318302` bytes, SHA-256
  `ba2012a79e4b8d1b25c24e26888470f06a5925ac43429b1b7286dd31a8a8805c`.
* `components-color-expanded-stable.png` — `318270` bytes, SHA-256
  `7b465f4a02ea1000dacfc382b52eecaf62abf6b1d1db79206fc0a7e35bbb60d6`.
* Components PID `31534`, target `D0775…`, console `0`. Compact имеет menu
  shadow/source cursor contrast; expanded inline — без popup shadow.

## UI-015.2.1 — Button size RED baseline

* Источник: owner live screenshot, route `/button/sizes/large`, 2026-08-20.
* Файл: `components-button-size-red.png`, `3840×2400`, `461848` bytes,
  SHA-256 `7b6ad529b6bd1d61b5ff2a26df7e327c3a0e02ff2b513965de272eef8685dd08`.
* Наблюдение: `size:"large"` увеличивает text, но visible Button остаётся
  fixed `22h`; small/medium/large не образуют разные silhouettes. Это public
  geometry RED, не допустимая Blender divergence.
* Stable after PIDs/target: Components `19627`, target `D0775…`, console `0`:
  * `components-button-small-stable.png` — `267773` bytes, SHA-256
    `e830f3c2c2a8400c56eb9d00cbcffe24bd37125d6d3062fc92989b6f0e41b0da`;
  * `components-button-medium-stable.png` — `267430` bytes, SHA-256
    `e6c139edd31eac22aad3f86d819215836fbcba05a0c969c9d897a72dda2a6144`;
  * `components-button-large-stable.png` — `267873` bytes, SHA-256
    `f50f0c82f8e2a63c6dd30380bb1659c68e864ae8028f7eee9896249103d0a34f`.

## UI-015.7.5 — Stable Select/portal evidence

* Elements `elements-select-header-stable.png` — `282516` bytes, SHA-256
  `ead118452f0abbee23c86521a7250aeb27ac5640a96bcbdae7f1f5ccb5f61ee5`.
* Node `node-select-overlay-stable.png` — `396162` bytes, SHA-256
  `1eb653c5c5790ca8f2687cdc9f04c41ab3bd9d71e3a80a99f5508dd2adeb4abf`.
* Stable commit `4ae3175be`, PIDs Elements/Node `19628/19629`, exact targets,
  console `0`. Header/separator видимы; Node popup перекрывает later rows;
  accordion cards имеют distinct region/card roles. Interaction/owner gates open.

## UI-015.8.5 — IntegerInput reference

* `blender-labeled-number-reference.png`, `496×106`, `33599` bytes, SHA-256
  `a8cc1077b898aaf06299fb40369b0237defa2fa9a27b8a2125867b3bc5740558`.
* Наблюдение: one INT button, label `Iterations`, right value `3`, side
  arrows/zone behavior. Owner mapping: public IntegerInput canonical INT;
  NumberInput остаётся FLOAT, implementation engine shared.

Automated captures prove exact canvas state, not explicit owner acceptance.
