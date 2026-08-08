# MF-412 — Артефакты

## Граница применимости после переименования RPC lane

Raw JSON, screenshots и soak v7—v11 получены до переименования испытательной
RPC lane и поэтому содержат прежние wire-name и имя счётчика. Эти исходные
свидетельства намеренно не переписываются: они
доказывают прямой двухканальный carrier, reconnect/lifetime и отсутствие
realtime relay через control WSS, но не являются live-приёмкой текущего
browser adapter с lane `oracle`. Нынешний path отдельно принят свежим Chrome
v12 evidence ниже; прежние файлы сохраняют только собственную историческую
доказательную границу.

## Standalone v12: current Oracle/Force browser proof

* Источник: текущий checkout на `HEAD`
  `6776bfb1c53e3122f0c8617a916657cce06a327c`, Chrome 151 через CDP,
  `http://127.0.0.1:4412`, один локальный Hamiltonian listener.
* Дата: 2026-08-08.
* [`macos-chrome-v12-oracle-source-manifest.sha256`](macos-chrome-v12-oracle-source-manifest.sha256)
  содержит SHA-256 каждого runtime/test input. В него входят все файлы
  `experiments/hamiltonian`, кроме `README.md`, `TOPOLOGY.md`, `.tls/` и
  `node_modules/`; поэтому последующая редактура evidence prose не меняет
  доказанный source snapshot. SHA-256 самого manifest:
  `370115deea2948a6b45966e12bb4d0e35ba083de0ea935e7927622b695a26b98`.
* [`macos-chrome-v12-oracle-live-status.json`](macos-chrome-v12-oracle-live-status.json)
  фиксирует connected peer с channels `oracle` и `force`,
  `oracleRequests=5`, `forceEvents=5` и
  `realtimeFramesOnControlSocket=0`. В том же session Service Worker/WSS
  успел сменить physical connection, а authority и готовый direct peer были
  возобновлены.
* [`macos-chrome-v12-oracle-live-dom.json`](macos-chrome-v12-oracle-live-dom.json)
  фиксирует elected embodiment, Oracle response и Force echo в текущем Window.
* [`macos-chrome-v12-oracle-live.png`](macos-chrome-v12-oracle-live.png)
  визуально совпадает с DOM: `v12-review`, active main/Worker, direct
  `oracle + force`, успешные обе lane.
* Контрольные суммы:
  * status —
    `sha256:9a486b1dd14584b087862828949b18a934c0462e47b191c6d303ea959cb022ed`;
  * DOM —
    `sha256:d9ac43ee83e14176c68ab56f653605abe67b0709bc3a3f63c9227bbe26f9bb0b`;
  * screenshot —
    `sha256:e7978c9822f813ea07a9bf6a20544d28722051cf9cc3b1d29244346daf768fe4`.

## Standalone v11: recoverable control, direct peer и placement

* Источник: Bun 1.3.14, `werift@0.24.3`, live `/lab/status`, browser DOM/CDP,
  `@meta/chrome`, `@meta/android`, ADB lifecycle и один TLS listener `*:4400`.
* Дата: 2026-08-08.
* Версия проекта: `6776bfb1c53e3122f0c8617a916657cce06a327c` плюс незакоммиченные
  изменения `experiments/hamiltonian` и задачи `MF-412`.
* Автоматический итог: `bun test experiments/hamiltonian` — 61 pass, 0 fail,
  227 assertions; strict TypeScript, browser build и `git diff --check`
  завершены без ошибок.
* Один listener одновременно отдаёт bootstrap/version и держит control WSS.
  Отдельные Bun main-, worker-role- и peer-process работают через IPC и не
  открывают listener.
* WSS хранит только identity, heartbeat, election/update и SDP/ICE signaling.
  Попытка отправить realtime lane-frame закрывает socket кодом 1008. Во всех
  peer-status `realtimeFramesOnControlSocket` равен нулю.
* Direct peer использует один `RTCPeerConnection` и две ordered/reliable lane:
  прежнюю RPC lane и `force`. Status фиксирует оба открытых channel, один RPC
  request и одно Force event; отдельный Bun↔Bun fixture доказывает тот же path
  без браузера. Потеря одной lane, transport gap и Force-event gap закрывают
  всю peer session; rejected backpressure send не расходует sequence.
* Control WSS loss не отзывает authority немедленно. Готовый direct peer
  продолжает realtime до lease expiry. Возврат нового WSS с той же
  browser-profile resume-capability сохраняет lease/fence и ready peer; если
  RTC не был готов, host создаёт новую peer generation под той же authority.
