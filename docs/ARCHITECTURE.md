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

Одно изменение одной сущности переносится одной Particle. Получатель применяет
её к своей проекции и, если это создаёт следствие, выпускает следующее
сообщение. Так сохраняется видимая причинная цепочка.

## Рождение Вселенной

Сначала рождаются Dark, Boundary, Energy и Bulk. Energy до подключения к
причинному потоку получает полный текущий каталог от Boundary и готовит свои
местные связи.

Matrix рождается последней. Она ждёт готовности остальных доменов, получает
последний согласованный снимок текущего мира с Atom, Fields, States и
декларациями и только после подготовки открывает общий поток изменений. Поэтому
первое вычисление Matrix уже может безопасно начать Process в готовой Energy.

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

После изменения кода причинно связанная Вселенная запускается заново целиком.
Частичная горячая перезагрузка могла бы смешать разные исходные снимки и потому
не поддерживается.

Критический отказ Matrix завершает её процесс. Потеря обязательного канала
переводит Force в состояние ошибки, а текущий запуск Вселенной останавливает
остальные домены. Автоматического повторного запуска сейчас нет: будущее
восстановление должно происходить внешним управляющим контуром и только через
новое полное рождение всех процессов.

## Публичное чтение MetaJSON

MetaJSON v1 имеет ровно один публичный JSON-документ и одну schema. Отдельных
`authoring`, `planner`, `diagnostic`, compact либо иных public views нет.
Частичный selector может быть только операцией чтения над этим же документом:
он не создаёт второй payload или контракт.

Документ содержит две явно разделённые части:

- `template` — компактную, но полную сериализуемую нормализацию действующего
  `MetaDSL`, включая все declarations, defaults, Process/Reaction descriptors,
  Matter bindings и объявленный Bulk;
- `runtime` — вложенные текущие Atom occurrences с реально присутствующими
  State и Field values.

Runtime не объясняет происхождение значения. Если текущий Field value
присутствует у Atom, он находится в runtime occurrence; если отсутствует, ключа
нет. Default остаётся declaration в `template`. Статусы `materialized`,
`inherited-default`, `missing`, `not-projected`, отдельный `values/missing`
envelope и provenance default-vs-write запрещены.

Публичная identity задаётся logical Meta address, вложенной структурой
документа и JSON paths/references. Boundary `Atom.id`, `Field.id`, `valueId`,
локальные SQLite handles и другие внутренние числовые identity за публичную
границу не выходят. MetaJSON не вводит направленные ports, boundary stubs или
отдельный global edges graph: relations остаются в нормализованной Matter
structure и её публичных structural references.

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
становятся новым законом. Универсального `order` vector в MetaJSON нет.

Операцию чтения предоставляет Dark Monad. Stateless assembler получает полную
declaration projection от Dark Monad, текущую runtime projection через
Boundary, собирает и валидирует один документ, но не хранит его и не читает
Store другого домена напрямую. Dark Monad и Boundary остаются владельцами
своих projections; Dark Force только переносит Monad RPC.

MetaJSON v1 не содержит revision, digest или CAS fields. Particle/operation
history, patches, Git history, Mass bytes и живые Energy objects не являются
частями этого snapshot и читаются через их собственные разрешённые интерфейсы.
`meta.ts` и Git остаются canonical human-authored source; MetaJSON всегда
является derived read representation.

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

Cold projection через Monad содержит только сериализуемые canonical entities и
binding descriptors. Mass handles и живые Energy-сущности создаются и остаются
в локальных Energy stores; Mass bytes хранятся в файловом каталоге. Ни Monad, ни
Force их не переносят. После рождения изменение continuation или
owning-parent relation переустанавливает binding только по обычному Graviton,
включая изменение владельца через Topology.

Между initial projection и рождением Energy не нужен отдельный handoff frame:
общий Force до подключения последней Matrix остаётся в `starting` и не
пропускает Particle ни от агента, ни от доменного ForceChannel.

## Field binding и Matrix entanglement

Полный действующий контракт этого механизма находится в
[документации Matrix](../matrix/README.md).

`fields=${...}` не является третьим Energy runtime binding. Точная top-level
пара `childKey: parentField` для `string`/`number`/`boolean` материализуется в
Boundary как один shared `Value` identity и нормализованное отношение
`atom_field_source`. Запись из parent, child или sibling обновляет общий value
record, а Boundary выпускает отдельные atom-addressed Gluon consequences с
одним `ts`; внутри такого time step sequence нет.

Matrix считает Fields общими только при общей канонической идентичности.
Совпадение значений само по себе связь не создаёт. Изменение общего Field даёт
каждому связанному Atom возможность проверить собственные переходы.

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
так далее), а не slash-адресом дерева Meta. WIMP идентифицируется своим `src`;
вложенные сущности — парой WIMP SRC и локального числового индекса.

## Persistence

Boundary development server по умолчанию использует
`.metafor/dev.sqlite`. Путь можно явно задать первым позиционным аргументом или
`BOUNDARY_PATH`.

Boundary suites открывают изолированные `:memory:` databases и закрывают их в
`afterEach`. Они не используют development database.

Boundary не хранит Meta-файл, JSON-зеркало декларации или второй snapshot
мира. WIMP, Field, Variant, State, Transition, Condition, Process, Reaction,
Matter, binding descriptors, Field source relations и materialized
Atom/Topology/Value разложены по отдельным связанным таблицам. Рабочая Mass в
Boundary отсутствует. Производные runtime-проекции можно восстановить из этих
отношений.

