# MF-428 — Артефакты

Все четыре изображения предоставлены владельцем в начале обсуждения задачи.
Они являются небольшими фрагментами одной текущей ноды и не содержат полного
доказательства lifecycle Service Worker.

Отдельный runtime-замер находится в
[`chrome-151-ordinary-https-lifetime.md`](chrome-151-ordinary-https-lifetime.md).

## closed-tab-web-push-lifetime.json

* Источник: 151 последовательный авторизованный `/lab/status` sample с
  интервалом 2 секунды, события того же host и точное CDP-закрытие вкладки
  Hamiltonian. Chrome продолжал работать с одной пустой вкладкой; Page и Window
  clients Hamiltonian всё время отсутствовали.
* Дата: 2026-08-11, `11:28:23Z`–`11:33:29Z`.
* Версия проекта: clean runtime commit
  `a343bb1ecc1d9d4fd60e6076015b8fc2142ccad0`, Git tree
  `df1f4d0abb024a0b2b62fbfed9c42634ae8e2ff4`, Chrome
  `151.0.7922.76`.
* Ожидание: после закрытия вкладки и штатного исчезновения прежнего WSS реальный
  Web Push пробуждает ту же зарегистрированную Service Worker entity,
  восстанавливает причинно новый WSS и позволяет измерить его фактическую
  жизнь без помощи Page.
* Фактическое наблюдение: Push подтвердил reconnect за `803 ms`; новая runtime
  incarnation сохранила worker identity, а WSS прожил `40.046 s`, подтвердив
  четыре heartbeat ACK. После закрытия WSS ещё `250.840 s` не было ни одного
  автоматического reconnect без второго Push. Во всех 151 samples число
  Hamiltonian Window clients было равно нулю.
* Чувствительные сведения: bearer token, VAPID private key, PushSubscription
  endpoint/keys, payload, capability и `wakeProof` не сохранены. Raw stream
  проверен поиском secret-shaped полей; сводка ссылается на
  обезличенные исходники в Git и их SHA-256.
* Контрольная сумма: SHA-256
  `09d9cd9e7d6cf62806254bbbd5095491b38483f151ebae46448b287b1dd98081`.

## closed-tab-web-push-lifetime/

* Источник: обезличенные raw-файлы того же 151-sample замера:
  `samples.jsonl`, `status-final.json`, `wake-response.json`, `baseline.json` и
  `idle.json`. Полные host snapshots не хранятся: три snapshots содержат
  только allowlisted causal evidence.
* Дата: 2026-08-11, `11:28:23Z`–`11:33:29Z`.
* Версия проекта: clean runtime commit
  `a343bb1ecc1d9d4fd60e6076015b8fc2142ccad0`, Git tree
  `df1f4d0abb024a0b2b62fbfed9c42634ae8e2ff4`, Chrome
  `151.0.7922.76`.
* Ожидание: сохранить долговечный источник, из которого независимо
  пересчитываются 151 samples, `803 ms`, `40.046 s`, четыре heartbeat
  ACK и `250.840 s` без reconnect.
* Фактическое наблюдение: все 151 строк JSONL и четыре JSON-файла
  валидны; их контрольные суммы совпадают со сводкой.
* Чувствительные сведения: full `topology`, `peer`, authority, fencing,
  lease, server embodiments, Push public key/subscriptions и полная история
  событий исключены allowlist-проекцией. Secret-shaped поля и значения
  поиском не найдены; endpoint, keys, bearer token, private key, payload,
  capability и `wakeProof` отсутствуют.
* Контрольные суммы SHA-256:
  `samples.jsonl` — `b3ad35b18b6de179e33851ef937de50b664d91664a1841a66ec76d4514deca1c`;
  `status-final.json` — `b70ef6090497644c43c824ca2f0dc92cb0fcbf0cdb869457a1f2cc70b8821539`;
  `wake-response.json` — `07b8a53d74633949f2e011bc96200829caac451769cc5baafdbc9616b8ef1f91`;
  `baseline.json` — `82d6696e2724c2c3c4484c0ff6b64a3c25089e570f4d33a9a188715c323fc7c3`;
  `idle.json` — `c00b0db995efa1b6475f995dc50305f0ea90ff6d6cded4ab52a791bc74c3e022`.

## service-worker-parent-stability.md

* Источник: визуальное наблюдение владельца и bounded `/lab/status` текущего
  HTTPS-host после исправления.
* Дата: 2026-08-11.
* Версия проекта: `b53e057346d62c67a425b9f48a2255ed5966062c` с рабочим исправлением MF-428.
* Ожидание: штатная смена внутреннего исполнения и WSS не меняет browser parent
  одной ноды Service Worker.
* Фактическое наблюдение: за 100 секунд Chrome трижды сменил runtime и WSS при
  неизменных worker/device identity; все lifecycle-эмиттеры и регрессионная
  проекция сохраняют один `browser:*` owner. Автоматический screenshot не
  получен из-за macOS Automation error `-1743` и не заявлен как доказанный.
* Чувствительные сведения: token, VAPID private key, PushSubscription endpoint
  и wake proof не сохранены.
* Контрольная сумма: `a976e1e22185c97cb805aa8fd1285274d8397c0b28363e156a3cf764a205e14d`.

## web-push-wake-ordinary-chrome.md

* Источник: bounded `/lab/status` текущего HTTPS-host, exact targeting обычного
  Chrome через локальные macOS services и read-only профильные настройки
  Notifications/GCM.