* Browser- и server-placement взаимоисключены. В browser-mode Bun процессы —
  явно неавторитетные `main-probe/worker-probe`; в server-mode authority имеет
  только Bun `main`, а Window leader отсутствует.

### Open-tab soak v11

[`open-tab-soak-v11-raw.json`](open-tab-soak-v11-raw.json) сохраняет полный
вывод тогдашнего observer: 9 raw samples за две минуты, две подтверждённые смены
между non-null Worker incarnation, пять изменений WSS-состояния и три
detached-пробы. Logical host/lease/fence/Window/peer/session остались
неизменными; heartbeat вырос на 9, RPC/Force — на 12 каждый, realtime frames
на control WSS остались `0`. Видимая Chrome-проверка совпала с host evidence:
`v11-final`, browser placement, elected main, Bun lifecycle probes и открытые
RPC/Force direct channels.

### Исторический open-tab soak v9

[`open-tab-soak-v9-summary.json`](open-tab-soak-v9-summary.json) фиксирует
более ранний двухминутный Chrome-прогон: 9 проб, `heartbeat +9`, RPC/Force
`+12/+12`, realtime frames на control WSS — `0`. Chrome пять раз сменил
физическое WSS-состояние, три пробы попали в detached-интервал, однако
host epoch, lease/fence, Window/device, peerId, peer generation/session и обе
DataChannel остались неизменными. Это доказывает recoverable control при
открытой Window, а не бессмертие одного Service Worker или socket. Девять raw
samples этого раннего прогона не сохранены, поэтому сводка не доказывает точное
число смен Worker incarnation; новый observer считает только переходы между
наблюдаемыми non-null incarnation.

### macOS Chrome

* `macos-chrome-v7-status.json` и `macos-chrome-v7-page-state.json` доказывают
  connected control socket, direct peer, два DataChannel, успешные RPC/Force
  probes, elected main и активный Dedicated Worker.
* `macos-chrome-two-tabs-status.json` фиксирует один физический Service Worker
  WSS и две Window. Вторая Window — candidate: main не рождён, Dedicated Worker
  активен.
* После закрытия лидера `macos-chrome-leader-handoff-status.json` фиксирует тот
  же WSS, новую lease, fencing token `3 → 4` и direct peer нового лидера.
* После закрытия последней Window browser process был жив, а WSS наблюдался на
  пятой секунде (`macos-chrome-zero-window-5s.json`). Это измерение, не гарантия
  lifetime.
* Видимый screenshot `macos-chrome-v7-webrtc.png` совпал с ожиданием: secure
  control, elected main, direct peer, RPC/Force proof, Bun roles и cache.
* Контрольные суммы:
  * screenshot —
    `sha256:9374dde2c32bf303849e44fd84e5595f71552bc0bec61a28f437d1cd7bc11456`;
  * status —
    `sha256:21e7b6b896f0c9475104e0057996e9ec44afa2e63a8864a6b5af83cc82a475ca`;
  * two tabs —
    `sha256:e95f4389328b6126baf3f7d6fd6f74f678efa9b15c3bd54d5c4f6f8aa61b151e`;
  * leader handoff —
    `sha256:707d4e07c3eaa017f7d2c2df28aef97a5dac20a3ba37ffcb101ea2720e9702aa`.

### macOS Yandex и Safari

* Yandex Browser `26.6`/Chromium `148` прошёл тот же v7 peer proof.
* Полный quit изолированного Yandex process удалил connection. Reopen того же
  profile сохранил stable `deviceId`, но создал новые connection ID, Service
  Worker incarnation, Window и peer session. Это reconnect, не сохранение
  physical socket.
* Safari создал отдельный profile/device connection, получил глобальный lease
  и со стороны host завершил RPC/Force direct peer proof. Одновременно Yandex
  стал candidate без main. После закрытия Safari новый fence получил Yandex.
* Safari DOM не прочитан: `safaridriver` сообщил, что Allow Remote Automation
  отключён. Host-side counters являются transport evidence, но не visual DOM
  acceptance.
* Контрольные суммы:
  * Yandex quit —
    `sha256:f656cde465cf0a6f5f65dff426ca1f9e1d28998b8c22f2d2872bc2fe943d9da5`;
  * Yandex reopened peer —
    `sha256:e5f9836aab55745eb26d760ed732033302cb6f9d7c4053376c8907307fa259d2`;
  * Safari host evidence —
    `sha256:e4cab1cea1ea5f28f07e48f173fca5c9d2b0dac74883f9a106f9c4ecf832f704`.

