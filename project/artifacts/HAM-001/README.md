# HAM-001 — Артефакты

## `server-incarnation-duplicate-rtc.png`

* Источник: переданный владельцем screenshot живой Hamiltonian scene;
  оригинальное имя `Снимок экрана 2026-08-12 в 19.07.06.png`.
* Дата: 12 августа 2026 года.
* Версия проекта: страница от host version `mf-428-3-live`; после restart
  одновременно наблюдался host version `mf-428-5-live` поверх baseline
  `ffc70e291542838e55485c12e2b5ec91ae181c11` и ещё не зафиксированного на тот
  момент presentation patch MF-428.5. Ни этот patch, ни параллельный NODES-008
  не изменяли lifecycle ownership или `parentId`.
* Ожидание владельца: после полного restart Hamiltonian в scene находится одна
  текущая server incarnation; её RTCPeerConnection вложен в exact Peer process
  внутри контейнера `Сервер`.
* Фактическое наблюдение: старый connected RTCPeerConnection остаётся внутри
  старого Peer process/server subtree, а RTC новой host incarnation в состоянии
  `new` одновременно показан отдельной корневой нодой над контейнером. Снимок
  доказывает смешение двух server declarations, но сам по себе не устанавливает
  внутреннюю причину.
* Последующая read-only локализация: старая page declaration удерживала
  `server:9f42bb94-…`; новый snapshot имел `server:dc8b3fca-…`. Transport сделал
  новый RTC видимым при невидимом новом owner, поэтому `parentId` стал `null`.
  Frozen probe воспроизвёл тот же результат без browser и layout.
* Чувствительные сведения: секретов нет; видны localhost, временные runtime
  identity, session IDs и PID испытательного контура.
* Размер: `924 × 1324`, `113920` байт.
* Внешний оригинал: временный macOS screenshot был скопирован в устойчивую
  директорию задачи без преобразования.
* Контрольная сумма SHA-256:
  `87d27157ce975f1c5f82e8bceef58fb0a9a8b80e68f514d8bf896c82618f0de4`.

## `ham-001-3-current-canvas-missing-webrtc.png`

* Источник: `HTMLCanvasElement.toDataURL("image/png")` exact Hamiltonian canvas
  пользовательской CDP-вкладки `http://127.0.0.1:4400/` после полного restart
  canonical contour на result checkpoint HAM-001.2.
* Дата: 13 августа 2026 года.
* Версия проекта: HEAD `b109ae338727e9ba9df3d52b18a5898aa4395fd1`, result
  checkpoint HAM-001.2 `2e8a9949849d580b439ab06bec0dd51eb7e7450d`;
  Hamiltonian identity `ham-001-live`, version `ham-001-live-stable`, host epoch
  `0517dda7-1281-420b-8169-8c67dbca8e5c`.
* Ожидание владельца: current canvas показывает две отдельные линии Oracle и
  Force между exact connected browser/server `RTCPeerConnection` одной
  session.
* Фактическое наблюдение: параллельные read-only declarations устойчиво
  содержали оба RTC endpoints и две `opened/open` DataChannel, status был
  `19 нод · 14 связей · живой режим`, но canvas не показал browser RTC и обе
  линии. Снимок доказывает pixel mismatch, но не устанавливает слой причины.
* Чувствительные сведения: секретов нет; видны localhost, временные runtime
  identities, session IDs и PID испытательного контура.
* Размер: `3840 × 2176`, `415596` байт.
* Контрольная сумма SHA-256:
  `67693dc859b1393756d1fb9c4d8c31fbcff6fdd9b3a49915d58e2092e531ce67`.

## `ham-001-4-live-webrtc-lines.png`

* Источник: `HTMLCanvasElement.toDataURL("image/png")` той же exact
  Hamiltonian CDP-вкладки `http://127.0.0.1:4400/` после полного restart
  contour на result checkpoint HAM-001.4.
* Дата: 13 августа 2026 года.
* Версия проекта: HEAD `ba2e5469ba65b571bd69c33c4f2ad28c19bfa04b`, result
  checkpoint HAM-001.4 `ba5c7abf0335537b824276e5cb506acab9d80dcf`; Hamiltonian
  identity `ham-001-live`, version `ham-001-live-stable`, host epoch
  `ff90f372-6c12-4756-98a2-58246b318c62`.
* Ожидание: canvas показывает browser и server RTC одной session и
  две различимые линии Oracle/Force между ними.
* Фактическое наблюдение: ожидание совпало. Applied layout имеет `20`
  нод, `16` связей, exact browser/server RTC session
  `2e7b2a24-6b79-44fd-aee6-11d262f8a751` и два DataChannel routes; на canvas
  видны розовая Oracle и фиолетовая Force линии.
* Чувствительные сведения: секретов нет; видны localhost, временные
  runtime identities, session IDs и PID испытательного контура.
* Размер: `3840 × 2176`, `387648` байт.
* Контрольная сумма SHA-256:
  `458f751bdffe8979ec00cc190889fec052c49b0c900a5dc7a93a0b4c0d71856d`.