## Bulk и renderer

Сохранены source-backed world projection, generic viewport, navigation,
fullscreen и WebGPU renderer. Нижний существующий `HudTimelinePanel`, прежде
показывавший Atom observer cut, теперь занят открытым по умолчанию causal
time-документом: компактные Blender-подобные дорожки Force, Mass и Boundary,
playhead и ромбовидные keyframe-маркеры кадров pause-stack, фактически
прочитанных из Dark через локальный Monad Bulk. Заголовок и отдельная боковая
вкладка времени отсутствуют; timeline прижат к нижнему dock. Отдельная
самодельная карточка времени поверх сцены запрещена. Нижний control dock
использует общие `@ui/components`: icon-only Pause, Resume и Step, а рядом
read-only счётчики количества keyframes и acceptance sequence. Отдельного
LIVE/PAUSE status chip нет. Dock не импортирует runtime Interpreter. Pause
закрывает external admission и
создаёт causal frame на удержанном frontier; Resume освобождает admission и
очищает disposable stack.
Цветные иконка и border управляющей кнопки обозначают текущий режим, а не
доступную противоположную команду: Play выбран только в live, Pause — только на
удержанном frontier. Управляющие кнопки не показывают tooltip.
Счётчики подписаны пользовательскими словами `КАДРЫ` и `ТАКТ`, без внутренних
сокращений KF/SEQ. Три управляющие кнопки образуют центрированную группу;
`КАДРЫ` находится у её левого края, `ТАКТ` — у правого. В live при пустом
pause-stack счётчики не рисуются; они появляются только вместе с causal frame и
исчезают после Resume. Разделителей вокруг группы кнопок нет.
Левый gutter подписей Force/Mass/Boundary зеркально резервируется справа:
playhead и keyframe plot геометрически центрированы по viewport, а не по
оставшейся после подписей ширине.
Step не испускает Particle из UI и остаётся неактивным без отдельного явного
следующего input. Выбранный кадр красный, измеренный exact — зелёный,
degraded — янтарный, overloaded — красный, кадр без capture-метрики — серый.
На время одного stack/pause/resume RPC управляющие кнопки недоступны, а ответ
предыдущей отменённой UI-операции не может заменить более новое causal
состояние.
Перемещение playhead само по себе не меняет live-мир, 3D, checkpoint или
Particle history. Недоступность либо malformed ответ time-control RPC
показывается в панели, а не подменяется вымышленным состоянием.

Semantic manifestation сохраняет State occurrences, Conditions, relations и
projections как geometry-free identity/ownership contract. Единственный
production visual law находится в `pkg/visual` и приходит в Bulk через
`@metafor/visual/layout/centered-nested`; прежние Bulk layout/level,
wireframe/LOD, fallback и Atom observer-timeline реализации удалены.
Axion остаётся материализованной semantic identity, но его Visual activation
отложена и отсекается до вызова production strategy.

Визуальные законы задаются только в коде и не сохраняются в browser storage.
Постоянная декоративная анимация программно выключена. Renderer останавливается,
когда движение завершено; следующий кадр запрашивается из-за релевантного
Impulse, изменения `ViewPoint` или незавершённого конечного проявления. Новая
корневая Particle детерминированно переключает наблюдение на материализованный
Atom без ручной команды из интерфейса.

Causal timeline заменяет прежнее Atom observer-cut представление: Bulk не
строит и не показывает отдельные дорожки материализованных Atom на общем
`throughTs`. Узкий live adapter предоставляет только pause/stack/resume; он не
заявляет backward reconstruction, isolated execution branch, promotion в live
contour или завершение `MF-109`.

Текущий `ViewPoint` привязан к DOM element. Смысловой контракт должен стать
platform-neutral, чтобы одна точка наблюдения могла представлять обычный экран,
телефон, WebXR, AR или VR без изменения законов Bulk.

### Observer viewport capture

Read-only Monad method `bulk.observer.captureViewport` получает PNG именно
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
digest session на время этого соединения. Monad request не переносит session
или ручной grant. Первый валидный capture связывает выбранный observer с
аутентифицированным `source` Monad channel, и до disconnect другой caller не
получает право чтения. Ручная deployment-конфигурация для basic capture не
требуется.

Capture request/response идут по browser WebSocket-соединению, уже
аутентифицированному одноразовой session, как явно дискриминированные control
messages. Они разбираются до Force и никогда не создают Impulse. На одного
observer разрешён один capture одновременно; действуют rate, timeout, viewport
structural snapshot и PNG payload limits, а disconnect отменяет ожидание.

Ответ фиксирует observer id, `throughTs`/`rootSrc` browser projection cut,
CSS/pixel dimensions, DPR, capture sequence, wall-clock time, PNG byte count и
base64. В том же результате находится существующий `BulkObserverSnapshot`:
тот же `version`, `throughTs`, `rootSrc` и неизменённый
`BulkProjectionSnapshot`, из которого observer рекурсивно строит manifestation.
Отдельный structural graph capture не создаёт. Поля `capture.projection`
сохраняются как совместимый короткий cut и обязаны точно совпадать со snapshot.

Browser публикует snapshot для capture только после уже запрошенного обычного
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