### Android Chrome и Yandex

* Chrome v7 по trusted LAN TLS прошёл direct peer proof. Закрытие последнего
  target удалило connection почти сразу; reopen сохранил `deviceId`, но создал
  новые connection/SW/session incarnation.
* `am force-stop com.android.chrome` удалил connection. После ручного явного
  запуска Chrome восстановил peer через новую физическую session.
* Yandex Android также прошёл direct peer и force-stop/reopen. При screen-off
  connection исчез к 30-й секунде. Попытки автоматического wake оставались в
  lock/sleep state, поэтому устойчивое recovery после screen-off не заявлено.
* Android v7 screenshot не получен: CDP screenshot timeout повторился при
  исправно работающих eval/status. DOM и host status сохранены отдельно.
* Контрольные суммы:
  * Chrome peer —
    `sha256:a04e335d0e0ebc3aa305112738fe70cefdbffb95c863c058b19302559b12ae9d`;
  * Chrome force-stop —
    `sha256:4f7e7f3cd1a10883b67817c1fc5ce6a751608c61307967e507bf5edcf06f3395`;
  * Chrome reopen —
    `sha256:32c41afd4ca89e84ea17a75071b5f707fbce2fa687fd3b61156423f34dc74908`;
  * Yandex screen-off —
    `sha256:546ce072bb246d4baa708e0800a6abccf5d503c98586f94f51db9966630c232b`.

### Server-only

`server-only-live-status.json` был снят при нуле browser connections. Один
listener продолжал жить, а два обычных Bun process (`main`, `worker`) оставались
`ready` с одинаковыми version/hash и разными PID/incarnation. Текущие fixtures
дополнительно доказывают: Window не получает authority в server-placement,
cold rebirth `main` меняет PID/incarnation и fence/lease, старый envelope больше
не принимается, а shutdown не может оставить поздно рождённый child. Отдельный
тест создаёт два Bun WebRTC peer и прогоняет RPC и Force напрямую по DataChannel.
Контрольная сумма status:
`sha256:f34a3173662d2d12c998c702f8be48e5dd519633cc661a5a5ad0f1b40ac7e746`.

[`server-only-v10-summary.json`](server-only-v10-summary.json) — свежая
проверка именно явного `server` placement: ноль browser connections,
`topology.leader = null`, authority только у Bun `main`, неавторитетные Bun
`worker` и peer-process, один listener. Вспомогательный listener и его дочерние
процессы после снимка остановлены; существующий contour на `4400` не тронут.

### Чего эти артефакты не доказывают

* production mapping Dark/Bulk/Boundary и перенос MetaFor State;
* remote ICE через STUN/TURN, NAT matrix или выбранную production WebRTC
  реализацию для Bun;
* production identity/trust/authorization и causal frontier recovery;
* распределённый handoff authoritative main между Bun и Window: это остаётся
  owner-gate `MF-414`, а не скрытая часть этого эксперимента;
* бессмертие Service Worker или сохранение socket после browser quit;
* Safari DOM acceptance и стабильное Android wake после screen-off.

## Локальная проверка Hamiltonian experiment

* Источник: автоматические Bun-проверки и живой Codex In-app Browser на
  `http://127.0.0.1:4400`; чувствительные join token и временные UUID не
  сохранялись.
* Дата: 2026-08-08.
* Версия проекта: `6776bfb1c53e3122f0c8617a916657cce06a327c` плюс незакоммиченные
  изменения задачи `MF-412`.
* Ожидание: один Bun listener, один Service Worker WebSocket, несколько Window
  MessageChannel, не более одного лидера, проверенный versioned cache и
  восстановление control channel.
* Фактическое наблюдение:
  * `bun test experiments/hamiltonian` — 4 pass, 0 fail, 15 assertions;
  * `bunx tsc --noEmit --pretty false` — завершён без ошибок;
  * первый browser profile зарегистрировал и активировал Service Worker,
    подключил control socket, проверил SHA-256 и загрузил `v1` из кэша;
  * две вкладки имели один `deviceId`, один host peer и два Window candidates;
    первая была лидером, после её закрытия лидером стала вторая;
  * после restart host с `v2` WebSocket восстановился, Window загрузил `v2`, а
    Cache Storage одновременно показывал `hamiltonian-code:v1` и
    `hamiltonian-code:v2`;
  * после исправления reconnect шёл с возрастающей задержкой и затем вернулся в
    `connected`.
* На этом первом локальном этапе не были доказаны физическое второе устройство,
  доверенный HTTPS и принудительное вытеснение Service Worker. Последующий
  Android этап ниже закрыл физическое устройство и HTTPS через ADB reverse, но
  не прямой LAN и не вытеснение Worker.

