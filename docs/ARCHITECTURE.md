# Архитектура системы

Этот документ объясняет, как части MetaFor связаны в одну причинную систему.
Карта источников истины и точные документы-владельцы находятся в
[`docs/README.md`](README.md).

## Домены

Текущая Вселенная состоит из пяти изолированных проекций:

- Dark принимает внешнюю декларацию и ведёт причинную историю;
- Boundary владеет каноническим текущим миром;
- Matrix выбирает State и Transition;
- Energy исполняет Process и Reaction;
- Bulk проявляет мир для наблюдателя.

Force переносит между ними отдельные изменения. Он связывает домены, но не
становится шестым владельцем состояния.

Внешняя Meta остаётся декларацией. В мир входят созданные из неё сущности и
отношения, а не её файлы или каталог.

## Как читать архитектуру

Каждый домен отвечает только за собственную проекцию и не читает внутреннее
хранилище соседа. Начальные согласованные снимки передаются до рождения, а
последующие изменения идут отдельными причинными сообщениями.

Общий междоменный public contract не возникает автоматически из удобства
импорта. Перед выносом любого метода, DTO или другого API в shared/public
contract требуется отдельное явное согласование владельца.

Одно изменение одной сущности переносится одной Particle. Получатель применяет
её к своей проекции и, если это создаёт следствие, выпускает следующее
сообщение. Так сохраняется видимая причинная цепочка.

## Рождение Вселенной

Dark первым открывает единственный слушающий server Вселенной. Supervisor
только запускает и завершает процессы: Boundary, Energy, Bulk и Matrix сами
открывают к известному адресу Dark по одному постоянному Oracle и Force
WebSocket и не поднимают собственные HTTP servers.

Сначала рождаются Dark, Boundary, Energy и Bulk. Energy до подключения к
причинному потоку получает полный текущий каталог от Boundary и готовит свои
местные связи.

Matrix рождается последней. Она ждёт готовности остальных доменов, получает
последний согласованный снимок текущего мира с Atom, Fields, States и
декларациями, а также все точные потенциальные связи Reaction, и только после
подготовки открывает общий поток изменений. Поэтому первое вычисление Matrix уже
может безопасно начать Process в готовой Energy. Наличие связи при холодном
рождении не переигрывает текущее State её источника.

Тот же снимок содержит незавершённые Process executions прежнего полного
contour. Они не продолжаются: Matrix создаёт для совпадающего текущего State и
Process новую execution identity, а Boundary при её регистрации переводит
прежнюю identity в `superseded`. State с Process без незавершённого execution
только восстанавливается и повторно не запускается.

До рождения Matrix общий поток не принимает обычные изменения. Между начальным
снимком и открытием потока не требуется отдельное сообщение повтора.

## Причинная цепочка

Обычный предметный проход выглядит так:

```text
внешнее изменение
→ Boundary записывает канонический результат
→ Matrix проверяет State и Transition
→ при необходимости Energy исполняет Process
→ Boundary проверяет и записывает результат Process
→ Matrix продолжает переходы
→ Bulk показывает получившийся мир
```

Matrix не ждёт завершения Process всей системой: она блокирует только State
конкретного Atom. Остальные Atom и домены продолжают работу.

Проход Reaction является отдельной причинной ветвью:

```text
Boundary подтверждает новое State source Atom
→ Matrix выбирает точные активные связи и очередь target Atom
→ Boundary регистрирует execution и снимок объявленных зависимостей
→ Energy исполняет Reaction рядом с Mass target Atom
→ Boundary принимает только ordinary Field proposal
→ Matrix завершает execution и выпускает следующий trigger очереди
```

После изменения кода причинно связанная Вселенная запускается заново целиком.
Частичная горячая перезагрузка могла бы смешать разные исходные снимки и потому
не поддерживается.

Критический отказ Matrix завершает её процесс. Потеря обязательного канала
переводит Force в состояние ошибки, а текущий запуск Вселенной останавливает
остальные домены. Автоматического повторного запуска сейчас нет: будущее
восстановление должно происходить внешним управляющим контуром и только через
новое полное рождение всех процессов.

