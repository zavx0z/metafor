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