## Android 15 через ADB reverse

* Источник: Xiaomi `25028RN03A`, Android 15, Chrome `150.0.7871.186`,
  `@meta/android` CDP и один Bun TLS listener на `4400`.
* Дата: 2026-08-08.
* Версия проекта: `6776bfb1c53e3122f0c8617a916657cce06a327c` плюс незакоммиченные
  изменения задачи `MF-412`.
* Ожидание: Android доверяет отдельному test CA, `adb reverse` приводит
  `https://localhost:4400` к тому же Bun listener, Service Worker проходит
  первый install и держит один WSS на несколько вкладок.
* Фактическое наблюдение:
  * test CA установлен и виден как `Hamiltonian MF-412 Test CA` в пользовательских
    доверенных сертификатах; приватный ключ на Android не передавался;
  * Chrome показывает защищённое подключение; `isSecureContext === true`,
    controller `activated`, socket `connected` и первый page path
    `claimed after install`;
  * две вкладки имеют один `deviceId`, один host peer, два Window и одного
    лидера;
  * после restart host `v3 → v4` WSS восстановился, а Cache Storage содержал
    `hamiltonian-code:v3` и `hamiltonian-code:v4`;
  * Android background throttling обнаружил ошибочность timer-based liveness;
    после перехода на `clients.matchAll()` обе вкладки сохранились в topology
    спустя 12 секунд в foreground/background состоянии.
* Не доказано: прямое LAN-соединение без ADB reverse, browser family кроме
  Chromium и принудительное вытеснение Service Worker браузером.

## Android 15 напрямую по LAN и рождение нового Service Worker target

* Источник: тот же Xiaomi `25028RN03A`, Android 15, Chrome
  `150.0.7871.186`, `@meta/android`, CDP и один Bun TLS listener на `*:4400`.
* Дата: 2026-08-08.
* Версия проекта: `6776bfb1c53e3122f0c8617a916657cce06a327c` плюс незакоммиченные
  изменения задачи `MF-412`.
* Ожидание: после удаления ADB reverse Android достигает host напрямую по LAN;
  принудительная остановка только Service Worker runtime сохраняет registration,
  client и cache, а Window без ручного reload восстанавливает channel и WSS.
* Фактическое наблюдение:
  * `adb reverse --remove tcp:4400` оставил список reverse пустым до открытия
    `https://192.168.8.118:4400`;
  * сертификат содержит `192.168.8.118` в SAN, Android принял origin как secure,
    а новый Service Worker завершил первый `install → activate → claim`;
  * LAN-origin показал `socket: connected`, host `hamiltonian-lab`, version `v4`
    и `hamiltonian-code:v4`;
  * CDP `ServiceWorker.stopWorker` остановил только version `94`: её
    registration `38` и controlled client сохранились;
  * running target сменился с
    `6B860C97575AB2CC3666D9B0505FAE6D` на
    `F1E8300A237BD74CB9546B3B0E1ABF3D`;
  * существующий Window без ручного reload создал свежий MessageChannel,
    восстановил WSS и повторно использовал проверенный cache `v4`.
* Перед точной CDP-проверкой экспериментальный переход на внутреннюю страницу
  Chrome завершил browser process; Chrome был заново открыт, CDP forward
  восстановлен, и приведённая выше последовательность `running → stopped →
  running` наблюдалась уже отдельно после этого восстановления.
* Не доказано: browser family кроме Chromium. ADB reverse после проверки не
  восстанавливался; Android оставлен на прямом LAN-origin.

## android-service-worker-rebirth.jsonl

* Источник: события Chrome DevTools Protocol `ServiceWorker.workerVersionUpdated`
  и результат точечного `ServiceWorker.stopWorker` для LAN-origin.
* Ожидание: version и controlled client сохраняются, running target исчезает и
  появляется новый.
* Фактическое наблюдение: version `94` прошла `running → stopping → stopped →
  starting → running`, controlled client не исчез, target ID изменился.
* Чувствительные сведения: только случайные экспериментальные target/client ID.
* Контрольная сумма:
  `sha256:91dbbf0e6dc670dfbdc16f13751a560ae14931e82de9bf587fa7902a4f024c2b`.

## android-hamiltonian-lan-rebirth-v4.png

* Источник: обычный viewport screenshot LAN-вкладки после рождения нового
  Service Worker target.
* Ожидание: secure context, pre-existing control, connected socket, единственное
  elected embodiment и Hamiltonian host.
