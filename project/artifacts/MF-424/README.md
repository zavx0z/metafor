# MF-424 — визуальные доказательства

## MF-424.1 — серверный контур

### `mf-424.1-server-contour.png`

* Происхождение: composited CDP screenshot точной вкладки standalone
  Hamiltonian `http://127.0.0.1:4400/`, target
  `6B9ABE69BA42A93A8481B5D5F1676D7A`, после полного перезапуска host из
  канонического checkout MetaFor.
* Дата: 10 августа 2026 года; основание изменений — `ab06a9c79` в ветке
  `main`.
* Ожидалось: внешний пустой контейнер `Сервер` содержит `Hamiltonian`,
  `main-probe`, `worker-probe` и `Peer process`; серверный
  `RTCPeerConnection` остаётся внутри peer, Chrome остаётся отдельным
  контейнером.
* Получено: все перечисленные серверные ноды находятся внутри одного
  контейнера без параметров; RTC-вложенность и две связи DataChannel с
  браузерной стороной сохранены. Видимый HUD сообщает `12 нод · 9 связей`.
* Визуальная приёмка: владелец принял результат 10 августа 2026 года.
* Размер: `137246` байт, `1458 × 2176`.
* SHA-256:
  `68668f23e9f8b30fdffd207abfdadc3ca095b1882dc141bb0ee3a7e85f47f940`.
* Чувствительные данные: секретов нет; видны локальные runtime identity, PID и
  loopback-адрес диагностического контура.

Счётчик `dropped` в HUD накоплен за жизнь вкладки и фоновые интервалы. Он не
используется как критерий этой визуальной подзадачи.

## Повторная проверка MF-424.1 — завершение Peer process

11 августа 2026 года владелец показал живой регрессионный сценарий: серверный
`RTCPeerConnection` сохранился после завершения своего `Peer process` и
оказался корневой нодой снаружи контейнера `Сервер`. Причина установлена в
retained lifecycle: завершение owner удаляло сам процесс и transport, но не
принадлежащую ему дочернюю entity; межсредовая DataChannel-связь повторно
делала этот остаток видимым.

Критерий повторной проверки: завершение `Peer process` атомарно убирает его
RTC-поддерево и DataChannel из текущего снимка; новый серверный
`RTCPeerConnection` появляется только внутри нового `Peer process`. Владелец
повторно принял этот результат 11 августа 2026 года.

Техническое доказательство исправления:

* два focused lifecycle-набора: `36 pass`, `0 fail`;
* настоящий host-сценарий `rebirths a crashed Bun peer process and repairs
  direct RTC`: после убийства процесса retained snapshot содержит ровно один
  серверный RTC с owner нового `peer-process`: `1 pass`, `0 fail`;
* полный `bun run check`: typecheck, `42` ожидаемых type-error proofs и
  `2458 pass`, `0 fail`;
* HTTPS-host на `127.0.0.1:4400` перезапущен из канонического checkout; обычный
  Chrome переподключился к новому host epoch без открытия другого окна;
* live retained snapshot работающего host: один `peer-process`, один серверный
  `rtc-peer`, и его `ownerId` совпадает с этим текущим процессом.

### Индуцированный диагностикой корневой Service Worker

На следующем живом снимке владельца 11 августа 2026 года над контейнером
`Chrome` появился второй корневой `Service Worker`. Непосредственно перед этим
Codex открыл отдельный диагностический control WebSocket с синтетическими
`device`, `worker` и `transport`, прочитал startup snapshot и закрыл сокет без
сообщения `identity`. Host ошибочно записал закрытие такого сокета и состояние
заявленного Worker в retained lifecycle. Следовательно, наблюдение было
индуцировано диагностикой Codex, а не штатным поведением обычного Chrome.

Уточнённый критерий: URL-параметры control WebSocket не являются наблюдением
runtime. Только успешно подтверждённое сообщение `identity` разрешает host
материализовать terminal-состояние сокета либо `standby/error` Service Worker.
Закрытие неподтверждённого или отвергнутого сокета не меняет retained snapshot.
Повторная проверка не удерживает отдельный observer socket: падавший сценарий
воспроизводится одним короткоживущим control WebSocket, закрытым до `identity`.

## `mf-424.1-repeat-accepted.png`

* Происхождение: clean CDP capture точной уже открытой вкладки standalone
  Hamiltonian `https://127.0.0.1:4400/`, target
  `2BFEEBD05B85882BABA5131E3D46AACE`, после аварийного rebirth `Peer process` и
  закрытия отдельного control WebSocket до `identity`.
* Дата: 11 августа 2026 года; exact source checkout `main` на
  `8fefc5028fcfc156a4552823001ace39b44c94cf`; runtime version
  `mf424-visual`.
* Ожидалось: старое RTC-поддерево исчезает; новый серверный
  `RTCPeerConnection` остаётся внутри `Peer process` и `Сервер`; неподтверждённый
  WebSocket не создаёт корневую ноду Service Worker.
* Фактическое наблюдение: HUD показывает `12 нод · 10 связей`; `Service Worker`
  находится внутри `Chrome`; новый `Peer process` с PID `95540` содержит
  ровно один серверный `RTCPeerConnection` и находится внутри `Сервер`;
  ложных корневых дочерних нод нет.
* Визуальная приёмка: владелец принял повторный результат 11 августа
  2026 года.
* Машинная проверка: lifecycle projection `22 pass / 0 fail`; focused host
  сценарии peer rebirth и control socket до `identity` — по `1 pass / 0 fail`.
* Размер: `112482` байта, `1470 × 2176`.
* SHA-256:
  `0d382fe143fade704fd224eed94bfe39e4dad21f38c5f9ce06b356644774f993`.
* Чувствительные данные: секретов нет; видны локальные runtime identity, PID и
  loopback-адрес диагностического контура.