## Публичное чтение Graph

Graph — единственный публичный graph format мира и имеет одну schema. На wire
он сериализуется в JSON; JSON здесь является только технической сериализацией
Graph, а не именем доменной сущности, вторым форматом или отдельным контрактом.
Отдельных `authoring`, `planner`, `diagnostic`, compact либо иных public views
нет. Частичный selector может быть только операцией чтения над тем же Graph:
он не создаёт второй payload или контракт.

Graph содержит две явно разделённые части:

* `template` — компактную, но полную сериализуемую нормализацию действующего
  `MetaDSL`, включая все declarations, defaults, Process/Reaction descriptors,
  Matter bindings и объявленный Bulk;
* `runtime` — вложенные текущие Atom/Topology occurrences со стабильными refs,
  реально присутствующими State и Field values, metadata разрешённой Mass и
  отдельным списком точных Reaction relations.

Runtime не объясняет происхождение значения. Если текущий Field value
присутствует у Atom, он находится в runtime occurrence; если отсутствует, ключа
нет. Default остаётся declaration в `template`. Статусы `materialized`,
`inherited-default`, `missing`, `not-projected`, отдельный `values/missing`
envelope и provenance default-vs-write запрещены.

Публичная agent-facing identity runtime-сущности задаётся типизированным opaque
ref: `atom:*`, `topology:*`, `mass:*` или `reaction:*`. Вложенный путь остаётся
текущим placement и может измениться, не меняя identity. JSON Pointer адресует
место только внутри одного снимка и не подменяет ref.

Graph не раскрывает raw SQLite row, `valueId`, filesystem path или handle.
Typed refs формируются из канонической Boundary identity на границе проекции.
Точный список `runtime.reactions` показывает source Atom и его наблюдаемые
States, target Atom и его активные States и вычисленную активность связи. Это
не универсальная таблица произвольных edges и не второй Store. Matter hierarchy
по-прежнему остаётся вложенной structural projection.

У каждого runtime Atom Graph показывает metadata разрешённых Mass keys с
`content: "lazy"`. Bytes читаются отдельно через Mass RPC только по отдельному
разрешению и никогда не входят в Graph.

Последовательность сохраняется только там, где она уже влияет на смысл или
materialization:

- первый State является initial State;
- первый подошедший Transition одного State имеет приоритет;
- порядок enum variants задаёт ordinal mapping;
- declaration sequence Fields, Processes и Reactions сохраняет действующие
  local identities, а порядок `finally` Processes — runtime causality;
- Matter сохраняет parent/edge slot/sibling и repeated-occurrence order.

Conditions одного Transition являются чистой конъюнкцией и отдельного
priority-order не получают. Mass declaration и display order также не
становятся новым законом. Универсального `order` vector в Graph нет.

Операцию `readGraph` предоставляет Dark Oracle. Её request всегда пуст: клиент
не выбирает и не передаёт root. Stateless assembler сначала получает через
Boundary coherent current projection с единственным текущим root, затем
загружает для него полную declaration projection, собирает и валидирует один
Graph и возвращает root как данные ответа. Assembler не хранит Graph и не
читает Store другого домена напрямую. Dark Oracle и Boundary остаются
владельцами своих projections; Dark Force только переносит Oracle RPC.

Graph laboratory является development-проекцией package `@metafor/types`
(далее — types): она показывает полный document, exact Reaction relation, lazy
Mass metadata, closed validation, snapshot-local identity и производную
NodeTree. External Storybook строит навигацию из owner declaration и лениво
загружает только выбранное представление; types не создаёт второй Graph Store и
не становится владельцем domain execution.

Bulk HUD laboratory принадлежит package `bulk` и монтирует production HUD в
отдельной package realm того же внешнего Workbench. Graph и Bulk имеют
независимые runtime sessions, diagnostics и revisions, поэтому ошибка одной
проекции не меняет другую.

