# Web Push wake · обычный Chrome · HTTPS

## Контур

* Дата: 2026-08-11 (Europe/Moscow).
* Chrome: `151.0.7922.76`, обычный профиль `MetaFor`, без remote debugging,
  DevTools, extension и WebGPU Inspector instrumentation.
* Hamiltonian: `main`, исходная ревизия задачи
  `c439492e19fdf2767764675fb115793227953a70` с рабочим патчем MF-428.
* Origin: `https://127.0.0.1:4400/` с принятым профилем TLS-сертификатом.
* Финальный host epoch: `446f3b66-ceaf-4ee5-ac57-768a7371c57b`.
* Устойчивая identity Service Worker:
  `72452957-2367-4718-90ce-eb508548ef34`.
* Device: `7ad107c3-36d2-41fc-aaea-e261bf3f51d8`.
* Push service: `https://fcm.googleapis.com`; VAPID identity и подписка были
  восстановлены Bun из локального ignored storage с правами `0600`.

## Исходное состояние

После перезапуска Bun-host страница получила свежую сборку, а сам
идентифицированный Service Worker зарегистрировал существующую
`PushSubscription` через свой control WSS. HTTP endpoint регистрации подписки
в этом патче отсутствует.

Перед закрытием Hamiltonian Page сервер наблюдал:

```json
{
  "workerIdentity": "72452957-2367-4718-90ce-eb508548ef34",
  "workerRuntimeIncarnation": "e98965d5-6fe3-4a15-a52b-7757674bfe27",
  "connectionId": "99423d0e-8441-4da4-b91b-d55a8d1993cd",
  "push": "ready"
}
```

После перевода единственной вкладки на `chrome://newtab` и штатного idle timeout
Hamiltonian Page/Window clients и control connections стали пустыми.
PushSubscription осталась зарегистрирована.

## Строгий опыт с нулём окон Chrome

Chrome process `564` продолжал работать, но видимых окон было `0`. После
отправки Push с `wakeId=1a284e31-dfc7-4c8c-a660-e1f3a4631727` Bun записал
`push-armed` и `push-sent`; за 90 секунд не появилось ни одного control
connection, после чего был записан `push-reconnect-timeout`.

Опыт был повторён после успешной доставки, нового idle timeout и 35 секунд при
нуле окон. Push `ab81c1fd-2484-4418-95d5-479445fc7b81` также не запустил
Service Worker. Это отрицательное наблюдение нельзя выдавать за готовность
строгого сценария «ноль окон браузера».

Профиль при этом сохранял разрешение Notifications и GCM-регистрацию origin.
Chrome documentation допускает wake без открытой страницы, но требует
работающий desktop Chrome. В этом локальном профиле один живой browser process
без окон не обеспечил фактическую доставку; фоновый browser mode требует
отдельного owner-решения или настройки среды.

## Успешный опыт без Hamiltonian Page

В финальном прогоне того же обычного процесса и профиля было открыто только
пустое окно Chrome
`Новая вкладка`; Hamiltonian Page/Window clients и topology windows оставались
пустыми. Bun отправил один Push:

```json
{
  "wakeId": "e558d3af-f8c3-474c-9b84-1527e793f096",
  "pushSentAt": 1786416316076,
  "pushReconnectConfirmedAt": 1786416316550,
  "workerIdentity": "72452957-2367-4718-90ce-eb508548ef34",
  "workerRuntimeIncarnation": "5f9e0d0a-66a4-4f14-9d16-47bdb109001d",
  "connectionId": "eaf76588-a993-4492-ac53-ccf68f63426a",
  "topologyWindows": 0
}
```

За `474 ms` после `push-sent` сервер получил новый WSS, проверил одноразовые
`wakeId` и скрытый `wakeProof`, связал их с тем же зарегистрированным Service
Worker и отправил `wake-confirmed`. Только после этого Service Worker показал
успешное уведомление. Его browser-managed runtime и WSS изменились, устойчивая
identity осталась прежней, Page не появилась.

## Проверяемый вывод

Техническая цепочка MF-428 реализована и фактически работает без Hamiltonian
Page: `Web Push → browser-managed SW execution → новый WSS → server ACK`.
Одновременно текущий профиль не прошёл более строгую проверку с нулём окон
Chrome. До решения фонового browser mode задача не должна объявлять этот более
сильный сценарий принятым.

Секретный bearer token, VAPID private key, полная PushSubscription и
одноразовый `wakeProof` в артефакт не сохранены.

## Первичные источники

* [Chrome: Push Notifications on the Open Web](https://developer.chrome.com/blog/push-notifications-on-the-open-web)
  описывает запуск Service Worker без открытой page и оговаривает, что desktop
  Chrome должен работать.
* [Chromium Service Worker Security FAQ](https://chromium.googlesource.com/chromium/src/+/master/docs/security/service-worker-security-faq.md#do-service-workers-live-forever)
  описывает idle-завершение Worker и Push как browser event, способный снова
  его запустить.
