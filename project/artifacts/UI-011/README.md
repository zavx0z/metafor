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

## elements-div-background.png

* Источник: `$ui-dev` renderer-activity desktop capture
  `div/basic/background`, target `E2087390E08913DD8CA4142D5D9E8C48`.
* Дата: 2026-08-20; версия UI-011.4 `ee3a47350`, PID `55110`.
* Ожидание: concrete Elements catalog, разделы Container, production `div`,
  variants и TypeScript/copy/controls в общей Workbench structure.
* Фактическое наблюдение: ожидание совпало; console `0`, native
  `1920×1088 @2` восстановлен. Обычный idle capture был чёрным и отклонён.
* Чувствительные сведения: отсутствуют.
* Контрольная сумма: SHA-256
  `7b0dd2e68b899bafb4a701159a3c93a4f9b9ca88642938001687b93041c5e0e2`.

## elements-flex-css-fraction.png

* Источник: тот же exact target, renderer-activity desktop capture
  `flex-css/sizes/fraction`.
* Дата и версия: 2026-08-20, UI-011.4 `ee3a47350`.
* Ожидание: detail story `Flex CSS · Доли`, три production slots `1fr/2fr/1fr`,
  exact source и layout controls.
* Фактическое наблюдение: ожидание совпало; console `0`, native metrics
  восстановлены, capture non-black.
* Чувствительные сведения: отсутствуют.
* Контрольная сумма: SHA-256
  `16f9d711b83af342f97a4e1411004dab2ab6ad5127ca611e10ebd5d2d355c17d`.

## elements-theme-cyan.png

* Источник: тот же exact target, renderer-activity desktop capture
  `theme/tone/cyan`.
* Дата и версия: 2026-08-20, UI-011.4 `ee3a47350`.
* Ожидание: Theme detail story с четырьмя variants, production palette source и
  русскими controls.
* Фактическое наблюдение: ожидание совпало; выбран Cyan, console `0`, native
  metrics восстановлены.
* Чувствительные сведения: отсутствуют.
* Контрольная сумма: SHA-256
  `4fab9b5272989dbce1823bbba49d751edca3ba4aec2de70fc7df41c6d71e67a9`.

## elements-pointer-click.png

* Источник: тот же exact target, renderer-activity desktop capture
  `pointer/state/click`.
* Дата и версия: 2026-08-20, UI-011.4 `ee3a47350`.
* Ожидание: Pointer detail story, шесть state variants, production button,
  click state и exact event TypeScript.
* Фактическое наблюдение: ожидание совпало; `Состояние: клик`, `Клики: 1`,
  console `0`, native metrics восстановлены.
* Чувствительные сведения: отсутствуют.
* Контрольная сумма: SHA-256
  `efc353a92146442bbcf80133b7f708c46b3c9b39efdad89877a1e5549f94004b`.

## node-shadow-ordinary-scene.png

* Источник: `$ui-dev` renderer-activity desktop capture
  `node-editor/scene/default`, target `809BF08D88E4582CA819EFE847FE1450`.
* Дата: 2026-08-20; loaded PID `59015`, production shadow checkpoint
  `b9f9419fb`, Matrix correction `a54f54495`.
* Ожидание: ordinary expanded Nodes и ordinary collapsed `Compact Mix` имеют
  мягкую симметричную SDF-тень без обрезания; Workbench code/copy виден справа.
* Фактическое наблюдение: ожидание совпало для ordinary states; selected Node
  не доказан этим route и вынесен в UI-011.5. Console `0`, native metrics
  восстановлены. Bounded profile того же workload: `60` frames, mean
  `31.38 ms`, max `50.8 ms`, JS heap delta `+11880` bytes; GPU time не измерен.
* Чувствительные сведения: отсутствуют.
* Контрольная сумма: SHA-256
  `23fdea890579d4ef587492c0148849d68a29c7bff1dcf9a3887051b5685c7522`.

## components-field-matrix.png

* Источник: `$ui-dev` renderer-activity desktop capture
  `field/matrix/default`, target `D0775AE44CFF0E299A0C28EECB3872D2`.
* Дата: 2026-08-20; loaded PID `59026`, MatrixInput checkpoint `4978b3d97`,
  presentation correction `a54f54495`.
* Ожидание: production `Field → MatrixInput` показывает `1.00/0.00`, regular
  compact typography, TypeScript/copy и controls.
* Фактическое наблюдение: ожидание совпало; первый `starting` black frame
  отклонён, сохранён ready non-black capture; console `0`, native metrics
  восстановлены.
* Чувствительные сведения: отсутствуют.
* Контрольная сумма: SHA-256
  `fc2c48402b95f83333cd4fd8451a433033718df4e6f69e56a30798acf7b8aedf`.

## node-expanded-ordinary.png

* Источник: `$ui-dev` renderer-activity capture
  `node-editor/scene/default`, target `809BF08D88E4582CA819EFE847FE1450`.
* Дата: 2026-08-20; UI-011.5 `8078cf31f`, PID `71855`.
* Ожидание и факт: expanded `scalar` ordinary, пустое selection, neutral shadow
  и body border; route/source/controls видны, console `0`, native restored.
* Чувствительные сведения: отсутствуют.
* Контрольная сумма: SHA-256
  `87371f373153d2dad9ed58084ab6a69f19d990de19fbfa42a25b353ab09e5088`.

## node-expanded-selected.png

