# MetaFor: дорожная карта Graph, Oracle и Force

Этот файл содержит текущую архитектурную линию и крупный порядок ещё не
выполненной работы. Завершённые этапы, журналы запусков, старые коммиты и
заменённые решения здесь не хранятся. Исполнимые пункты находятся в
[`TODO.md`](TODO.md), а ещё не принятые направления — в
[`BACKLOG.md`](BACKLOG.md).

## Источники истины

При расхождении действует порядок из [`docs/README.md`](../docs/README.md):

1. документ-владелец домена;
1. публичные типы;
1. код и проверки;
1. TypeDoc;
1. эта дорожная карта и граф исполнения.

Дорожная карта не меняет доменный закон сама по себе. Новое обязательное
понятие сначала должно появиться в документе-владельце, затем в типах, коде и
проверках.

## Действующая основа

* Canonical Meta является отдельным peer Git-репозиторием
  `cluster/<owner>/<repository>`.
* Canonical `src` имеет ровно два сегмента `<owner>/<repository>`.
* Композиция выполняется через Meta, Matter и Oracle references, а не через
  вложенные Git-репозитории.
* Boundary является каноническим состоянием работающей Вселенной. `meta.ts`
  является автоматически поддерживаемой source projection принятых structural
  patches, а Git фиксирует её отдельной owner-gated capability.
* Dark переносит Boundary отдельные Inflaton particles. Dark, Matrix, Energy и
  Bulk не читают SQLite Boundary напрямую.
* Одна изменённая сущность передаётся одним `ForceMessage` с одной Particle.
* Force связывает домены, но не заменяет их локальные силы и ответственность.
* Доверенный локальный агент уже может читать Graph и source revisions, создавать
  пустую canonical Meta и через `meta.matter.apply` добавлять, перемещать и
  удалять точные rooted occurrences полного Matter tree. WIMP, fuzzy, axion,
  macho, bindings, вложенность и значимая sibling position проходят один
  live-first patch с автоматической source projection; move сохраняет
  физические runtime identities.
* `meta.declaration.apply` проводит metadata, optional Field, State composition,
  Mass, Reaction, Process и Bulk. Process `add/replace` принимает закрытый
  descriptor, inline handlers и один owned `actions/*.ts`; `meta.ts` и action
  artifact публикуются как source targets того же принятого patch. Вложенные
  Variant и Transition/Condition остаются составом одной принятой entity
  Inflaton, а source, Boundary и нужные runtime domains получают проекции того
  же patch.
* Предметная RPC-поверхность одного доверенного агента функционально полна:
  `meta.field.value.apply` принимает точный Field input, а
  `meta.process.execution.read` наблюдает причинно связанный исход Process.
* Одна полная рабочая сессия без скрытого контекста доказана через настоящий
  Oracle RPC-контур с реальными Matrix, Energy, Boundary, Dark и Bulk: explicit
  envelope, structural source projection, Field, State/Process, history delta,
  Mass и Bulk evidence проверяются одним вызывающим RPC source.
* Process-bound `photon/test` теперь проявляет вычисленный State в Bulk Store;
  визуальная проекция не требует несуществующего предыдущего `photon/replace`.
* Четыре начальных чтения Boundary сериализованы с `materialize`: Matrix, Energy,
  Bulk и Graph получают целиком один committed срез, а не строки соседних
  моментов.

## Graph

Graph является единой семантической read-only проекцией структуры Вселенной
для агента. Он собирается при запросе и не становится вторым каноническим
Store. Graph доступен через Dark Oracle RPC и входит в единую
RPC-поверхность Oracle. Это не меняет provider и не
назначает Bulk обязательным посредником.

Graph содержит:

* один canonical root;
* полную компактную декларацию Meta;
* текущие materialized Atom, их State и присутствующие Field values;
* смысловой порядок только там, где он влияет на исполнение или
  материализацию;
* Matter relations без выдачи внутренних идентификаторов Boundary.

Graph не содержит:

* SQLite и Boundary identities;
* Mass bytes и живые Energy objects;
* историю Particle;
* скрытые сведения прошлой агентной сессии;
* отдельную сцену Bulk или данные Renderer.