* Дата: 2026-08-11.
* Версия проекта: `c439492e19fdf2767764675fb115793227953a70` с рабочим патчем MF-428.
* Ожидание: Bun Web Push запускает тот же зарегистрированный Service Worker и
  восстанавливает WSS после закрытия Hamiltonian Page/Window clients.
* Фактическое наблюдение: при `0` Hamiltonian clients подтверждена цепочка
  `push-sent → новый runtime → новый WSS → push-reconnect-confirmed` той же
  identity. При строгих `0` окнах Chrome два отдельных Push завершились
  timeout; эта более сильная граница среды не объявлена принятой.
* Чувствительные сведения: bearer token, VAPID private key, полная
  PushSubscription и `wakeProof` не сохранены.
* Контрольная сумма: `20f53ecd401af451a219ed5b729458e80b13bcfafe4303f0a65d6487b57e7352`.

## chrome-151-ordinary-https-lifetime.md

* Источник: bounded `/lab/status` текущего Hamiltonian host, побайтовое
  сравнение локальных и реально отданных browser bundles и первичные документы
  W3C/Chromium, ссылки на которые сохранены внутри файла.
* Дата: 2026-08-11.
* Версия проекта: `c439492e19fdf2767764675fb115793227953a70` с рабочим патчем MF-428.
* Ожидание: тот же обычный Service Worker и control WebSocket остаются живыми
  дольше штатной 30-секундной idle-границы Chrome по доверенному HTTPS.
* Фактическое наблюдение: подтверждённый causal heartbeat не предотвратил
  повторную замену Worker и WebSocket примерно каждые 30 секунд.
* Чувствительные сведения: token и private key не сохранены; device, Worker,
  WebSocket и host epoch являются случайными локальными identity стенда.
* Контрольная сумма: `f0e65f286ded33229baac7ce8a0ff31df823ebbecde637551cc9f7671374942a`.

## service-worker-incarnation.png

* Источник: снимок экрана владельца от 2026-08-11 00:34:03 (Europe/Moscow).
* Дата: 2026-08-11.
* Версия проекта: `8b79f61fd10b5602c3012d7f4b21abe0692edf98`.
* Ожидание: зафиксировать, как текущая нода сообщает identity воплощения.
* Фактическое наблюдение: показано сокращённое значение «Воплощение» без
  объяснения его жизненного цикла.
* Чувствительные сведения: отсутствуют; значение является локальной runtime
  identity.
* Контрольная сумма: `38435a8de462689e0199f1d40bb6a61cfb1949df875c921ef8db5c7be4015f73`.

## service-worker-title.png

* Источник: снимок экрана владельца от 2026-08-11 00:34:12 (Europe/Moscow).
* Дата: 2026-08-11.
* Версия проекта: `8b79f61fd10b5602c3012d7f4b21abe0692edf98`.
* Ожидание: зафиксировать заголовок текущей ноды Service Worker.
* Фактическое наблюдение: в одной строке одновременно показаны `Service Worker`
  и `ServiceWorkerGlobalScope`, но их различие не объяснено.
* Чувствительные сведения: отсутствуют.
* Контрольная сумма: `5d9cc8dab52a01926e487a5d3c2abe44132be1beb2fc574b56d6f0db96032867`.

## service-worker-kind.png

* Источник: снимок экрана владельца от 2026-08-11 00:34:19 (Europe/Moscow).
* Дата: 2026-08-11.
* Версия проекта: `8b79f61fd10b5602c3012d7f4b21abe0692edf98`.
* Ожидание: зафиксировать отдельное отображение технического kind выбранной
  ноды.
* Фактическое наблюдение: `ServiceWorkerGlobalScope` повторяется отдельно и не
  связывается с конкретным воплощением.
* Чувствительные сведения: отсутствуют.
* Контрольная сумма: `a7e0365552b00e5a13af4f3aa831114aff379ed3d2e4f0ec490e3c3a9eabccf2`.

## service-worker-ws-port.png

* Источник: снимок экрана владельца от 2026-08-11 00:34:50 (Europe/Moscow).
* Дата: 2026-08-11.
* Версия проекта: `8b79f61fd10b5602c3012d7f4b21abe0692edf98`.
* Ожидание: зафиксировать, как текущая нода объясняет WebSocket.
* Фактическое наблюдение: двусторонний WebSocket представлен значением
  `выход`, которое может быть понято как направление всего трафика.
* Чувствительные сведения: отсутствуют.
* Контрольная сумма: `8474f78feeef53e57cdd2e37efe8671fbf3564a5242bbdb38b9d9d07cdc2a8a8`.

## ordinary-chrome-https-before-listener.png

* Источник: снимок экрана владельца от 2026-08-11 01:55:02 (Europe/Moscow).
* Дата: 2026-08-11.
* Версия проекта: `c439492e19fdf2767764675fb115793227953a70` с рабочим патчем MF-428.
* Ожидание: открыть Hamiltonian по HTTPS в обычном профиле Chrome.
* Фактическое наблюдение: до запуска TLS listener обычный Chrome получил
  `ERR_SSL_PROTOCOL_ERROR` от HTTP listener на том же порту.
* Чувствительные сведения: отсутствуют.
* Контрольная сумма: `aa4a29063bbf73e86a8c3fce75e8473b64099d868dfff7dfdc3201a2d31cdd94`.