При рождении Bulk один раз получает через `Boundary.initialProjection.read`
согласованный набор необходимых canonical rows и сразу формирует плоский Bulk
Store. Bulk не читает Boundary persistence или SQLite напрямую и не вызывает
`Dark.readGraph` для browser initial. Graph и JSON Pointer остаются публичной
read-only проекцией для агентского чтения, но не входят в Bulk Store.
Production writer сразу заполняет конечные semantic/geometry/material/control
columns по фиксированному centered-nested закону; `BulkManifest`, `ReadyScene`
и иная промежуточная scene model существуют только в parity-test oracle.

Единственный server Dark через принадлежащий Bulk browser gateway обслуживает
`GET /`, `/initial` и browser WebSocket. Gateway переносит opaque browser
payload, session и Store между browser и Bulk, но не строит и не читает Store.
`GET /` немедленно отдаёт не содержащий данных мира HTML shell с Canvas и
loader. Отдельный `GET /initial` получает у Bulk текущий согласованный Store и
одноразовую session в форме `{session, store}`; handoff удерживает произошедшие
после cut Particles до подключения browser Force. В initial JSON нет Graph,
путей, semantic manifest, renderer-ready scene, revision или causal cursor.
Browser параллельно готовит client-only viewport, активирует числовые колонки
этого же объекта как typed buffers и вычисляет только локальные `id → slot` и
incident indexes; второй набор записей не создаётся. Loader скрывается после
первого кадра с применённым Store. Shell и initial имеют private `no-store`
policy и не становятся shared cached состоянием мира.

Force `Particle` остаётся transport обновлений. `wimp.view_css` в Bulk Store не
проецируется: initial writer игнорирует его row, а server не передаёт такой
Graviton в browser Store. Сервер отвечает за порядок и
повтор доставки, а browser вызывает отдельный handler конкретного Particle и
operation. Handler меняет точные Store slots, локально пересчитывает только
затронутую geometry/material/incidence closure и вызывает конкретные renderer
операции. Bulk не перечитывает Graph на Particle, не отправляет replacement
Store и не вводит универсальный diff/patch или consequence transport.

Graph не содержит revision, digest или CAS fields. Particle/operation
history, patches, Git history, Mass bytes и живые Energy objects не являются
частями этой projection и читаются через их собственные разрешённые интерфейсы.
Boundary остаётся каноническим текущим миром. `meta.ts` является переносимой
типизированной декларацией и автоматически поддерживаемой source projection
принятых structural patches; Git фиксирует её только отдельной owner-gated
операцией. Действующего пути, который принимает ручное изменение `meta.ts` и
переносит его в живой мир, пока нет: он вынесен в будущую задачу
[`MF-408`](../project/tasks/MF-408.md). Graph всегда является derived read
representation.

## Energy и Mass в DSL/runtime

Цепочка MetaFor имеет обязательный порядок `fields → superposition → mass →
energy → processes → reactions → matter → bulk`. `Mass` объявляет именованные
key-files и их codec; Process получает типизированную по ключам проекцию
`MassHandle`. Следующая декларация `energy<EnergyType>()` задаёт только постоянные
TypeScript-типы живых runtime-сущностей. Она не принимает runtime-объект и не
добавляет значение Energy в MetaDSL; функции в типе запрещены.

Action получает раздельные `{field, value, mass, energy, self, signal}`. Реализация
action находится во внешнем ESM-модуле, подключаемом динамическим `import()`;
inline wrapper только передаёт готовые значения без spread/iterator, вложенных
вызовов и мутаций, а его параметры не содержат default/rest.
Energy runtime хранит Mass и Energy в разных локальных stores. Обычный Process
может создать или заменить сущность в `energy`; `destroy.before({mass, energy})`
освобождает её, после чего Energy runtime удаляет весь набор живых сущностей
этого Atom. Удаление Energy не очищает Mass автоматически.

