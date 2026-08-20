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
* Achromatic correction `6ba99966c`, source-fresh Components PID `45132`,
  target `D0775…`, console `0`:
  * `components-color-compact-achromatic.png` — `320114` bytes, SHA-256
    `4cba0360b7571507ebb28e7721b8e21dbdf6ebc61171e1faa6cfdfddb3c88487`;
  * `components-color-expanded-achromatic.png` — `319978` bytes, SHA-256
    `b105bced093a18afc4a49c3e8f6280672e9d10f0cccb215773e0ecb3cb9cf583`.
  Фактическое наблюдение: vertical Value strip white→gray→black без hue tint;
  compact сохраняет popup shadow, expanded остаётся inline без него. Static
  reviewer PASS; pointer/marker и same ColorInput inside Node остаются open.

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
* Source-fresh result `d300a7719`, PIDs Elements/Components/Node
  `45117/45132/45133`, exact singleton targets, explicit reload, console `0`:
  * `components-integer-labeled-stable.png` — `267259` bytes, SHA-256
    `c93e5529e111211aaa2154b6b4a2bc6fe94720818a7db445ae3b99137131c398`;
  * `node-integer-stable.png` — `400020` bytes, SHA-256
    `2dee31a56b81c38fee0a85a0df96c40d12b97b2b258d5f9d05091853aaa55457`.
  Фактическое наблюдение: standalone один joined `Iterations | 3`; expanded
  Scalar Node показывает тот же public IntegerInput через Field. Static reviewer
  PASS; idle кадр не доказывает hover arrows/interaction matrix.

## UI-015.8.6 — Retained Integer hover RED

* Source: Components `d300a7719`, PID `45132`, target `D0775…`, route
  `/integer-input/basic/labeled`, native `1920×1088 @2`; interaction skill
  `b3234b8cd`/barrier `ac0a65e1b`.
* `integer-components-hover.plan.json` — data-only left/center/right hover plan.
* `integer-components-hover-red.png` — `267259` bytes, SHA-256
  `c93e5529e111211aaa2154b6b4a2bc6fe94720818a7db445ae3b99137131c398`.
* Ожидание: обе arrows видимы при hover; только active left/center/right zone
  меняет fill; value остаётся `3`.
* Факт: accepted PNG byte-identical idle capture, arrows отсутствуют. Exact
  encoded control bbox подтверждает pointer внутри control; это retained redraw
  RED, не coordinate/tooling failure.
* `integer-components-left-step.plan.json` и
  `integer-components-left-step.result.json` доказывают тот же hit path:
  left click `3→2`, route preserved, console `0`, focus emulation restored.
  Synthetic evidence не является owner acceptance.
* Result commit `ecb2ddbe3`, source-fresh PIDs Elements/Components/Node
  `26097/26116/26112`:
  * `integer-components-hover-left-final.png` — `268478` bytes, SHA-256
    `fa7814584fd1eb47a210b996d5d59a5ad0b0aed0880b906d7a2caf6ba6f73bce`;
  * `integer-components-hover-center-final.png` — `268409` bytes, SHA-256
    `9dbbec0270415165cf72d8710f096e3596a13978f81fc37522dca3105195e1d7`;
  * `integer-components-hover-right-final.png` — `268470` bytes, SHA-256
    `3d509b903906d8ff261b7f7f2eb8a391916deb196b801bfa4c8e1c48cd92690d`.
  Three data-only plans reload the same route independently; both arrows visible,
  only left/center/right active zone changes, value remains `3`, console `0`,
  route preserved, focus emulation restored. Independent review remains open.

## UI-015.8.7 — Integer raw accumulator RED

* `integer-components-interaction.partial.result.json` summarizes source-fresh
  standalone results on PID `26116`: left/right step `3→2/4`, plain scrub
  `3→6`, Ctrl `3→10`, Ctrl+Shift `3→4`, console `0`.
* Accepted plans/captures: `integer-components-right-step.*`,
  `integer-components-scrub.*`, `integer-components-ctrl-scrub.*`,
  `integer-components-ctrl-shift-scrub.*`; all use exact target/route and restored
  focus emulation.
  * right step — `268382` bytes, SHA-256
    `ba16b88a6618e3ed8cf6e9aa93e767582b0719554e8a02488e2c611a7434eba6`;
  * plain scrub — `268423` bytes, SHA-256
    `bad88b2c141f343baa7b64c5f4a771021759788565f88a5fbda56684f08c83c2`;
  * Ctrl scrub — `268676` bytes, SHA-256
    `c0e9a4735337b7fd532689e8ae0325e87d1a4b233e38e290dc6cb3d01c73086a`;
  * Ctrl+Shift scrub — `268319` bytes, SHA-256
    `a734f3673e14f9e6d87e45c0ef4f91c6548e0a74cc488534de252572507056e2`.
* RED: `integer-components-shift-scrub.plan.json` moves `100px` through 12
  segments but value stays `3`. Equal path must not depend on event count;
  current integer-normalized `rawCurrent` discards every sub-integer Shift delta.
  Capture `267259` bytes, SHA-256
  `c93e5529e111211aaa2154b6b4a2bc6fe94720818a7db445ae3b99137131c398`.
  Production correction UI-015.8.7 precedes remaining cancel/text/Node matrix.
