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