`.mass((mass) => ({artifact: mass.json()}))` — keyed factory. Dark вкладывает
нормализованные metadata-only declarations в существующий WIMP Inflaton, не
создавая Mass DeclarationPath или Particle. Boundary хранит declaration, global
key, Atom/declaration membership и child-to-parent key source отдельно; это не
Mass container и не Atom-to-Mass relation. Energy читает и пишет только flat
worktree catalog `mass/<key-id>` атомарной заменой. Force и Matrix не получают
Mass bytes или metadata.

Matter WIMP edge может содержать два независимых runtime binding: `massBinding`
и `energyBinding`. Boundary сохраняет их в SQLite как FK на нормализованные
binding descriptors и прикладывает descriptors к materialized child Atom в
`continuation`. Live values в Boundary/Force не попадают. Перед claim процесса
ребёнка Energy находит ближайший owning parent Atom, локально разрешает
`/mass[/...]` и `/energy[/...]` в его stores и связывает результат с stores
ребёнка. После успешного разрешения binding не пересчитывается на каждом claim:
Graviton, изменивший continuation ребёнка или отношение Atom/Topology к owning
parent, немедленно переустанавливает уже проявленные aliases и отменяет pending
claim старой связи. Прямой root alias сохраняет object identity. Пока
зависимость равна `undefined`, binding не установлен и этот Energy не claim-ит
ребёнка.

Cold projection через Oracle содержит только сериализуемые canonical entities и
binding descriptors. Mass handles и живые Energy-сущности создаются и остаются
в локальных Energy stores; Mass bytes хранятся в файловом каталоге. Ни Oracle, ни
Force их не переносят. После рождения изменение continuation или
owning-parent relation переустанавливает binding только по обычному Graviton,
включая изменение владельца через Topology.

Между initial projection и рождением Energy не нужен отдельный handoff frame:
общий Force до подключения последней Matrix остаётся в `starting` и не
пропускает Particle ни от агента, ни от доменного ForceChannel.

## Field binding и Matrix entanglement

Полный действующий контракт этого механизма находится в
[документации Matrix](../quantum/matrix/README.md).

`fields=${...}` не является третьим Energy runtime binding. Точная top-level
пара `childKey: parentField` для `string`/`number`/`boolean` материализуется в
Boundary как один shared `Value` identity и нормализованное отношение
`atom_field_source`. Запись из parent, child или sibling обновляет общий value
record, а Boundary выпускает отдельные atom-addressed Gluon consequences с
одним `ts`; внутри такого time step sequence нет.

Matrix считает Fields общими только при общей канонической идентичности.
Совпадение значений само по себе связь не создаёт. Изменение общего Field даёт
каждому связанному Atom возможность проверить собственные переходы.

Bulk Store проецирует такую direct shared identity отдельной симметричной
`field-entanglement` relation между Field ближайшего предка и occurrence с тем
же canonical `valueId`. Endpoint pair хранится в каноническом порядке без
фиктивного направления. Для цепочки из нескольких Atom создаётся связь на
каждом соседнем участке, а не полный граф между всеми Field occurrences.

Структурное изменение не должно перезапускать незатронутый Process. Добавление
дочернего Atom, например, сохраняет State, блокировку и текущее выполнение
родителя. Изменение декларации WIMP, напротив, делает прежние выполнения его
Atom устаревшими; их поздние результаты больше не принимаются.

Независимо от доступного способа вычисления Matrix обязана выдавать одинаковые
State, блокировки и последовательность Photon. Сбой во время такта переводит
Matrix в нездоровое состояние, а не изображает успешный такт без изменений.

## Browser Atom Capsule

Первый рабочий application contour находится в игнорируемом внешнем
`cluster/zavx0z/capsule`. Root Capsule передаёт Browser Atom прямые Fields, Mass
и Energy. `profileAddress` запускает конечный lifecycle `подготовка WebRTC →
запуск сохранённого профиля → подключение werift receiver → браузер готов`.
Запуск использует библиотеки Capsule напрямую и не обращается к её HTTP
lifecycle API.