* Result commit `8af8989e7`: same saved Shift plan after source-fresh Components
  PID `39609` gives `3→5`, route preserved, console `0`, focus emulation restored.
  `integer-components-shift-accumulator.result.json` records the exact result;
  updated `integer-components-shift-scrub.png` is `267207` bytes, SHA-256
  `cef91746008c7b72f2c524bda1be6f8602cb9f8311cd4b5e64db79a23c0943dc`.

## UI-015.8.8 — Focus lifecycle owner finding

* Источник: direct owner live finding after numeric interaction matrix.
* Факт: focused input keeps caret/edit state after click elsewhere; because
  numeric pointer requires `!active`, subsequent physical drag does not change
  value until internal focus clears.
* Scope: all focusable Elements, every public Component consumer and the same
  controls in expanded Node. This is a Surface focus-owner correction, not
  Integer-specific styling. Before/after interaction plans and captures are
  added only after source preparation/patch.

## UI-015.5.3 — Linked Node measurement RED

* Источник: owner live screenshot, 2026-08-20, перенесён из temporary path до
  очистки.
* Файл: `node-transform-linked-height-red.png`, `628×504`, `26380` bytes,
  SHA-256 `c13470d8b774d2e7a35430f5e155c2d5c0d56aa4083d23f9cf3d71e56506053d`.
* Ожидание: linked `Перемещение` оставляет только compact label/socket row;
  следующий `Вращение` поднимается на удалённую высоту Vector editor + gap,
  Node rect/shadow/bounds сжимаются к видимому content.
* Фактическое наблюдение: X/Y/Z скрыты, но между label `Перемещение` и
  `Вращение` остаётся большой пустой блок — measurement всё ещё резервирует
  полный grouped Vector editor. Дополнительно input labels центрированы и без
  двоеточия, а default body чрезмерно шире intrinsic editor. Это общий owner RED
  baseline для трёх раздельных corrections UI-015.5.3/.4/.5, не acceptance.
* Source-fresh results commits `9af766cec` + `914dabd7b`, Node PID `55428`,
  target `809…`, native `1920×1088 @2`, console `0`:
  * `node-transform-linked-height-after.png` — `400099` bytes, SHA-256
    `b0ca20dc7fab65fd143e93657170fddf8e98be3a1eb21be76237ff8230f3dc4b`;
  * `node-transform-rotation-linked-after.png` — `402585` bytes, SHA-256
    `c5a6f77cb1784d0ca332eb018d7e331bc7631098d34b55a12c0c13ff10e60d6e`;
  * `node-transform-translation-unlinked-after.png` — `406390` bytes,
    SHA-256
    `b12e4db6a3f1fa08f83bdbc3987df1327472222fa5d8f7a4235ef465eb4a8ce9`.
  Факт: linked editor height исчезает, более поздний purple Link заканчивается
  ровно в поднятом Rotation diamond без old-Y tail; unlinked возвращает оба
  editors/body. Independent SOURCE/INTEGRATION/STATIC VISUAL PASS; pointer hit
  moved corridor остаётся live gate, labels/default width — .5.4/.5.

## UI-015.5.4 — Side-aware Socket label result

* Source commits `16d5caa63` + `d770cf0fe`, Node PID `62982`, target `809…`,
  native `1920×1088 @2`, console `0`:
  * `node-transform-labels-linked-after.png` — `404655` bytes, SHA-256
    `7474f5ca058bf00ea7faa83df740fde2a3b94cc305d883084c334e6a01f07bcc`;
  * `node-transform-labels-unlinked-after.png` — `406370` bytes, SHA-256
    `b1c67c5e9aafd1038e0b13f1e6cb2f22aa795b2175ddc32e07d4792d1c694291`;
  * `node-transform-output-label-after.png` — `407110` bytes, SHA-256
    `ba35167ed104155b9a4aab4e12e7c9fc80c27a934c553062c5deac4e194acefe`;
  * `node-matrix-mixed-labels-after.png` — `406783` bytes, SHA-256
    `342f87bc32f057bebb7ba3edffb701e97bf5b94cd2276b1d839c38bc2b490095`.
* Факт: input `Перемещение:`/`Вращение:` left; output `Вращение` right без
  colon; mixed Matrix имеет один left property label, оба Socket и один editor.
  Socket anchors и connection-aware height/Links не меняются. Independent
  SOURCE/STATIC VISUAL PASS; default width остаётся UI-015.5.5.

## UI-015.5.5 — Default Node width final result

* Source commits `ebee0da1b` + `b11cced6a`, Node PID `70939`, target `809…`,
  native `1920×1088 @2`, console `0`:
  * `node-transform-default-width-linked-final.png` — `408426` bytes, SHA-256
    `384e2f9b517ccd4e21dfc5d909fc864c16983f0d3bb9421a208f4552902cfead`;
  * `node-transform-default-width-unlinked-final.png` — `410806` bytes,
    SHA-256
    `ecae1a488355be0887176abd3961e807f2475d7329f387fb9a46ca034b6838cc`.
* Факт: Transform initial width `166` содержит editor `146` и source inset
  `10` с каждой стороны; linked/unlinked сохраняют width, меняют только height.
  Blender default/min `140/100` разделены, explicit resize `240` сохраняется,
  fixture `310` отсутствует. Independent SOURCE/STATIC VISUAL PASS.
* Промежуточные captures с ошибочным width `162` отклонены reviewer-ом,
  удалены до result commit и не являются artifact evidence.

Automated captures prove exact canvas state, not explicit owner acceptance.
