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
* Live pointer result, Components PID `53649`, target `D0775…`, route
  `/color-input/state/open`, console `0`:
  * `color-components-wheel-drag.png` — marker moved to magenta, owner RGBA
    `{0.92,0.330777…,0.822902…,0.72}`, `321979` bytes, SHA-256
    `6baaecdffa683788efc80a82488471b655b0c965aeeea00a5662978845191ca2`;
  * `color-components-value-drag.png` — achromatic indicator moved down and
    value darkened to `{0.120714…,0.043401…,0.107973…,0.72}`, `317968` bytes,
    SHA-256
    `ce5c85ed937ae85aa067ca9dc7a3650b28e6144cb23fc7c97a99537b465329d2`.
  Popup stays open; route and focus-emulation restoration are preserved.

## UI-015.5.3 — Moved Link live pointer result

* Source-fresh Node PID `53620`, target `809…`, route
  `/node-editor/scene/rotation-linked`, native `1920×1088 @2`, console `0`.
* `node-moved-link-select.plan.json` clicks CSS point `(704,374)` on the raised
  orthogonal corridor. DOM publishes `selectedKind=link` and exact
  `selectedId=scalar-transform-rotation`.
* `node-moved-link-selected.png` visibly shows the selected purple path ending
  at the raised Rotation diamond; `406676` bytes, SHA-256
  `9f3f00ee8b7b7977fc8ece5067f6e3e404e8bdbef73f7fe14a5336e2a15d1c67`.
* Machine-readable Color/Link result: `interaction-tail.result.json`.

## UI-015.9.2 — ColorInput inside expanded Node

* Source commit `4f9f0da31`, source-fresh Node PID `59195`, target `809…`,
  route `/node-editor/scene/color-unlinked`, native `1920×1088 @2`, console `0`.
  The route removes only exact `transform-shader` and targets existing `shader`.
* `color-node-open.png` — same compact popup is above later Node rows, `439783`
  bytes, SHA-256
  `ec10b24939e483549959affc70090b10684372e4e228746992c07619b3257e45`.
* `color-node-wheel-value-drag.png` — markers move and controlled
  `shader/base-color` becomes `{0.88,0.086881938…,0.724549043…,1}`, `439754`
  bytes, SHA-256
  `331599bdbad85dca5bfdaf1730f28282d0f8bc43cfa5cf1a126ac2b740787f0d`.
* `color-node-escape-closed.png` — Escape closes popup while preserving new
  swatch, `409745` bytes, SHA-256
  `b67779602364761f0e9ede00a137c0e4df0b2922a33c306a22e174cba93566ab`.
* `color-node-outside-closed.png` — outside click closes original-value popup,
  `409876` bytes, SHA-256
  `1b407e65a8c9464a390605ca1fb3a45aeb02751cdb1b8b2329d142b49f134257`.
* First outside attempt was rejected before capture because its page barrier
  received zero rAF. Health/log/console stayed green; after explicit reload the
  same plan passed. Rejected output did not enter evidence.
* Machine-readable result: `color-node.result.json`.

## UI-015.9.3 — Complete Node Field inventory

* Source commit `b066077f9`, source-fresh Node PID `65875`, target `809…`,
  route `/node-editor/scene/inventory`, native `1920×1088 @2`, console `0`.
  `FIELD_KINDS` is complete through public Fields; renderer contains no local
  Path/Reference/Collection controls.
* `inventory-node-path.png` — controlled text becomes `/cache/test.exr`, then
  folder action publishes `browse`; `425851` bytes, SHA-256
  `ba2fb66f7e6c55f01f685e81cf407d9367852df9cdeee05cbef026c721841b9d`.
* `inventory-node-reference.png` — main/picker/clear publish
  `activate→pick→clear`; value becomes `null`, clear cell disappears while
  picker remains; `422041` bytes, SHA-256
  `3c56fa11cf62cf91a37a2b5bf210308bf3bfc962d9d6ed3512925600cfe5f223`.
* `inventory-node-collection.png` — Cube select, add action, move-up and remove
  publish exact actions; final items `[Suzanne]`, selected `null`; `426596`
  bytes, SHA-256
  `a83509b595c1ae3afdaa81cbbffb089697f57dd605f9140005755625f51bcf7b`.
* Every plan preserves route and focus emulation and reports console `0`.
  Tooltips in captures are real hovered action evidence, not permanent labels.
* Machine-readable result: `node-field-inventory.result.json`.

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
* Result commit `97acb6843`, source-fresh PIDs Elements/Components/Node
  `43008/43199/43191`, native `1920×1088 @2`, console `0`.
* `integer-focus-lifecycle.result.json` records:
  * focus→empty→drag right `3→6` and left `3→0`;
  * typed `12` committed by outside click;
  * disabled/readOnly remained `3`;
  * route preserved and focus emulation restored.
