# WEBPUSH-001 — Артефакты

## `live-after-push.png`

* Источник: canvas уже открытой clean-вкладки Chrome CDP target
  `2B712B733E5B9CB18CA3DA211578AE05` на
  `https://127.0.0.1:4400/`; пиксели получены через внешний diagnostics
  contour без WebGPU Inspector instrumentation и без открытия другого окна.
* Дата: `2026-08-11T10:36:42Z`.
* Версия проекта: clean commit
  `a343bb1ecc1d9d4fd60e6076015b8fc2142ccad0`, Git tree
  `df1f4d0abb024a0b2b62fbfed9c42634ae8e2ff4`; host запущен с полным commit
  как `HAMILTONIAN_VERSION`, а точные SHA-256 browser-бандлов перечислены в
  `runtime-evidence.json`.
* Ожидание: полный граф содержит 12 нод и 10 связей; Service Worker находится
  внутри Chrome, серверный `RTCPeerConnection` — внутри `Peer process` и блока
  `Сервер`, orphan root отсутствуют, Web Push и WSS являются разными edges.
* Фактическое наблюдение: `12 нод · 10 связей · живой режим`; структура
  владельцев совпала с ожиданием, Service Worker показывает `Push ready`, а
  после штатной смены внутреннего исполнения сохранил ту же identity и
  `pushReady: true`. Выпавших нод и ошибки `NO_LEGAL_LAYOUT` нет.
* Чувствительные сведения: снимок содержит только локальные сокращённые UUID,
  PID и loopback URL; token, VAPID private key, PushSubscription endpoint и
  subscription keys отсутствуют.
* Контрольная сумма: SHA-256
  `236ea270aa631340052c954c78399920f09d050b8ac812c2b6d28fe0821087ba`.

## `runtime-evidence.json`

* Источник: авторизованный локальный `/lab/status`, Cache bootstrap и DOM-status
  той же точной вкладки после реального `/lab/wake-service-worker`; Git tree,
  host source и каждый отданный browser-бандл связаны отдельными SHA-256.
* Дата: `2026-08-11T10:36:42Z`.
* Версия проекта: result boundary
  `347fca844567074652be18768133ad0ece1a369f` →
  `dac31433bb4b1bddaf637f50f257a468e2e700c7` →
  `a343bb1ecc1d9d4fd60e6076015b8fc2142ccad0`; runtime запущен из последнего
  чистого коммита.
* Ожидание: одна устойчивая Service Worker identity связывает server send,
  принятие push service и подтверждённый reconnect; после завершения этого
  исполнения новый runtime восстанавливает Push-ready bootstrap; pending wake
  отсутствует, а проекция остаётся `12/10`.
* Фактическое наблюдение: `push-armed → push-sent → push-service-accepted →
  push-reconnect-confirmed` относится к wake `476ab1f7…`; Chrome затем сменил
  runtime `22018090…` на `bc3016a7…`, сохранив identity
  `8f762ecc…`, подписку, controller и `bootstrap.pushReady: true`.
* Чувствительные сведения: сохранены только неавторизующие correlation и
  runtime identity; token, resume nonce, VAPID keys, subscription keys,
  endpoint и payload удалены.
* Контрольная сумма: SHA-256
  `e0eb450ae9e04026b281e9cbe389a211629f2d40306fbe1764019e33b8cc01d5`.
