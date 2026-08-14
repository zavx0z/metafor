# LOAD-001 — Загружать браузерный функционал через минимальный Service Worker

## Коротко

Новый браузер получает только минимальные HTML, main-процесс и Service Worker.
Service Worker загружает сменяемый функционал по WSS, готовит его в cache и
предоставляет main-процессу кэшированные endpoints для запуска.

## Зачем

Первоначальный HTTPS server может быть временным, поэтому настоящий browser
functionality нельзя навсегда загружать напрямую с его static routes. В
браузере должна остаться минимальная неизменяемая оболочка, способная получить
и запустить функционал через действующий Hamiltonian signaling peer.

Сначала нужен independently accepted loader с одним signaling peer. Только
после него `UPD-002` может определить полный многосоставный browser release и
его последующую атомарную смену.

## Связь с дорожной картой

Задача является первым срезом отдельной линии
[`Загрузка Hamiltonian`](../ROADMAP.md#загрузка-hamiltonian) и предшествует
[`UPD-002 — Обновлять всю клиентскую сборку через Service
Worker`](UPD-002.md).

Она развивает первый однодевайсный этап
[`MF-425 — Управлять одной Вселенной на одном устройстве`](MF-425.md), но не
берёт его общую visual/control приёмку и не переходит к нескольким устройствам
из `MF-426`.

## Связанные задачи и история

Evidence-backed gate выполнен в
[`HAM-004 — Собрать целостные требования к Hamiltonian`](HAM-004.md) и
зафиксирован коммитом `548a9ccc7`.

* Закрытая `MF-412` доказала один synthetic versioned module, SHA-256,
  Cache Storage и запуск одинаковых bytes в Window, Dedicated Worker и Bun
  process, но не production loader полного функционала.
* Закрытая `MF-428` доказала browser-managed замену executable Service Worker,
  profile ownership и recovery через Web Push, но не сменяемую исполняемую
  часть внутри неизменяемого Worker.
* Закрытая `UPD-001` только собрала прежний update-код под
  `hamiltonian/update/{shared,host,browser}` и сохранила прежнее behavior.
* `UPD-002` и её первый срез зарегистрированы project-коммитами `22a0be9c5` и
  `0d6d4de20`, но product result отсутствует. Прежняя `.1` начинала с полного
  artifact manifest и остановлена до implementation после owner-решения сначала
  доказать minimal loader.
* `HAM-003` владеет структурой source без изменения behavior, `MF-411` — общим
  законом Hamiltonian, а `MF-425` — средой однодевайсной приёмки; они не
  заменяют предметный loader contract.

## Подтверждённые факты

* Первый navigation request не может обслужить ещё не установленный Service
  Worker, поэтому HTTPS host обязан вернуть минимальный bootstrap.
* Текущие page JavaScript, CSS, orchestration и Worker resources загружаются
  напрямую с host; release cache Service Worker обслуживает только
  `/versions/...` synthetic module.
* Service Worker уже открывает control WSS, сохраняет bootstrap в Cache Storage
  и может быть разбужен Web Push без открытой Hamiltonian Page.
* Browser не позволяет динамически `import()` неизвестный module внутри
  Service Worker, но при разрешающей CSP Worker может выполнить уже проверенный
  source text через `Function()`/`eval()`.
* Уже установленный Service Worker и его storage остаются привязаны к исходному
  origin; новый WSS address является source/transport, а не новым PWA origin.

## Решения владельца

* Направление называется `LOAD`, потому что владеет загрузкой, а не обновлением.
* Минимальный package определяется до полного browser functional release.
* Package состоит из минимальных HTML, main-процесса и неизменяемой Service
  Worker оболочки.
* В первом контуре Service Worker знает один signaling Hamiltonian peer.
* Service Worker загружает сменяемые части по WSS, готовит их в origin-bound
  cache, предоставляет main-процессу кэшированные endpoints и запускает
  предназначенную ему сменяемую часть.
* Minimal main устанавливает связь с Service Worker, запрашивает готовность
  подготовленного cache и запускает предназначенный Window functionality.
* Сменяемый functionality состоит из нескольких частей, а не одного
  обязательного bundle.
* Каталог адресов нескольких signaling peers и peer-security обсуждаются и
  реализуются на следующем сетевом этапе.

## Целевой минимальный путь

1. HTTPS host возвращает минимальные HTML, main и Service Worker.
1. Minimal main регистрирует Worker, дожидается управления страницей и
   запрашивает подготовленный functionality.
1. Service Worker открывает WSS к единственному известному signaling peer.
1. Worker получает сменяемые части, проверяет их и целиком готовит cache.
1. Только готовый cache публикуется как набор same-origin endpoints.
1. Minimal main получает Window entrypoint и запускает его.
1. Service Worker восстанавливает и запускает собственную сменяемую часть из
   того же подготовленного набора.

## Поведение процесса

Первый срез до изменения runtime фиксирует exact минимальные файлы, события и
handoff первой navigation: что делает HTML, что делает minimal main, когда
страница становится controlled и каким запросом она узнаёт о готовности cache.

Затем по одному причинному механизму регистрируются WSS loading, cache
preparation, cached endpoint serving, Window launch и Service Worker functional
activation. Каждый новый механизм получает отдельную последовательную
подзадачу и checkpoint.

## Открытые вопросы

* Какие exact bytes входят в минимальные HTML, main и Service Worker?
* Как первая страница дожидается `activate`/`clients.claim()` и отличает первый
  install от повторного запуска?
* Как выглядит минимальный message contract между main и Service Worker?
* Как WSS передаёт manifest и несколько частей первого proof functionality?
* Как называются cached endpoints и как main получает предназначенный ему
  entrypoint?
* Как Worker атомарно различает preparing, ready и active cache?
* Как восстанавливается готовый functionality после остановки и нового запуска
  Service Worker без доступного WSS?
* Какой минимальный ABI предоставляет сменяемая Worker-часть стабильным
  обработчикам событий?

## Границы

Входит:

* минимальный HTML/main/Service Worker bootstrap;
* один signaling peer и WSS code delivery;
* несколько сменяемых proof parts;
* origin-bound cache и same-origin cached endpoints;
* запуск Window- и Service Worker-частей;
* повторный запуск из уже готового cache.

Не входит:

* полный production artifact inventory и update-transition `UPD-002`;
* каталог или выбор нескольких signaling peers;
* межсерверная координация, распределение VAPID authority и peer security;
* Oracle/Force payload по control/code WSS;
* обновление Bun/OS processes;
* server release, remote rollout, trust root и общий rollback;
* изменение предметного поведения Dark, Boundary, Matrix, Energy или Bulk.

## Критерии готовности

* Первый navigation получает только согласованный минимальный package.
* Minimal main устанавливает Service Worker и не загружает прикладной
  functionality напрямую со static host routes.
* Service Worker получает по WSS от одного signaling peer минимум отдельные
  Window- и Worker-части, проверяет их и публикует только целиком готовый cache.
* Main запускает Window entrypoint через cached endpoint Service Worker.
* Service Worker запускает свою сменяемую часть через согласованный ABI.
* Interrupted или неверная доставка не становится ready/active cache.
* После остановки Worker новый execution восстанавливает готовый functionality
  из cache без повторной обязательной доставки.
* Доказательство явно отделяет minimal loader от будущего полного release и
  multi-peer extension.

## Проверка результата

* Frozen contract tests минимального package и main/Worker handoff.
* WSS tests нескольких частей, interruption, invalid bytes и retry.
* Cache tests preparing/ready/active, atomic publication и cold restoration.
* Service Worker fetch tests cached endpoints.
* Browser test первого install, перехода под Worker control и запуска Window
  functionality без прямой static загрузки.
* Browser test остановки и нового запуска Worker с восстановлением cache.
* Строгие host/WebWorker TypeScript checks и `git diff --check`.
* Живой owner-сценарий в canonical Hamiltonian contour до объявления готовности.

## Текущее состояние и следующий шаг

`LOAD-001` зарегистрирована в `READY`. Product-код не изменён. Следующий шаг —
в отдельной пользовательской задаче LOAD-001 зарегистрировать первый атомарный
contract-срез exact минимального HTML/main/Service Worker bootstrap и записать
подготовительный project-коммит до реализации.
