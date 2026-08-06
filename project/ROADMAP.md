# MetaFor: дорожная карта Graph, Monad и Force

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
* Композиция выполняется через Meta, Matter и Monad references, а не через
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
  Monad RPC-контур с реальными Matrix, Energy, Boundary, Dark и Bulk: explicit
  envelope, structural source projection, Field, State/Process, history delta,
  Mass и Bulk evidence проверяются одним вызывающим RPC source.
* Process-bound `photon/test` теперь проявляет вычисленный State в Bulk Store;
  визуальная проекция не требует несуществующего предыдущего `photon/replace`.
* Четыре начальных чтения Boundary сериализованы с `materialize`: Matrix, Energy,
  Bulk и Graph получают целиком один committed срез, а не строки соседних
  моментов.

## Graph

Graph является единой публичной read-only проекцией структуры мира для агента.
Он собирается при запросе и не становится вторым каноническим Store.

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

## Monad и Force

Monad является RPC-поверхностью домена. Force переносит причинные Particle и
RPC между доменами. Текущий этап сначала доводит функциональную RPC-поверхность
для одного доверенного локального агента: агент должен последовательно
прочитать необходимое состояние, выполнить поддерживаемое изменение и
проверить фактический результат.

Реализован один слушающий Dark server на Вселенную:
Boundary, Matrix, Energy и Bulk подключают к нему отдельные исходящие Monad и
Force WebSocket без собственных HTTP listeners, а browser ingress Bulk проходит
через Dark gateway. Реализация сохраняет payload и routing и оставляет замену
физической пары каналов на WebRTC отдельным будущим transport-этапом.

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

## Рабочая Лада в общей комнате Production

Существующая Лада остаётся композицией Agent, Auth Service, Chat Service,
Model Service и Chat Send Tool. Runtime, полный холодный запуск и независимая
визуальная E2E-проверка уже доказали завершённый предметный цикл одного
адресованного сообщения. Задачи цикла находятся в закрывающей проверке; это не
самоизменение Лады:

```text
явное @lada в общей комнате
→ долговечная доставка ровно один раз
→ модельный ответ на это сообщение
→ намерение Agent
→ Chat Send Tool
→ подтверждённое сообщение в той же комнате
```

Сообщение без явного `@lada` не создаёт намерение ответа. История и realtime
подаются в один inbox с одной identity сообщения; отдельный журнал рядом с
Mass и Force-history не создаётся.

После полной остановки новый contour заново создаёт живые Energy resources и
executions. Восстановление сохранённой SSO-cookie и подключение нового
WebSocket уже доказаны полным холодным запуском; истёкшая SSO-сессия возвращает
Auth в проверяемый телефонный/SMS-путь. Hot reload и частичное оживление
доменов для этого не вводятся.

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

Параллельный генератор Monad и замена полного пакета на `directory + meta.ts`
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

1. завершить рабочий адресованный цикл Лады
   `LAD-001`—`LAD-004` на действующей основе полного холодного рождения;
1. использовать реализованный единственный Dark listener для параллельного
   рождения нескольких contour;
1. реализовать релевантную частичную Graph-проекцию `MF-407` как следующий
   функциональный шаг;
1. использовать доказанный single-agent путь как базовую линию следующих
   изменений;
1. после этого отдельно возвращаться к конкурентным чтениям и writes,
   access policy, graph scope, ветвлению и самоизменению Лады;
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