`Dark.readGraph` принимает пустой запрос. Текущий root определяют Boundary и
Dark, а не клиент. Неполное чтение является выборкой из того же Graph, а не
новой схемой данных.

Следующий функциональный шаг — ограниченная релевантная проекция для слабой
локальной модели. Она сохраняет ту же Graph-семантику, но по public semantic
target, operation class и budget возвращает только необходимые template,
runtime occurrence и минимальное Matter closure с явной границей усечения.
Новая access policy и конкурентные чтения в эту задачу не входят:
[`MF-407`](tasks/MF-407.md).

## Hamiltonian и воплощения

Рабочее целевое направление отделяет причинный contour Вселенной от
метауровня, который рождает, размещает, знакомит, обновляет и заново воплощает
его части. Рабочее имя этого целого — Hamiltonian. Точность классического имени
и границы его проектного применения закрепляет
[`MF-411 — Определить, что делает Hamiltonian и где он работает`](tasks/MF-411.md).

Hamiltonian развивается тремя последовательными этапами:

1. управляет одной Вселенной, чьи серверные и браузерные части работают на одном
   физическом устройстве;
1. распределяет ту же одну Вселенную между несколькими физическими устройствами;
1. управляет несколькими самостоятельными Вселенными и их связями как одной
   Мультивселенной.

Первым этапом владеет
[`MF-425 — Управлять одной Вселенной на одном устройстве`](tasks/MF-425.md).
Второй этап зарегистрирован как
[`MF-426 — Распределить одну Вселенную между несколькими устройствами`](tasks/MF-426.md),
а третий — как
[`MF-427 — Управлять несколькими Вселенными`](tasks/MF-427.md).
Каждый следующий этап начинается только после доказанного предыдущего.

Агентная или другая предметная система создаётся внутри Вселенной по правилам
MetaFor Create. Она не является отдельным инфраструктурным уровнем рядом с
Вселенной. Одну Вселенную образуют её Boundary, Dark, Matrix, Energy, Bulk и
созданные внутри неё Meta, Atom и Matter независимо от того, в скольких средах
и на скольких устройствах они воплощены.

Hamiltonian может иметь Bun-, Service-Worker- и Window-воплощения, оставаясь
одним целым. Он выдаёт startup и versioned code, переносит signaling,
выбирает место запуска и инициирует новое воплощение. Он не становится
каноническим Store, не принимает Particle вместо Dark и не остаётся relay
обычного realtime-трафика после знакомства доменов.

Текущий runtime после `MF-409` сохраняет один listener Dark на Вселенную.
Целевая гипотеза переносит один фиксированный внешний listener в Bun-воплощение
Hamiltonian. Domain embodiments не получают собственных фиксированных
HTTP/WebSocket servers; после signaling они соединяются непосредственно с
Dark. «Один внешний port» не означает отсутствие исходящих sockets, ICE,
STUN/TURN или других временных transport paths.

В целевой browser-топологии Service Worker координирует Window clients,
выбранное Window может нести единственное активное воплощение Dark, а Bulk
воплощается для конкретного наблюдателя в Dedicated Worker. На Bun-платформе
домены остаются обычными OS processes, чтобы их можно было отлаживать без Bun
Workers. Для обеих платформ сохраняются одинаковые semantic contracts, но
platform lifecycle и transport adapters могут различаться.

Принята только последовательность:

1. зафиксировать закон, identity и authority Hamiltonian;
1. выполнить изолированный опыт control plane без переноса production-доменов;
1. по фактам опыта уточнить Oracle, identity и peer routing;
1. только затем принять transport и migration slices.

Первый standalone-эксперимент завершён. Его действующие законы,
доказанные границы и недоказанные production-свойства закреплены в
[`hamiltonian/README.md`](../hamiltonian/README.md). Placement production-доменов
и переход listener остаются отдельной будущей работой.

Структурную границу самого Hamiltonian закрепляет
[`HAM-003 — Разделить Hamiltonian по средам исполнения и механизмам`](tasks/HAM-003.md).
Она сохраняет одну штатную команду запуска, но отделяет тонкие entrypoints и
runtime composition от HTTP/REST, publication, control, lifecycle, process,
peer, browser page и Worker-механизмов. Работа не меняет их предметную
семантику попутно с переносом и не поглощает отдельные visual- и update-задачи.