* Standalone captures/plans:
  `integer-components-editing`, `integer-components-focus-blur-drag-right`,
  `integer-components-focus-blur-drag-left`,
  `integer-components-edit-outside-commit`, `integer-components-disabled-live`,
  `integer-components-readonly-live`. Independent focus primitive SOURCE PASS
  and standalone Integer LIVE PASS. Escape/right cancel and broad focus matrix
  remain open.

## UI-015.9.1 — Node controlled Field owner RED

* Exact source-fresh plans/captures:
  `integer-node-focus-blur-drag-right.*` and
  `integer-node-focus-blur-drag-left.*`, Node PID `43191`, target `809…`, route
  `/node-editor/scene/default`, same DPR, console `0`.
* Факт: focus release works and arrows render, but both PNGs are byte-identical
  SHA-256 `264445f0b8bd7cbfe9c901094fd214cfacaa11c03dc71d1e251daf575a1ed657`,
  `409180` bytes; visible value stays `3` in both directions.
* Причина: Node story creates static Field values without `onChange`. This is a
  controlled-story owner RED, not Components/Integer/focus failure.
* Result commit `dfd3a1bc1`: dev-only owner now publishes actual immutable
  `nodeFieldValues`; source-fresh right/left plans produce `iterations=6/0`,
  route preserved and console `0`.

## UI-015.8.9 — Controlled numeric display RED

* Источник: continuation of exact UI-015.9.1 Node plans after controlled story
  owner commit `dfd3a1bc1`, Node PID `50416`, target `809…`, route
  `/node-editor/scene/default`, native `1920×1088 @2`.
* DOM fact: right/left runs publish owner values `6/0` in
  `nodeFieldValues["scalar/iterations"]`.
* Canvas fact: `integer-node-focus-blur-drag-right.png` and
  `integer-node-focus-blur-drag-left.png` remain byte-identical, `409535` bytes,
  SHA-256 `1abac8edcf76ca79cd770b960d8baecbf541549d134f96d82105f380a1b622fa`;
  both visibly render `3`.
* Standalone corroboration: `integer-components-scrub.png` shows story/source
  owner value `6`, while the actual labeled control still renders `3`.
* Cause: NumberInput passes editing through `onSubmit`; Elements Input infers
  controlled mode only from `onChange`, retains the original string buffer and
  ignores later owner value while inactive. This is a generic Input/NumberInput
  contract defect, not a Node renderer or retained redraw workaround.
* Machine-readable summary: `integer-controlled-display-red.result.json`.
* Result commit `ed8946645`, source-fresh PIDs Elements/Components/Node
  `53618/53649/53620`: standalone and Node right/left canvases now visibly show
  distinct `6/0`, match DOM owner values, preserve routes and report console
  `0`. Machine-readable result: `integer-controlled-display.result.json`.

## UI-015.8.8 — Broad focus/cancel live result

* Escape and right-click plans both restore Integer origin `3`, release pressed
  state and produce identical neutral-hover PNG SHA-256
  `9dbbec0270415165cf72d8710f096e3596a13978f81fc37522dca3105195e1d7`.
* `focus-components-text-outside.*`: TextField owner changes
  `Компонент UI→Тест` and outside click leaves no edit caret; PNG `254880`
  bytes, SHA-256
  `621204ec3310ab68a246156ad962a39c2a3a5e997a15cfe69618ef3c934ecc61`.
* `focus-components-vector-sibling.*`: focus enters X, direct Y drag transfers
  the exact grouped owner and changes only Y `2→2.011`; PNG `288974` bytes,
  SHA-256
  `07b1faa3e08f899829dbe2e962c45bca2e32be9816614e5a7242d640b3808441`.
* `focus-node-integer-popup-child.*`: focused Integer yields to Select trigger;
  popup child selects `add` without hitting the covered row; following Integer
  scrub visibly reaches `6`. PNG `409471` bytes, SHA-256
  `525f05975a4bd06e607cd6b25041e9a2557443024ee381757e381561144eed1c`.
* All plans preserve exact route, restore focus emulation and report console
  `0`. Synthetic background evidence is not physical-device owner acceptance.

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

## UI-015.8.11 — Vector numeric arrow overlap RED

* Source: commit `2caaf89de`, Components PID `84831`, exact target `D0775…`,
  route `/vector-input/basic/default`, native `1920×1088 @2`, console `0`.
* `matrix-vector-hover.plan.json` moves the pointer into the X numeric left
  handle and records an accepted exact-canvas PNG after two render frames.
* `matrix-vector-meta-hover-full.png` is the source-fresh full canvas;
  `matrix-vector-meta-red.png` is its logical `1×` control crop;
  `matrix-vector-comparison-red.png` places that crop beside Blender 4.5
  `FunctionNodeInputVector.webp` without per-side rescaling.