В готовом состоянии conditional Matter materialize Screenshot и Control Atom.
Они используют постоянные video/DataChannel handles родителя через Energy,
меняют только объявленные shared Fields и после одного действия возвращаются в
состояние ожидания через отдельный transition. Сохраняемые сведения записываются
через объявленные JSON/binary Mass handles; `MediaStream`, track, peer, decoder,
socket и DataChannel находятся только в Energy.

Декларационный `path` является категорией (`wimp`, `field`, `state`, `matter` и
так далее), а не slash-адресом дерева Meta. WIMP идентифицируется canonical
`src`, потому что это его SQLite primary key. Для остальных declaration tables
categorical `path` задаёт таблицу, а обычный `Particle.from` при `move/copy`
несёт её persisted numeric row `id`; IDs разных таблиц могут пересекаться.
Authoring `matter/move` до входа в Boundary не имеет права читать этот
внутренний ID, поэтому на входе использует source identity
`<wimp-src>#<localId>`. Boundary внутри своей транзакции разрешает её в
persisted row и выпускает resulting Graviton уже с numeric `from`. Resulting
Graviton несёт полную canonical row с тем же либо сгенерированным `id` и
фактическими FK `wimp`, `field`, `state`, `transition` и другими columns.
`localId` остаётся WIMP-local declaration key и используется только как
входная identity этого узкого authoring-переноса, но не подменяет table PK.

## Persistence

Boundary development server по умолчанию использует
`.metafor/dev.sqlite`. Путь можно явно задать первым позиционным аргументом или
`BOUNDARY_PATH`.

Boundary suites открывают изолированные `:memory:` databases и закрывают их в
`afterEach`. Они не используют development database.

Boundary не хранит Meta-файл, JSON-зеркало декларации или второй snapshot
мира. WIMP, Field, Variant, State, Transition, Condition, Process, Reaction,
Reaction selectors и exact relations, Matter, binding descriptors, Field
source relations и materialized Atom/Topology/Value разложены по отдельным
связанным таблицам. Стабильные State event и execution identities сохраняют
границу регистрации Process и Reaction. Рабочая Mass в Boundary отсутствует.
Производные runtime-проекции можно восстановить из этих отношений.

## Bulk и renderer

Bulk владеет source-backed world projection, generic viewport, navigation,
fullscreen, causal-time control и WebGPU presentation. Production HUD является
одним semantic Document: public `@ui/components/hud` (далее — components HUD)
создаёт stable HudWindow с fullscreen action и вложенной stable Timeline.
`@zavx0z/renderer` (далее — document renderer) вычисляет CSS/layout/hit state,
а `@zavx0z/renderer-webgpu` (далее — WebGPU adapter) помещает полученное
представление в camera-locked overlay существующего Bulk renderer. HUD не
создаёт второй Canvas, Renderer, Space, ViewPoint или animation loop.

Timeline показывает реально прочитанные из Dark causal frames на дорожках
Force, Mass и Boundary. В открытом live-состоянии transport-кнопка запрашивает
Pause; на удержанном frontier та же standard button action запрашивает Resume.
Previous и Next меняют только выбранный frame в текущем stack. Выбор позиции
не меняет 3D, checkpoint, Particle history или live-мир. Маркер сохраняет
полученную resolution `exact`, `degraded`, `overloaded` либо `unknown`.

На время stack/pause/resume causal controls недоступны. Ответ предыдущей
операции не может заменить более новое causal state. Malformed либо
недоступный time-control ответ показывается в subtitle HUD, а не заменяется
вымышленным stack. Fullscreen action использует standard browser fullscreen
state и отражает его controlled `aria-pressed`.