* Фактическое наблюдение: все ожидаемые состояния видимы; version находится ниже
  viewport и показана на отдельном снимке.
* Чувствительные сведения: отсутствуют.
* Контрольная сумма:
  `sha256:87cb2c6f9ef7436e92669295ef66135bd472deecf35b1941e81f32408e8bb542`.

## android-hamiltonian-lan-rebirth-v4-details.png

* Источник: нижний viewport той же LAN-вкладки.
* Ожидание: version `v4`, загруженный versioned module, cache и восстановленная
  host topology.
* Фактическое наблюдение: видны `v4`, `versioned module v4 loaded through
  Hamiltonian cache`, `hamiltonian-code:v4` и topology. Точная смена worker
  target подтверждена CDP-событиями выше, а не изображением.
* Чувствительные сведения: сохранены только случайные экспериментальные UUID.
* Контрольная сумма:
  `sha256:50a5338e633027659e39b87ae412995b27bf669119e9438135bc88ffe7a2c096`.

## Три оболочки одного versioned module

* Источник: Android LAN-вкладка, Service Worker cache, два последовательных Bun
  TLS host process `v5` и `v6`, отдельные Bun child process через IPC.
* Дата: 2026-08-08.
* Ожидание: Window main, Dedicated Worker и Bun OS process используют один
  version/hash; Worker может переродиться отдельно, а новая host-version требует
  настоящего page reload для main realm и нового Bun process.
* Фактическое наблюдение:
  * на `v5` все три оболочки были `active/ready` с SHA-256
    `d5f0f1c6601366708d80cf2037d65b190550e4783e159fb25f83f45393b43920`;
  * отдельный Worker rebirth сохранил `performance.timeOrigin` и main
    incarnation, но сменил Worker incarnation с `4606ca99…` на `baf59104…`;
  * перед `v6` старый Bun child PID `84400` действительно завершился, новый
    host родил PID `84668` с новым incarnation;
  * `performance.timeOrigin` Window изменился с `1786147675021.8` на
    `1786147723134`, то есть main прошёл настоящий page reload;
  * стабильный Window ID `14f48e14…` сохранился через reload, а main и Worker
    incarnation сменились;
  * после рождения `v6` WSS был `connected`, а Cache Storage содержал `v4`,
    `v5` и `v6`.
* Не утверждается: production Dark/Bulk placement, перенос их State или
  финальный update protocol. Window main в опыте — только lifecycle probe.

## three-embodiment-rebirth.json

* Источник: CDP-состояние Android Window и PID/incarnation, напечатанные двумя
  Bun host process.
* Ожидание: отдельно различимы Worker-only rebirth и полный version rebirth.
* Фактическое наблюдение: файл хранит before/after identity, version, hash,
  `timeOrigin` и признаки смены каждого воплощения.
* Чувствительные сведения: только случайные экспериментальные UUID и локальные
  PID.
* Контрольная сумма:
  `sha256:09f171c8282087103e753463768932d7b20487a14e22f90141f68d40461175a1`.

## android-three-embodiments-v6.png

* Источник: обычный Android viewport после автоматического page reload на `v6`.
* Ожидание: один SHA-256, активные Window main и Dedicated Worker, ready Bun OS
  process, три различимых incarnation и versioned caches.
* Фактическое наблюдение: ожидаемые три оболочки и cache `v4/v5/v6` видимы.
* Чувствительные сведения: только случайные экспериментальные UUID и локальный
  PID.
* Контрольная сумма:
  `sha256:f89b9693ba334e0719af4118e9f12b7ce6238624d018c8a08921652756056968`.

## android-hamiltonian-v3.png

* Источник: `@meta/android` CDP screenshot второй Chrome-вкладки.
* Дата: 2026-08-08.
* Версия проекта: `6776bfb1c53e3122f0c8617a916657cce06a327c` плюс незакоммиченные
  изменения задачи `MF-412`.
* Ожидание: secure context `yes`, control socket `connected`, вторая вкладка
  `candidate`, версия `v3`.
* Фактическое наблюдение: видимая область подтверждает secure context `yes`,
  pre-existing page control, socket `connected`, роль `candidate` и host
  `hamiltonian-lab`; версия расположена ниже мобильного viewport и отдельно
  подтверждена CDP как `v3`.
* Чувствительные сведения: отсутствуют; Chrome UI и другие вкладки не попали в
  изображение.
* Контрольная сумма:
  `sha256:4c0f1a2f418e54dd774ee99c03eeff115ba4f2e51cc1e109dee5ecaf8c7406d3`.