* `vector-right-arrow-overlap-owner-red.png`, `348×194`, SHA-256
  `65fc064b07a39aae4cfbbb53bf0541e47fb8709d7bed714753ca4ad2f2bb7ad6`,
  is the direct owner crop. The Z-row right chevron is visibly underneath the
  last `3.000` glyph, proving paint-order/content-inset overlap.
* Expectation: both chevrons remain visible on numeric hover and only the left
  zone is active. Fact: the left chevron/zone is visible, but right-aligned
  `1.000` covers the right chevron. This is UI-015.8.11 RED, not owner visual
  acceptance and not a failure of retained redraw.

## UI-015.8.11 — Numeric handle inset result

* Source commit `4ad33fcda`; after Codex HUP `$ui-dev ensure` started fresh
  Elements/Components/Node PIDs `2062/2247/2415`, then reloaded the existing
  targets `E208…/D077…/809…` at native `1920×1088 @2`.
* Data-only plans `numeric-inset-{number,integer,vector,node-vector}-final.plan.json`
  hover the left numeric zone after an independent reload and two-frame settle.
  Every route is preserved, focus emulation restored and console is `0`.
* Logical `1×` result crops:
  * `numeric-inset-number-final.png`, `210×100`, SHA-256
    `dbb846670049ea1fee0e80ce44d6da4df740a1ad8aaff8b3a2dd95e1125b7608`;
  * `numeric-inset-integer-final.png`, `210×100`, SHA-256
    `2f3a8926ea0315e0c93ecbdbffd1835d35f8b7104ceaec833a4a1790171dd55f`;
  * `numeric-inset-vector-final.png`, `210×150`, SHA-256
    `a3582dbfe71bf7a345311d87bad64995e92ea719022ee89ede07a5c48e0040cc`;
  * `numeric-inset-node-vector-final.png`, `240×320`, SHA-256
    `94a6e00876fd26d6b70f523b751a15c5202b3f61ec20dea9c30d6aaf0cb253f5`.
* Fact: both arrows remain readable, only the hovered left zone is active, and
  Number/Integer/Vector values end before the right icon in standalone and Node.
  Exact machine summary is `numeric-inset.result.json`; synthetic evidence does
  not set owner acceptance.
* UI-015.10 current pair is now `matrix-vector-meta.png` plus
  `matrix-vector-comparison.png`, SHA-256
  `a3582dbfe71bf7a345311d87bad64995e92ea719022ee89ede07a5c48e0040cc` /
  `5058c3c40a7bf4135c5b8b56b9d7207be9cd68b407317673a600e86553fbf5d1`.
  The `-red` pair remains the rejected before evidence.

## UI-015.10 — Equal-scale owner visual matrix

* Source boundary `4ad33fcda`; source-fresh Components/Node PIDs `2247/2415`,
  exact targets `D077…/809…`, native `1920×1088 @2`. Each route was explicitly
  reloaded; captures are non-black and console is `0`.
* Meta full canvases are downscaled exactly `.5` to logical `1×` before crop.
  Owner Retina scalar/enum/shell references are also `.5`; Blender manual
  references retain original `1×`. Pair compositor does not scale either crop.
* Current comparisons and SHA-256:
  * `matrix-scalar-comparison.png` — `9f5d203460a97c8200c089e175df68dbc9f68a820862a2b35e72c01239f5eed4`;
  * `matrix-enum-comparison.png` — `7201fce074e86582198e1e93deb6ac4bdcd67e4ccb81525ba1af8ed4420eccf7`;
  * `matrix-vector-comparison.png` — `5058c3c40a7bf4135c5b8b56b9d7207be9cd68b407317673a600e86553fbf5d1`;
  * `matrix-path-comparison.png` — `89e48b8f06daec0ead902a36d378f9271dddf58a4b69ab49de2e4bda8083f60d`;
  * `matrix-reference-comparison.png` — `4adc3894ddce5d91d9b057965429c99552b163aad5d75f4e71b252d025de6093`;
  * `matrix-collection-comparison.png` — `39c4200d51e1a3ee55fc6c813d23af962e7b994501c0eb3eedf6d7954669f407`;
  * `matrix-color-comparison.png` — `05568e511ab54a54ea6950b7160264cf2834812f12bc845c18727755a06fa92b`;
  * `matrix-shell-comparison.png` — `d366434ae4d86d98d7402137580e4432fdccf1652b890df1a5181ba34f5bcaee`.
* Collection reference is official Blender 4.5 List View image
  `https://docs.blender.org/manual/en/4.5/_images/interface_controls_templates_list-presets_view-filter.png`,
  SHA-256 `3637aa79c220b33114f0995c5cd1a84930749aeb54d148c2e76b5d610b3a514e`;
  the earlier Collection data-block selector pair was semantically invalid and
  is excluded.
* `visual-matrix.result.json` records every exact source/path/hash and keeps
  `ownerAcceptance:false`. Different option names and Color values are
  representative data, not a visual verdict. Project font is the accepted
  divergence. Explicit owner review is mandatory before acceptance.