* Источник: тот же target, route `node-editor/scene/selected`.
* Дата и версия: 2026-08-20, UI-011.5 `8078cf31f`.
* Ожидание и факт: DOM selection `node/scalar`; expanded Node получает tinted
  soft shadow без clipping/offset, body border остаётся neutral; console `0`,
  native restored. Orange title является отдельным известным visual state.
* Чувствительные сведения: отсутствуют.
* Контрольная сумма: SHA-256
  `c4da38875622a857217c4dee9da79c6914cebbdd09a2c1e41f7ca1b7468e896e`.

## node-collapsed-ordinary.png

* Источник: тот же target, route `node-editor/collapsed/default`.
* Дата и версия: 2026-08-20, UI-011.5 `8078cf31f`.
* Ожидание и факт: collapsed `Compact Mix` ordinary, пустое selection, shadow
  не обрезан; exact route/source/controls, console `0`, native restored.
* Чувствительные сведения: отсутствуют.
* Контрольная сумма: SHA-256
  `3d0af5995a06cb4a78d7964f844f5866e9cc9317bd49b27d180b134f7a01f9fe`.

## node-collapsed-selected.png

* Источник: тот же target, route `node-editor/collapsed/selected`.
* Дата и версия: 2026-08-20, UI-011.5 `8078cf31f`.
* Ожидание и факт: DOM selection `node/collapsed`; Compact Mix получает tinted
  soft shadow без clipping/offset, body border neutral; console `0`, native
  restored.
* Чувствительные сведения: отсутствуют.
* Контрольная сумма: SHA-256
  `bad31b7ec5ed1e4c0a8226a9cb7c377c22b2b3eba82258f67f90ef55f46b71ce`.

## components-vector-input.png

* Источник: `$ui-dev` renderer-activity capture
  `vector-input/basic/default`, target `D0775AE44CFF0E299A0C28EECB3872D2`.
* Дата: 2026-08-20; UI-011.6 `4daabb34f`, PID `71854`.
* Ожидание и факт: отдельный `Ввод вектора` catalog entry, production XYZ,
  exact `@ui/components/vector-input` source и controls; console `0`, native
  restored.
* Чувствительные сведения: отсутствуют.
* Контрольная сумма: SHA-256
  `0e383873b5aad02c7169e98ebd6ebcf99f6f9a991f102dbe55649aa247fadd3a`.

## components-matrix-input.png

* Источник: тот же target, route `matrix-input/basic/default`.
* Дата и версия: 2026-08-20, UI-011.6 `4daabb34f`.
* Ожидание и факт: отдельный `Ввод матрицы` catalog entry, production 2×2
  `1.00/0.00`, exact `@ui/components/matrix-input` source и controls; console
  `0`, native restored.
* Чувствительные сведения: отсутствуют.
* Контрольная сумма: SHA-256
  `43ac5ab6b9c53f7292a388fe02547c6821d2e07d2f638936d60abd9307ceffcb`.

## components-reference-input.png

* Источник: `$ui-dev` renderer-activity desktop capture
  `reference-input/basic/default`, target `D0775AE44CFF0E299A0C28EECB3872D2`.
* Дата: 2026-08-20; production `663a81c0b`, UI-011.7 `4c57b33c9`,
  loaded PID `1163`.
* Ожидание и факт: отдельный `Выбор ссылки`, selected opaque resource,
  activate/clear, exact TypeScript/copy, controls/events; route ready, console
  `0`, native metrics восстановлены.
* Чувствительные сведения: отсутствуют.
* Контрольная сумма: SHA-256
  `27d25b64062dab87815339a309c33d57e13653742668aea0031005a1bdc0781e`.

## components-enum-input-cycle.png

* Источник: `$ui-dev` renderer-activity capture
  `enum-input/presentation/cycle`, тот же target.
* Дата: 2026-08-20; production `1f6e8b394`, UI-011.8 `0ea692dda`,
  loaded PID `11092`.
* Ожидание и факт: отдельный `Выбор значения`, cycle presentation со значением
  `multiply`, exact TypeScript/copy и четыре sections; console `0`, native
  metrics восстановлены.
* Чувствительные сведения: отсутствуют.
* Контрольная сумма: SHA-256
  `f121f4c90d2aafc82ab03c4931fc6d0654424402ff9c9face3854c76d49db7ca`.

## components-enum-input-expanded.png

* Источник: тот же target, route `enum-input/presentation/expanded`.
* Дата и версия: 2026-08-20, UI-011.8 `0ea692dda`.
* Ожидание и факт: inline-expanded production choices
  `Сложение / Умножение / Вычитание`, exact source/controls/events; console `0`,
  native metrics восстановлены.
* Чувствительные сведения: отсутствуют.
* Контрольная сумма: SHA-256
  `af1587f2ff46dd21b9a9862ce11c91a09917762af5d8aaa9236f383b986b8035`.

## workbench-overview.png

* Источник: `$ui-dev` renderer-activity desktop capture `4192/overview`, target
  `1AFE2E4404B88E32A4CBA6C26AF4C633`, PID `87410`.
* Дата: 2026-08-20; current shared Workbench contract.
* Ожидание и факт: эталонная пятизонная desktop-композиция, Button preview,
  variants, TypeScript/copy и controls/events; ready, console `0`, non-black,
  native `1920×1088 @2` восстановлен.
* Чувствительные сведения: отсутствуют.
* Контрольная сумма: SHA-256
  `5805fe6e281c1d7d3931e163f3f90aeaf5f53d836e0ef876329a1dde3a96e943`.