### Наблюдаемость и управление Hamiltonian

Доказанный standalone contour развивается в верхнеуровневый `/hamiltonian` с
отдельной интерактивной страницей оркестрации. Страница показывает фактически
наблюдаемую инфраструктуру как WebGPU HUD-сцену MetaFor Engine, а не как
статическую документационную диаграмму.

Универсальная модель и логика node-system принадлежат пакету `nodes`.
`@nodes/ui` владеет intrinsic card measurement, viewport и renderer-компонентами,
а `@nodes/layout` получает минимальный ELK-like `LayoutGraph` с уже измеренными
node sizes и port offsets, единолично вычисляет node/compound/gateway/edge
coordinates и возвращает exact parameter-socket routes. В Hamiltonian renderer
измеряет загруженный шрифт на main thread, а полный placement/routing выполняет
отдельный browser Worker через числовой structured-clone contract без UI
document и text metrics. WebGPU только отображает и локально скругляет готовые
waypoints; ручной drag остаётся отдельной generic возможностью surface и
выключен в Hamiltonian. Смысл host, Service Worker, Window, Bun process, peer и
lifecycle actions остаётся у Hamiltonian.
`pkg/visual` не становится владельцем инфраструктурного графа мира.
Hamiltonian-specific projection, composition, presentation и HUD собираются в
`hamiltonian/visual`; невизуальные lifecycle, control и startup остаются в
orchestration.

Browser-local realtime проекции идёт через versioned `BroadcastChannel`. Это
не новый Oracle или Force transport: channel не переносит причинные payload,
signaling, secrets или authority и не заменяет существующие WSS, MessagePort,
Bun IPC и direct peer paths. Управляющие действия добавляются по одному через
направленный проверяемый control path.

Первый интерактивный срез реализован и проверен на живой сцене: полный
responsive layout при структурном обновлении, сохранение presentation state,
exact-socket routing и локальные действия Inspector работают в одном
Hamiltonian contour. Дальнейшую детализацию topology и каждую новую
управляющую операцию владелец принимает как отдельный owner-gate.
Причинная topology всех Hamiltonian-контуров должна собираться только из их
текущих деклараций: новая incarnation одного logical contour атомарно заменяет
прежнюю, тогда как независимые контуры остаются раздельными. Этот общий закон и
его поэтапное применение принадлежат
[`HAM-001 — Удерживать одну декларацию нодовой системы каждого
контура`](tasks/HAM-001.md),
а не presentation, renderer или `@nodes/layout`.
Текущая работа
[`MF-424 — Визуально довести Hamiltonian вместе с владельцем`](tasks/MF-424.md)
одновременно уточняет управление одной Вселенной на серверной и браузерной
стороне одного устройства и строит его причинно точное визуальное
представление. Она является частью `MF-425`, а не отдельной декоративной схемой.

Физическая универсальность node-system принадлежит
[`NODES-009 — Разделить библиотеку нод для разных способов представления
графа`](tasks/NODES-009.md). Закрытые срезы `NODES-009.1`–`NODES-009.5` уже
зафиксировали необходимую package-границу и разблокировали
[`HAM-002 — Собрать визуальный слой Hamiltonian в одном контуре`](tasks/HAM-002.md)
для независимого запуска, хотя родитель `NODES-009` остаётся открытым для
дальнейшей работы владельца. `HAM-002` собирает под `hamiltonian/visual`
оставленные после NODES-009 product-specific projection, composition, панели,
стили и live presentation. Она не забирает generic
model, validation, geometry, renderer primitives или layout laws из `nodes` и
не заменяет поэтапную owner-приёмку `MF-424`. Старый fallback screen удаляется:
нодовая система остаётся единственным отображением Hamiltonian.

### Загрузка Hamiltonian

Весь существовавший до линии `LOAD` Hamiltonian является рабочим прототипом.
Он остаётся наглядным образцом, запускается через `server_proto.ts` и не
рефакторится в новую реализацию. Прежние `browser`, `core`, `public`, `update`,
`visual` и остальные исходники сохраняют только границу прототипа и evidence;
они не являются source base нового Hamiltonian.

