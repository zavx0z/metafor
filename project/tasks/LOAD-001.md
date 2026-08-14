# LOAD-001 — Загружать браузерный функционал через минимальный Service Worker

## Коротко

Новый браузер получает только минимальные HTML, main-процесс и Service Worker.
Service Worker загружает сменяемый функционал по WSS, готовит его в cache и
предоставляет main-процессу кэшированные endpoints для запуска.

Прежний Hamiltonian остаётся отдельно запускаемым прототипом. Новый loader
создаётся с нуля в чистых source-директориях и не получает перенесённый
prototype-код.

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
* Решением владельца от 14 августа 2026 года весь существовавший Hamiltonian
  признан рабочим прототипом. Его прежняя декомпозиция остаётся evidence, но не
  является основанием для переноса исходников в новую реализацию.

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
* В рабочем дереве уже начато отделение prototype entrypoint как
  `server_proto.ts` и созданы незакоммиченные заготовки новых директорий. Это
  параллельные изменения владельца; они не являются готовым результатом
  LOAD-среза до проверки exact source boundaries и поведения.
* Bun Fullstack Dev Server при импорте HTML в `Bun.serve({routes})`
  автоматически обрабатывает указанные в HTML scripts и styles, выполняет
  runtime bundling и публикует полученные assets. При `development: false`
  результат лениво создаётся по первому HTML request и кэшируется в памяти до
  перезапуска server.
* Официальная Fullstack-документация не определяет Service Worker registration,
  script URL и обязательные для него response headers. Применимость этого пути
  к `web/service` требует отдельного воспроизводимого proof.

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
* Весь ранее написанный Hamiltonian считается прототипом. Он запускается через
  `server_proto.ts`, остаётся рабочим наглядным образцом и не рефакторится;
  прежние `browser`, `core`, `public`, `update`, `visual` и остальные исходники
  также принадлежат прототипу.
* Новая реализация создаётся с нуля рядом в `web`, `server` и `interface` без
  новых package manifests и workspace packages. Вложенные `import`, `service`,
  `update` являются обычными source boundaries.
* Отдельный build pipeline сейчас не создаётся. HTML импортируется прямо в
  `Bun.serve()` как route; Bun может выполнять runtime bundling, но LOAD-код не
  вызывает `Bun.build` и не материализует собственный `dist`.
* `web/import` владеет минимальным main-потоком: получает от Service Worker
  готовый кэшированный endpoint и импортирует модуль.
* `web/service` владеет минимальной неизменяемой оболочкой Service Worker:
  получает код по WSS, проверяет его, готовит кэшированные endpoints и сообщает
  main-потоку о готовности. Вместе `web/import` и `web/service` образуют
  минимальный loader этой задачи.
* `server/import` и `server/service` позднее реализуют тот же принцип для Bun.
  Общий договор выделяется в `interface` только после появления обеих
  реализаций, а не проектируется заранее и не оформляется отдельным пакетом.
* `update` остаётся отдельным механизмом обновления уже загруженного
  функционала и не смешивается с первоначальным `import`.
* Каждый следующий срез берёт один механизм: наблюдает его поведение в
  прототипе, реализует заново в новом пакете, проверяет и только затем открывает
  следующий механизм.

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

Первый зарегистрированный package-срез остановлен до product implementation:
пакеты не создаются. Текущий срез проверяет один выбранный механизм — способен
ли Bun Fullstack обслужить минимальный HTML/main/Service Worker contour без
отдельного build-step. Runtime bundling самого Bun допустим и называется точно.

Только после proof следующий срез фиксирует exact handoff первой navigation:
что делает minimal main, когда страница становится controlled и каким запросом
она узнаёт о готовности cache.

Затем по одному причинному механизму регистрируются WSS loading, cache
preparation, cached endpoint serving, Window launch и Service Worker functional
activation. Каждый новый механизм получает отдельную последовательную
подзадачу и checkpoint.

## Подзадачи

### LOAD-001.1 — Создать чистую пакетную структуру новой реализации

Статус и исполнитель: `STOPPED BEFORE IMPLEMENTATION`; product-исполнитель не
запускался, package manifests и workspace membership не создавались.

Классификация: один structural result в границах `LOAD-001`; новый Hamiltonian
получает физические package boundaries без runtime behavior.

Требование: прототип продолжает запускаться через `server_proto.ts`, а Git и Bun
workspace распознают самостоятельные пакеты `web`, `server`, `interface` и их
`import`, `service`, `update`. Новые пакеты не содержат перенесённого или нового
функционального кода.

Основание и связанная история: прежние `HAM-003`, `UPD-001`, `MF-412` и
`MF-428` описывают только устройство и доказательства прототипа. Решение
владельца требует clean-room реализации и откладывает общий `interface` contract
до появления Web- и Bun-реализаций.

