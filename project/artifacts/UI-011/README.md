# UI-011 — Артефакты

## owner-node-socket-gap.png

* Источник: owner screenshot текущего Chrome `127.0.0.1:4016/socket/types`.
* Дата: 2026-08-20 05:47:33 +0300.
* Версия проекта: `c86fb51b6` плюс project commits до `7f97021ad`; UI playground
  source между ними не менялся.
* Ожидание: Node Socket открыт в общей Workbench structure, конкретные Socket
  types перечислены во второй панели, справа показаны code/copy и controls.
* Фактическое наблюдение: второй уровень содержит `Типы / Формы / Состояния`,
  center показывает aggregate grid, справа остаётся статический
  `Socket contract`; package consumer не мигрирован на story panel.
* Чувствительные сведения: отсутствуют; видны только локальные вкладки и
  системная строка macOS.
* Внешний оригинал: временный macOS screenshot, предоставленный владельцем в
  текущей задаче Codex.
* Контрольная сумма: SHA-256
  `8c8294a872e9177171a56c84b8dc6c3bb60c71df55dcf570f95cc973b90c469f`.

## node-socket-boolean-input.png

* Источник: `$ui-dev` exact canvas capture target
  `809BF08D88E4582CA819EFE847FE1450`, route `socket/boolean/input`.
* Дата: 2026-08-20 06:18:29 +0300.
* Версия проекта: UI-011.1 `348453120`, Node requirements `778889c4a`,
  production Socket calibration `574de1db6`.
* Ожидание: 19 concrete Socket types находятся во второй панели, один Boolean
  Socket — в detail preview, direction variants — снизу, TypeScript/copy и
  controls — справа.
* Фактическое наблюдение: ожидание совпало; DOM ready, console `0`, canvas
  `3840×2176`, outer Socket diameter около `20` physical px.
* Контрольная сумма: SHA-256
  `0dc325a31a98eae001e31b11439417cc762d64e83f24103f089653e14c8c723f`.

## node-editor-story.png

* Источник: `$ui-dev` exact capture `node-editor/scene/default`, target
  `809BF08D88E4582CA819EFE847FE1450`.
* Дата: 2026-08-20 06:46:07 +0300.
* Версия проекта: UI-011.2 `77bfa7264`, Node header `860076720`.
* Ожидание: пять Node components, actual expanded/collapsed scene и
  TypeScript/copy справа.
* Фактическое наблюдение: ожидание совпало; expanded Nodes и collapsed
  `Compact Mix` видны, console `0`, canvas `3840×2176`. Mapping fixture нет.
* Контрольная сумма: SHA-256
  `20b49ef06dc095b59cc3f3a09312cde0a1c7127ecd5ab3a9a817512256441a08`.

## node-comparison-story.png

* Источник: `$ui-dev` exact capture `comparison/blender/default`, тот же target.
* Дата: 2026-08-20 06:46:07 +0300.
* Версия проекта: UI-011.2 `77bfa7264`, Node header `860076720`.
* Ожидание: maintained Blender reference и actual live Node сохраняются,
  справа появляется exact story TypeScript/copy.
* Фактическое наблюдение: ожидание совпало; visual scale difference
  reference/live остаётся owner acceptance gate.
* Контрольная сумма: SHA-256
  `458e0f54f78cd75abf10c313631074f21a4730053478adb67a36fcb4a6469d54`.

## components-field-number.png

* Источник: `$ui-dev` renderer-activity desktop capture `field/number/input`,
  target `D0775AE44CFF0E299A0C28EECB3872D2`.
* Версия проекта: UI-011.3 `b1a113491`, NumberInput `99f80c0e2`.
* Фактическое наблюдение: production `Field → NumberInput`, TypeScript/copy и
  controls видны; console `0`, native metrics restored.
* Контрольная сумма: SHA-256
  `212ddf69bdbe67bb7215740e3560a75cb178ed741777bf8af8105207b13d73fe`.

## components-field-color.png

* Источник: `$ui-dev` ready desktop capture `field/color/input`, тот же target.
* Версия проекта: UI-011.3 `b1a113491`, ColorInput `c935de436`.
* Фактическое наблюдение: production `Field → ColorInput`, swatch/RGBA и
  TypeScript/copy видны. Первый `starting` кадр отклонён; сохранён ready кадр.
* Контрольная сумма: SHA-256
  `ed1610346a91630c1df48a0e822db09f7f1eb977b5c783b2b4ce0b3de842361d`.

## components-field-vector.png

* Источник: `$ui-dev` renderer-activity desktop capture `field/vector/default`,
  тот же target.
* Версия проекта: UI-011.3 `b1a113491`, VectorInput `b926baf00`.
* Фактическое наблюдение: production `Field → VectorInput`, XYZ и
  TypeScript/copy видны; console `0`, native metrics restored.
* Контрольная сумма: SHA-256
  `e7ddf87392c982d683c952f2b685ca5263ae524155f66b0054db0a4603d2b838`.