Новая реализация создаётся с нуля рядом в source-директориях `web`, `server` и
`interface`. Browser code проходит три последовательных уровня: неизменяемый
`startup`, environment-specific `import` и сменяемый `runtime`. Startup
реализуют `web/startup/main` и `web/startup/service`, importers —
`web/import/main` и `web/import/service`; server-аналоги появляются позднее, а
общий договор выделяется в `interface` только после двух фактических
реализаций. Минимальные browser entrypoint оформлены отдельными
workspace-пакетами `@startup/main`, `@startup/service`, `@import/main` и
`@import/service` со строгой проверкой для своей среды. Runtime состоит из
разных функциональных packages: их имена не зеркалят execution context, а один
package может размещаться в Window, Dedicated Worker или Service Worker.
Фиксированные runtime-пакеты `@web/main` и `@web/service` не создаются.

Fullstack runtime bundling HTML/main отклонён после появления Bun HMR и
неподходящего runtime URL importer. `server.ts` выдаёт неизменяемый HTML и
заранее собранные `startup-main.js` и `startup-service.js`; сами browser-пакеты
не владеют Hamiltonian server, WebSocket update protocol или полным release
mechanism.

Отдельная линия `LOAD` владеет первоначальной загрузкой браузерного функционала
Hamiltonian. Первый HTTPS response доставляет только минимальные HTML и startup
entrypoints. Startup запускает importers в Window и Service Worker; они получают
runtime packages согласованным transport, проверяют и сохраняют их до запуска в
выбранном Window, Dedicated Worker или Service Worker context. Первоначальные
runtime packages через Service Worker importer доставляются по WebSocket.

Первый этап использует один signaling Hamiltonian peer и не проектирует каталог
адресов нескольких peers. Его результатом владеет
[`LOAD-001 — Загружать браузерный функционал через минимальный Service
Worker`](tasks/LOAD-001.md). После доказанного loader contract линия обновлений
может определять полный многосоставный browser release и его атомарную смену.

### Обновления Hamiltonian

`update` является отдельным от первоначального `import` механизмом обновления
уже загруженного функционала. Существующий `hamiltonian/update` относится к
прототипу и не переносится в новую реализацию. Новые `web/update`,
`server/update` и `interface/update` начинают наполняться только собственными
последовательными срезами после появления соответствующего загрузочного
поведения.

Следующий локальный update-шаг начинается после `LOAD-001` и передаёт Service
Worker ответственность за весь многосоставный выпуск клиентской сборки. Host
атомарно публикует manifest точных файлов и хешей, Service Worker загружает и
проверяет полный выпуск, переключает обслуживаемую версию только после
готовности всех файлов и сообщает страницам о необходимости одного reload.
Ручная версия отдельного испытательного модуля и самостоятельное решение
страницы по host source fingerprint после этого не остаются параллельными
механизмами браузерного обновления. Этим результатом владеет
[`UPD-002 — Обновлять всю клиентскую сборку через Service
Worker`](tasks/UPD-002.md).

## Oracle и Force

Текущая Oracle является единой RPC-поверхностью Dark и содержит чтения,
намерения и служебные coordination operations. Одно имя не стирает
различие их outcomes:

* Oracle отвечает на вопросы о уже имеющемся состоянии и evidence;
* Oracle может принять или отклонить намерение, способное начать изменение;
* Force переносит принятое причинное событие и его следствия;
* Boundary фиксирует канонический факт.

Ответ или admission Oracle не равен каноническому факту. Oracle и Force могут
идти по одному физическому carrier как два отдельных логических канала; demux
выполняется один раз на transport boundary.

Реализован один слушающий Dark server на Вселенную:
Boundary, Matrix, Energy и Bulk подключают к нему отдельные исходящие Oracle и
Force WebSocket без собственных HTTP listeners, а browser ingress Bulk проходит
через Dark gateway. Реализация сохраняет payload и routing и оставляет замену
физической пары каналов на WebRTC отдельным будущим transport-этапом:
[`MF-410 — Соединить домены напрямую для команд и событий`](tasks/MF-410.md).