Наблюдаемое расхождение: на проверенном `HEAD` `8b1f381526f7321f3b1009ba4c2feff50ca17d81`
новые packages не зарегистрированы в workspace и не имеют package manifests;
существующий `@metafor/hamiltonian` содержит весь прототип. В рабочем дереве есть
параллельные незавершённые заготовки владельца, которые нужно сохранить и
проверить, а не автоматически принять как результат.

Причина: чистая package architecture принята только текущим owner-решением и
ещё не материализована в каноническом Git-состоянии.

Разрешённое изменение одного механизма: отделить prototype entrypoint и создать
только package manifests, workspace membership и минимальную package-level
проверку новых границ. Не переносить source, не добавлять browser/server
behavior, общие public types или update protocol.

Regression или опровергающее доказательство: package-boundary проверка должна
падать при отсутствии любого заявленного package, при импорте prototype source
из нового дерева или при преждевременном общем implementation contract.

Среда и критерий приёмки: canonical checkout на текущей ветке; prototype tests
и его `server_proto.ts` entrypoint остаются рабочими, Bun workspace видит все
новые packages, а их source inventory пуст от функционального кода.

Фактические действия:

Результат и вывод: владелец отказался от package architecture до product patch.
`web`, `server`, `interface` и вложенные механизмы остаются обычными
source-директориями.

Подготовительный commit: `a90d9adfd`.

Result checkpoint:

### LOAD-001.2 — Проверить loader через Bun Fullstack без отдельной сборки

Статус и исполнитель: `IN_PROGRESS`; руководитель — текущая задача Codex,
реализация после подготовительного project-коммита передаётся внутреннему
субагенту этой задачи.

Классификация: новый диагностический механизм после owner-отказа от packages;
срез принимает воспроизводимый ответ, может ли Bun Fullstack стать первым
server/browser loading path без отдельного build pipeline.

Требование: новый `server.ts` импортирует минимальный `web/index.html` как route
`Bun.serve()`. HTML указывает минимальный main из `web/import`, а Service Worker
script принадлежит `web/service`. Новые directory boundaries не имеют
`package.json`, не входят в workspaces и не импортируют prototype source.

Основание и связанная история: официальный Bun Fullstack contract подтверждает
автоматическую обработку HTML scripts/styles и runtime bundling. Он не описывает
Service Worker, поэтому точная выдача его script URL и headers остаётся
проверяемой гипотезой, а не принятым фактом.

Наблюдаемое расхождение: prototype использует ручной `Bun.build` Service Worker
bundle и множество static routes; новая реализация ещё не доказала ни одного
Fullstack HTML/main request и ни одной Service Worker registration без этого
механизма.

Причина: выбран новый Bun Fullstack loading mechanism, отсутствующий в
прототипе и не покрытый его проверками.

Разрешённое изменение одного механизма: создать минимальный воспроизводимый
Fullstack contour в новых `server.ts`, `web/index.html`, `web/import` и
`web/service`. Допускается только код, необходимый доказать HTML route, main
execution и Service Worker registration/response. Не добавлять WSS delivery,
cache protocol, functional module, `update`, общий `interface` или packages.

Regression или опровергающее доказательство: проверка должна устанавливать,
что HTML обслужен Fullstack route, main фактически выполнился, Service Worker
script получен с допустимым URL и headers и browser зарегистрировал его. Если
Fullstack route не может корректно выдать Worker, срез принимает точную границу
и останавливается; минимально необходимый явный server route сначала отдельно
предъявляется владельцу, а не добавляется автоматически.

Среда и критерий приёмки: canonical checkout и локальный secure browser contour;
prototype продолжает запускаться через `server_proto.ts`, новый contour не
использует prototype imports или отдельный `Bun.build`, а browser evidence
отличает загрузку HTML/main от фактической Service Worker registration.

Фактические действия:

Результат и вывод:

Подготовительный commit:

Result checkpoint:

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

* обычные source-директории `web`, `server`, `interface` и вложенные
  `import`, `service`, `update` без package manifests;
* Bun Fullstack HTML route и runtime bundling без отдельного build pipeline;
* сохранение отдельно запускаемого прототипа через `server_proto.ts`;
* минимальный HTML/main/Service Worker bootstrap;
* один signaling peer и WSS code delivery;
* несколько сменяемых proof parts;
* origin-bound cache и same-origin cached endpoints;
* запуск Window- и Service Worker-частей;
* повторный запуск из уже готового cache.

Не входит:

* рефакторинг или перенос прежнего Hamiltonian в новые source-директории;
* package manifests, workspace packages и package exports новой реализации;
* создание общего `interface` contract до двух реализаций;
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

`LOAD-001` находится в `IN_PROGRESS`. Package-срез `LOAD-001.1` остановлен до
implementation решением владельца. Текущий срез — `LOAD-001.2 — Проверить
loader через Bun Fullstack без отдельной сборки`. Сначала фиксируется этот
подготовительный project-коммит; затем минимальный proof отдельно устанавливает
поведение HTML/main и фактическую возможность зарегистрировать Service Worker.
