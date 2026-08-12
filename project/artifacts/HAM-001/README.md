# HAM-001 — Артефакты

## `ham-001-4-live-webrtc-lines.png`

* Источник: exact Hamiltonian canvas пользовательской CDP-вкладки
  `http://127.0.0.1:4400/` после полного restart contour на result checkpoint HAM-001.4.
* Дата: 13 августа 2026 года.
* Версия: result `ba5c7abf0335537b824276e5cb506acab9d80dcf`, live acceptance
  `e4e52604915b1c1a190675edbc3df43ab11e235a`.
* Ожидание: canvas показывает browser и server RTC одной session и две
  различимые линии Oracle/Force между ними.
* Факт: ожидание совпало. Applied layout содержал `20` нод, `16` связей,
  exact browser/server RTC и два DataChannel routes; на canvas видны розовая Oracle и
  фиолетовая Force линии.
* Чувствительные сведения: секретов нет; видны localhost и временные runtime
  identities и session IDs испытательного контура.
* Размер: `3840 × 2176`, `387648` байт.
* SHA-256: `458f751bdffe8979ec00cc190889fec052c49b0c900a5dc7a93a0b4c0d71856d`.