Существующие capability checks не удаляются, но их расширение, новый graph
scope и новая access policy не разрабатываются до завершения функциональной
RPC-поверхности. Наличие команды, сценария пакета или исполняемого файла всё ещё
не считается RPC агента.

Текущий Dark Force хранит полную принятую Particle-history, а
`dark.force.history.read` даёт exact frontier и bounded range прямо над ней.
`energy.mass.result.read` возвращает bounded current result объявленного key,
digest и causal frontier без `MassHandle` и filesystem path. Второй журнал и
новая access policy для этого не созданы.

## Конечная функциональная RPC-поверхность одного агента

Проверенный действующий набор:

* `readGraph`;
* `meta.capabilities.read` и `meta.source.revision.read`;
* `meta.create`;
* полный `meta.matter.apply` для WIMP, fuzzy, axion и macho composition;
* `meta.declaration.apply` для metadata, optional Field, State composition,
  Mass, Reaction, Process и Bulk;
* `meta.field.value.apply` с публичным Atom locator, типизированным значением и
  точной ожидаемой causal frontier;
* `meta.process.execution.read` для status, result/error, acceptance и
  settlement существующей Process execution;
* `dark.force.history.read` и `energy.mass.result.read`;
* `dark.force.pause`, `dark.force.step`, `dark.force.stack`,
  `dark.force.resume`;
* `bulk.observer.captureViewport`.

Все RPC, признанные необходимыми для первой рабочей сессии одного агента,
реализованы и проверены как отдельно, так и совместно в одном воспроизводимом
сценарии.

Отдельные `state.set` и `process.run` не входят в поверхность. Агент задаёт
предметный Field, Matrix вычисляет State, Energy исполняет Process. Graph
возвращает текущие Field values и State; history, Mass result и Process
execution projection доказывают причинный исход.

Междоменные initial/projection, Mass fence/release и checkpoint methods не
считаются agent RPC. Применимые правила передаются в task envelope из
документов-владельцев; новый rules/access provider не проектируется на этом
этапе.

## Bulk Store

Bulk не использует Graph как стартовую основу рабочего браузера.

При рождении Bulk:

1. получает через `Boundary.initialProjection.read` согласованные canonical
   rows;
1. сразу строит один плоский числовой Bulk Store;
1. передаёт браузеру только `{session, store}`;
1. удерживает произошедшие после начального среза Force Particles до
   подключения одноразового browser-сеанса;
1. применяет последующие Particle непосредственно к тому же Store.

В рабочем пути нет Graph Store, Bulk Manifest, ReadyScene, JSON Pointer или
полной замены сцены на каждую Particle. Старые Graph-to-Bulk и scene pipelines
могут оставаться только проверочным эталоном, если это явно обозначено и они не
попадают в рабочий путь.

Действующие законы раскладки находятся в [`bulk/VISUAL.md`](../bulk/VISUAL.md)
и [`pkg/visual/CONTRACT.md`](../pkg/visual/CONTRACT.md).

## Короткая агентная сессия

Первая рабочая сессия одного доверенного локального агента проверена. Её
начальный запрос явно содержит:

* применимые правила и уже действующие capabilities;
* Git и source revision;
* scoped RPC JSON snapshot;
* task envelope с целью, scope и проверяемым результатом.

Сессия работает в доверенном локальном контуре и не разрабатывает новую access
policy, новый частичный scope или конкурентные writes. Она использует
существующую конфигурацию доверенного source без её расширения и полный Graph
текущего root.

После начального snapshot агент получает изменения с причинной границей, а не
повтор всего контекста. Скрытая память прежней сессии не является источником
истины.

## Изменение существующей Meta

Structural update должен проходить один последовательный путь:

1. прочитать текущую revision, правила, действующие capabilities и scoped snapshot;
1. построить предложение без изменения мира;
1. проверить публичный контракт, точный target и действующий scope;
1. подготовить source projection того же patch без публикации;
1. применить принятый patch к живому миру через Dark Force и Boundary;
1. применить тот же patch к `meta.ts` без повторного чтения живого мира;
1. записать точный исход операции.

Ошибка source projection после live commit повторяет тот же accepted patch и
не строит новый diff по уже изменённому миру.

