# Chrome 151 · обычный профиль · HTTPS

## Контур

* Дата: 2026-08-11 (Europe/Moscow).
* Chrome: `151.0.7922.76`, обычный профиль без remote debugging.
* Hamiltonian: `main`, исходная ревизия задачи `c439492e19fdf2767764675fb115793227953a70` с незакоммиченным TypeScript-патчем MF-428.
* Origin: `https://127.0.0.1:4400/`.
* TLS: отдельный доверенный в login keychain сертификат только для `127.0.0.1` и `localhost`; SHA-256 fingerprint `B0:9C:E1:3C:2E:EB:80:68:39:B4:85:3A:6A:11:6B:6B:8C:F0:DB:B9:0A:B3:54:88:C0:4E:0A:68:BC:6A:F1:52`.
* Host epoch: `f21829ea-ccb7-42aa-bd19-9f001f828422`.
* Device: `7ad107c3-36d2-41fc-aaea-e261bf3f51d8`.
* Механизм: Bun host посылает первый WebSocket `ping` после открытия; после соответствующего `pong` следующий `ping` назначается через 20 секунд. HTTP heartbeat, Web Locks, DevTools и Inspector в этом замере не применялись.

## Ожидание

Один и тот же Service Worker и один и тот же control WebSocket остаются живыми дольше 30 секунд в обычном профиле Chrome по HTTPS.

## Наблюдение

```json
{"sample":0,"at":1786402603940,"connectionId":"d83225e7-b5da-44b2-9946-7c6d97fd2d20","workerIncarnationId":"5086f81e-fe67-430e-9af2-1eddadae8f33","lastChallengeSeq":2,"lastAckSeq":2,"opens":1,"closes":0}
{"sample":1,"at":1786402613942,"connectionId":"30f01f5a-58ee-4d5d-acbf-5586be2a950a","workerIncarnationId":"05e1976e-0f5c-437f-ad60-e27de6098bff","lastChallengeSeq":1,"lastAckSeq":1,"opens":2,"closes":1}
{"sample":2,"at":1786402623946,"connectionId":"30f01f5a-58ee-4d5d-acbf-5586be2a950a","workerIncarnationId":"05e1976e-0f5c-437f-ad60-e27de6098bff","lastChallengeSeq":1,"lastAckSeq":1,"opens":2,"closes":1}
{"sample":3,"at":1786402633947,"connectionId":"30f01f5a-58ee-4d5d-acbf-5586be2a950a","workerIncarnationId":"05e1976e-0f5c-437f-ad60-e27de6098bff","lastChallengeSeq":2,"lastAckSeq":2,"opens":2,"closes":1}
```

Оба heartbeat первого соединения были подтверждены, но между соседними
10-секундными samples Chrome закрыл socket и создал другое исполнение Service
Worker. Профиль Chrome и HTTPS не устранили штатное завершение примерно через
30 секунд.

## Повтор после очистки реализации

После возврата продуктового интервала к 10 секундам и удаления ложного
`continuity: confirmed`, fail-closed привязки heartbeat к точной Worker identity
и исправлений ревью HTTPS-host был перезапущен из текущего рабочего дерева.
Локальная и реально отданная финальная сборки совпали побайтно:

```text
sw-entry.js      1ec02387ca3c08caac7fefca9a186f74dc0c8eb36fd1b094b01778058aafec6a
orchestration.js efb8bb41a9dd48368d849d6c74cb0ca56b0ee277b5ce70f0bf2c884f6b1e6164
```

Response `/sw-entry.js` также сохранил `Service-Worker-Allowed: /`,
`Cache-Control: no-cache` и прежний Content Security Policy. Обычная visible
Window оставалась подключена. Bounded host journal для epoch
`07bcb9ab-5a93-40b5-94c6-1d7ce91846e7` снова зафиксировал замену подтверждённых
Worker и WebSocket:

```json
{"sample":0,"at":1786404589301,"connectionId":"9db89471-576d-4f55-bdf3-e9730c10e632","workerIncarnationId":"dd5aebea-fd1c-4653-9005-4080fd36b5eb","lastChallengeSeq":1,"lastAckSeq":1,"opens":2,"closes":1}
{"sample":3,"at":1786404604462,"connectionId":"9db89471-576d-4f55-bdf3-e9730c10e632","workerIncarnationId":"dd5aebea-fd1c-4653-9005-4080fd36b5eb","lastChallengeSeq":3,"lastAckSeq":3,"opens":2,"closes":1}
{"sample":5,"at":1786404614562,"connectionId":"729b0251-c393-4cfb-b58b-d9084298dee2","workerIncarnationId":"4a3be68f-d707-4f49-a7a4-c43b85242d13","lastChallengeSeq":1,"lastAckSeq":1,"opens":3,"closes":2}
{"sample":8,"at":1786404629703,"connectionId":"729b0251-c393-4cfb-b58b-d9084298dee2","workerIncarnationId":"4a3be68f-d707-4f49-a7a4-c43b85242d13","lastChallengeSeq":2,"lastAckSeq":2,"opens":3,"closes":2}
```

Host journal дал точные интервалы `30000 ms` для первого и `30004 ms` для
следующего соединения. Все показанные challenge были подтверждены. Значит,
отрицательный результат относится к финальной свежей сборке и точной Worker
identity, а не к неподтверждённому или устаревшему browser bundle. Сценарий без
Window clients этим повтором не доказан.

## Вывод

WebSocket `ping/pong` не является механизмом постоянной жизни обычного Web Service Worker в проверенном Chrome. Замер опровергает гипотезы о том, что прежние завершения были следствием отдельного CDP-профиля или HTTP-origin.

## Граница `ExtendableEvent.waitUntil`

* [Service Workers Editor's Draft](https://w3c.github.io/ServiceWorker/#service-worker-lifetime)
  связывает lifetime Worker с исполняемыми событиями, а не с удерживаемыми
  ссылками, WebSocket или регистрацией. User agent может завершить Worker, когда
  нет события или обработка превысила его предел.
* [`waitUntil`](https://w3c.github.io/ServiceWorker/#dom-extendableevent-waituntil)
  продлевает только lifetime доверенного текущего `ExtendableEvent`. Для
  синтетического события `isTrusted=false` спецификация требует
  `InvalidStateError`; произвольный WebSocket message таким событием не
  становится.
* [Chromium Service Worker Security FAQ](https://chromium.googlesource.com/chromium/src/+/master/docs/security/service-worker-security-faq.md#do-service-workers-live-forever)
  фиксирует две отдельные границы Chrome: около 30 секунд idle и около 5 минут
  для одного незавершённого event. Поэтому незавершаемый `install`/`activate`
  не создаёт постоянную жизнь: он блокирует lifecycle и всё равно ограничен
  браузером.

Следовательно, `ExtendableEvent` не является недостающей доставкой для
причинного Bun `ping`: обычный сервер не может породить доверенное браузерное
Service Worker event без отдельной web-platform capability (например, Push),
поэтому этот отрицательный замер обосновал принятое позже решение использовать
Web Push как явный путь пробуждения. Он не является отрицательным доказательством
против Push.
