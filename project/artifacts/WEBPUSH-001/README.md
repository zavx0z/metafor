# WEBPUSH-001 — Артефакты

## `live-after-push.png`

* Источник: canvas уже открытой clean-вкладки Chrome CDP target
  `2B712B733E5B9CB18CA3DA211578AE05` на
  `https://127.0.0.1:4400/`; снимок получен через внешний diagnostics contour
  без WebGPU Inspector instrumentation.
* Дата: `2026-08-11T09:49:05Z`.
* Версия проекта: base HEAD `413008bcc6540ef0dd4c9f506502be31fea91a2f`,
  финальный pre-commit runtime `webpush-001-result-final-3` из текущего diff;
  загруженный versioned module имеет SHA-256
  `0400c1cb1910399786e5827c7088f37294e7ccb4485df0769e9d70dc480ca394`.
* Ожидание: после реального Web Push граф остаётся живым; одна нода Service
  Worker остаётся внутри Chrome, Web Push и восстановленный WS присутствуют,
  серверные процессы и серверный RTCPeerConnection не выходят из блока
  `Сервер`, а три IPC edge используют один выходной параметр host.
* Фактическое наблюдение: статус страницы `12 нод · 10 связей · живой режим`;
  структура владельцев соответствует ожиданию, Service Worker показывает
  `Push ready`, `heartbeat observed`, `notification shown`, Web Push и WS
  материализованы отдельными связями. После capture подтверждён не только
  исходный reconnect: Chrome штатно завершил внутреннее исполнение, создал
  следующее, а та же Service Worker identity осталась Push-ready без красного
  ложного состояния и без изменения структуры графа.
* Чувствительные сведения: снимок содержит только локальные сокращённые UUID,
  PID и loopback URL; token, VAPID private key и PushSubscription endpoint
  отсутствуют.
* Контрольная сумма: SHA-256
  `95aee930c9cca3b049ee90f7506eacb19b93eb0fff343b6f6e618a3c72f2c3d2`.

## `runtime-evidence.json`

* Источник: авторизованный локальный `/lab/status` того же HTTPS-host и
  DOM-status точной clean-вкладки после вызова `/lab/wake-service-worker`.
* Дата: `2026-08-11T09:49:05Z`.
* Ожидание: одна устойчивая Service Worker identity связывает server send,
  принятие push service и подтверждённый reconnect; pending wake после
  подтверждения отсутствует.
* Фактическое наблюдение: `push-armed → push-sent → push-service-accepted →
  push-reconnect-confirmed` относится к одному `wakeId` и одной identity;
  notification permission равен `granted`, граф остаётся `live`. После
  подтверждённого reconnect зафиксирована смена внутреннего runtime incarnation
  и сохранённый `pushReady: true` в следующем исполнении.
* Чувствительные сведения: сохранены только неавторизующие correlation и
  runtime identity; токен, VAPID keys, subscription keys и endpoint удалены.
* Контрольная сумма: SHA-256
  `984473519e431444dd9b112ab7846517590f477904a7b51cc6f4c40b6bd3f9aa`.