Человеческий authoring через TypeScript остаётся отдельным отложенным
направлением. Изменённый человеком `meta.ts` должен сначала стать проверяемым
semantic proposal, затем пройти существующий typed structural path через Dark
Force и Boundary; source edit не становится вторым прямым путём в live world.
Точный candidate/apply и cold-restart contract ещё не выбран:
[`MF-408`](tasks/MF-408.md).

## Create MetaFor

Create использует тот же structural path, но начинается с существующего
RPC и существующего шаблона:

```text
RPC -> template -> validate -> atomic peer repository -> receipt
```

Параллельный генератор Oracle и замена полного пакета на `directory + meta.ts`
не создаются. Canonical commit остаётся отдельной возможностью с решением
владельца.

## Пауза, список границ и ветвящееся исполнение

Сейчас `dark.force.pause` закрывает внешний вход Agent Particle и ждёт
checkpoint, `dark.force.step` проводит ровно одну новую Particle вперёд,
`dark.force.stack` показывает границы текущей паузы, а
`dark.force.resume` открывает вход и очищает список. Этот список хранится только
в памяти. Он не читает history, не переходит назад и не создаёт отдельный мир.

Будущая изолированная область исполнения должна опираться на причинную границу
принятой Particle-history и неизменяемый checkpoint, а не на снимок интерфейса
Bulk. Она должна уметь:

* выбрать существующую причинную точку;
* создать изолированную execution branch;
* подать альтернативный следующий input;
* двигаться вперёд и назад без изменения canonical мира;
* отдельно запросить owner-gated promotion.

Этот этап начинается только после завершения read-only observation.

## Обобщённое растворение родителя

Одноразовый путь Inference -> Lada завершён и удалён из рабочего контура. Он не
является действующим API.

Повторно используемая общая операция остаётся отдельной будущей задачей:
[`tasks/MF-401.md`](tasks/MF-401.md). Она не должна
возвращать удалённую одноразовую команду или специальные adapters.

## Порядок оставшейся работы

1. в `MF-411 — Определить, что делает Hamiltonian и где он работает` закрепить
   закон Hamiltonian и роли его воплощений;
1. в `MF-425 — Управлять одной Вселенной на одном устройстве` завершить
   серверно-браузерное управление и визуализацию одной Вселенной;
1. после `MF-411` в `MF-414 — Определить, где работают домены и какая их копия
   действующая` определить допустимые воплощения доменов и их право действовать;
1. после этого решить, принимать ли `MF-410 — Соединить домены напрямую для
   команд и событий` и какими минимальными этапами переносить listener и
   доменные воплощения;
1. в `MF-426 — Распределить одну Вселенную между несколькими устройствами`
   перенести доказанное управление одной Вселенной на несколько устройств;
1. только затем начинать `MF-427 — Управлять несколькими Вселенными`;
1. независимо реализовать релевантную частичную Graph-проекцию `MF-407`;
1. после этого отдельно возвращаться к конкурентным чтениям и writes,
   расширенной access policy, ветвлению и самоизменению Лады;
1. человеческий `meta.ts → live` authoring `MF-408` выполнять позднее после
   отдельного выбора candidate/apply и restart contract;
1. публикацию пакета, Force v2, merge, rollback и push менять только после
   отдельных решений владельца.

## Явные ограничения

Без отдельного выбранного READY item и решения владельца не являются текущей
работой:

* новые права доступа, capability policy и graph scope;
* конкурентные чтения, конкурентные writes и многопользовательский режим;
* изолированное ветвление и самоизменение Лады;
* отправка изменений в GitHub из runtime и автоматический canonical commit;
* Force v2, merge, rollback или push;
* восстановление удалённого одноразового Inference -> Lada endpoint.

## Как обновлять дорожную карту

* Удалять выполненную работу из графа исполнения после того, как действующий
  закон находится у владельца домена и подтверждён проверками.
* Не хранить здесь журналы запусков, старые численные отчёты и перечни
  завершённых коммитов.
* При изменении закона сначала обновлять документ-владелец, затем эту дорожную
  карту.
* При обнаруженном расхождении не выбирать молча удобную версию, а записывать
  отдельную задачу на согласование.