Bulk Store сохраняет persisted table PK и минимальные FK/placement columns для
Field, State, Transition, Condition, Process и Reaction, а также runtime
ownership/order, relations, compact Hermite controls, рабочую geometry и
material state. Canonical `WIMP.src` хранится один раз в WIMP table; её slot —
только сжатая ссылка, не domain identity. `wimp.view_css`, Condition predicate,
Graph paths и однозначно derived indexes в Store не входят. Единственный
production visual law находится в `pkg/visual` и вызывается точными initial или
локальными calculation functions; прежние Graph Store, full-scene hydration,
Bulk layout/level, wireframe/LOD, fallback и Atom observer-timeline реализации
не участвуют в production path. Axion identity сохраняется, но его Visual
activation остаётся отдельным будущим этапом.

Bulk владеет Store, renderer и Engine lifecycle. `pkg/visual` остаётся stateless
библиотекой геометрии: она получает только переданные calculation facts и не
читает Graph, Boundary либо Bulk Store самостоятельно.

Визуальные законы задаются только в коде и не сохраняются в browser storage.
Постоянная декоративная анимация программно выключена. Renderer останавливается,
когда движение завершено; следующий кадр запрашивается из-за релевантного
Impulse, изменения `ViewPoint` или незавершённого конечного проявления. Новая
корневая Particle детерминированно переключает наблюдение на материализованный
Atom без ручной команды из интерфейса.

Causal timeline читает только pause-stack Dark через узкий live adapter
`pause/stack/resume`. Он не заявляет backward reconstruction, isolated
execution branch, promotion в live contour или завершение `MF-109`.

Текущий `ViewPoint` привязан к DOM element. Смысловой контракт должен стать
platform-neutral, чтобы одна точка наблюдения могла представлять обычный экран,
телефон, WebXR, AR или VR без изменения законов Bulk.

### Observer viewport capture

Read-only Oracle method `bulk.observer.captureViewport` получает PNG именно
последнего уже представленного canvas подключённого browser observer: сцену,
его текущие camera/zoom/root и HUD. Обычный render path копирует готовую
WebGPU canvas texture в ограниченную browser-side texture. Capture читает
последнюю такую texture через `copyTextureToBuffer`, кодирует PNG во временном
2D canvas и не запускает новый render loop. Это обходит недоступный для
`HTMLCanvasElement.toBlob()` WebGPU swapchain, не меняет projection или
состояние и не является server/headless/desktop screenshot.

Observer выбирается по `id`; без `id` capture допустим только при ровно одном
подключённом observer. Capture eligible только пока жив WebSocket, который
успешно поглотил одноразовую browser session при Upgrade; Bulk хранит только
digest session на время этого соединения. Oracle request не переносит session
или ручной grant. Первый валидный capture связывает выбранный observer с
аутентифицированным `source` Oracle channel, и до disconnect другой caller не
получает право чтения. Ручная deployment-конфигурация для basic capture не
требуется.

Capture request/response идут по browser WebSocket-соединению, уже
аутентифицированному одноразовой session, как явно дискриминированные control
messages. Они разбираются до Force и никогда не создают Impulse. На одного
observer разрешён один capture одновременно; действуют rate, timeout, viewport,
Store-proof и PNG payload limits, а disconnect отменяет ожидание.

Ответ фиксирует observer id, CSS/pixel dimensions, DPR, capture sequence,
wall-clock time, PNG byte count и base64. В том же результате находится
компактное доказательство представленного Bulk Store: числовой root, row counts
и fingerprints line batches. Graph, адресные строки, semantic manifestation,
renderer scene и client cursor отсутствуют.

Browser публикует Store proof для capture только после уже запрошенного обычного
кадра renderer. Если structural update ещё ожидает этот кадр, capture ждёт его;
сам capture не запрашивает render и не запускает постоянный loop. Capture time
не является и не подменяет simulation tick.

## Create MetaFor

`create-metafor` остаётся активным workspace и CLI. Его утверждённый контракт:
под переданным parent с owner basename создавать новый независимый peer
`<repository>` с полным актуальным template, lockfile после `bun install`,
собственным Git и одним `Initial commit`. Режима создания Meta внутри
существующего Meta-репозитория нет; root/internal branching и workspace child
template отсутствуют. Templates, generator tests и `rules/metafor.md`
проверяются локально вместе с остальным runtime.
