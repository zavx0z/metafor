# Архитектура реализации

Этот документ задаёт общую структуру текущего runtime. Карта источников истины
и точные документы-владельцы находятся в [`docs/README.md`](README.md). Для
работы с реализацией внешняя документация не требуется.

## Активный package graph

Root workspace graph задан явным списком в `package.json`:

- domain contracts: `types`;
- shared wire protocols и server/web transports: `shared`;
- central relay, `ForceLifecycle` и `MonadRouter`: `force`;
- domains: `dark`, `boundary`, `matrix`, `energy`, `bulk`;
- domain packages: `dark/{gravity,strong}`,
  `boundary/{atom,topology,wimp}`, `matrix/{gravity,strong,weak}`,
  `bulk/{gravity,strong,weak}`;
- reusable implementation: `pkg/engine`, `pkg/template`,
  `pkg/ui/{elements,components,hud}`, `fixture`;
- constructor and operational DSL: `create-metafor`.

Игнорируемый каталог `cluster/` является физическим resolver root внешних Meta,
но не workspace. Его непосредственные каталоги представляют Galaxy-владельцев,
а их Git-репозитории — корневые Atom и монорепозитории внутренних Meta-пакетов.

## Архитектурное чтение

Package graph нельзя читать как полную онтологию. Каноническая проекция имеет
вид `Domain × Force × Entity`: силы локально проявляются внутри доменов, а
корневой `force` реализует только текущий внешний ingress и междоменную связь.
Он не является всей Force.

Сохранившиеся domain packages `gravity`, `strong` и `weak` подтверждают это
измерение, но их текущий неполный состав ещё не является завершённой таблицей
сил. Возвращать обязанности старых реализаций только по имени каталога нельзя.

## Runtime entries

| Process  | Entry                | Default port |
| -------- | -------------------- | ------------ |
| Force    | `force/server.ts`    | 4000         |
| Boundary | `boundary/server.ts` | 4001         |
| Dark     | `dark/server.ts`     | 4002         |
| Matrix   | `matrix/server.ts`   | 4003         |
| Bulk     | `bulk/server.ts`     | 4004         |
| Energy   | `energy/server.ts`   | 4005         |

Root scripts запускают entries только как обычные Bun processes. После изменения
кода весь contour останавливается и запускается заново: частичная горячая
перезагрузка несовместима с Matrix-last causal cut. Запуск не загружает Meta
автоматически.

Полная Вселенная запускается через `bun run runtime:universe`. Launcher рождает
все пять обязательных доменов и Matrix последней; сокращённого рабочего `world`
contour нет. `runtime:universe:once` проверяет тот же birth gate и завершает
запущенные процессы после рождения.

Порядок рождения runtime задаётся не порядком запуска Bun processes. До своего
ForceChannel Energy открывает MonadChannel, читает
`boundary.initialProjection.read` и гидратит постоянный локальный catalog
Atom/Topology/Field/Variant/Process/continuation. Только затем Energy создаёт
ForceChannel.
Matrix server ждёт, пока Force увидит готовые `ForceChannel` Dark, Boundary,
Energy и Bulk, затем получает final initial state Boundary, готовит Store/Weak
и только после этого рождает Matrix runtime. Поэтому присутствие Energy в
Matrix birth gate уже означает завершённую cold hydration. Созданный при
импорте `Force("matrix")` становится пятым каналом и открывает общий realtime
gate. Это необходимо, потому что первая Weak evaluation уже может испустить
process work.

## Реализованное соединение

- `force/server.ts` принимает REST и создаёт пять доменных WebSocket-каналов.
- Domain transports из `shared/transport/force` подключаются к
  `ws://127.0.0.1:4000/ws`, если
  `FORCE_ADDRESS` не задан; `domain/id` передаются в HTTP Upgrade query.
- Domain Monads открывают отдельный локальный REST-канал к Force; его identity
  и method capabilities сохраняются сервером за непрозрачным токеном. Над
  каналом `MonadRpcPeer` одинаково обслуживает исходящие и входящие RPC, а
  закрытие удаляет канал из `MonadRouter`.
- Потеря только `MonadChannel` делает RPC этой identity недоступным, но не
  останавливает уже рождённый runtime. Fail-stop вызывается потерей одного из
  пяти обязательных realtime `ForceChannel`.
- После Upgrade по WebSocket идут только Particle без register, readiness или
  bootstrap messages; само подключение Particle не создаёт.
- `force/force.ts` является только relay и перенаправляет Particle по готовым
  каналам Store.
- Domain handlers применяют входные particles к собственным runtime structures.
- Dark читает внешний `cluster/<src>/meta.ts` в ширину и испускает отдельные
  декларационные Particle по мере чтения; Meta не становится внутренней
  сущностью. Canonical `src` имеет форму `<owner>/<repository>` либо
  `<owner>/<repository>/<meta-package>`.
- `boundary/server.ts` открывает SQLite, материализует Particle в
  нормализованные реляционные таблицы и публикует результаты через Force.
- `energy/server.ts` читает полный текущий Boundary projection через Monad,
  локально готовит `EnergyCatalogStore` и только после этого открывает
  обязательный realtime ForceChannel. На каждый claim RPC не выполняется.
- `bulk/server.ts` обслуживает web entry, шрифт, browser WebSocket и связывает
  browser manifestation с Force.
- Matrix weak backend по умолчанию — `auto`: WebGPU при доступности, иначе CPU.
  `gpu` является явным строгим режимом, `cpu` принудительно выбирает reference
  backend.

## Energy и Mass в DSL/runtime

Цепочка MetaFor имеет обязательный порядок `fields → superposition → mass →
energy → processes → reactions → matter → bulk`. `Mass` задаёт тип изменяемого
рабочего материала. Следующая декларация `energy<EnergyType>()` задаёт только
постоянные TypeScript-типы живых runtime-сущностей. Она не принимает runtime-
объект и не добавляет значение Energy в MetaDSL; функции в типе запрещены.

Action получает раздельные `{field, value, mass, energy, self, signal}`. Реализация
action находится во внешнем ESM-модуле, подключаемом динамическим `import()`;
inline wrapper только передаёт готовые значения без spread/iterator, вложенных
вызовов и мутаций, а его параметры не содержат default/rest.
Energy runtime хранит Mass и Energy в разных локальных stores. Обычный Process
может создать или заменить сущность в `energy`; `destroy.before({mass, energy})`
освобождает её, после чего Energy runtime удаляет весь набор живых сущностей
этого Atom. Удаление Energy не очищает Mass автоматически.

`.mass()` остаётся типовым контрактом DSL и не становится WIMP declaration:
Dark не испускает для неё Inflaton. Реальную рабочую Mass создаёт и изменяет
action, но владеет ею Energy. Каноническое целевое хранение Mass находится на
filesystem и сохраняет версии; Force, Matrix и Boundary содержимое Mass не
переносят. Текущий `EnergyMassStore` в памяти — незакрытый implementation gap,
а не окончательный lifecycle.

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
binding descriptors. Живые объекты Mass/Energy создаются и остаются в локальных
Energy stores; ни Monad, ни Force их не переносят. После рождения изменение
continuation или owning-parent relation переустанавливает binding только по
обычному Graviton, включая изменение владельца через Topology.

Между initial projection и рождением Energy не нужен отдельный handoff frame:
общий Force до подключения последней Matrix остаётся в `starting` и не
пропускает Particle ни от агента, ни от доменного ForceChannel.

## Field binding и Matrix entanglement

Полный действующий контракт этого механизма находится в
[доменной документации Matrix](domains/MATRIX.md).

`fields=${...}` не является третьим Energy runtime binding. Точная top-level
пара `childKey: parentField` для `string`/`number`/`boolean` материализуется в
Boundary как один shared `Value` identity и нормализованное отношение
`atom_field_source`. Запись из parent, child или sibling обновляет общий value
record, а Boundary выпускает отдельные atom-addressed Gluon consequences с
одним `ts`; внутри такого time step sequence нет.

Initial Matrix projection содержит `valueId`. `matrix/birth.ts` группирует
только явно общую identity, создаёт один runtime field record и strong mappings
для каждого Atom/Field. Равенство payload без общей identity связь не создаёт.
Computed expressions получают отдельные values; `enum` и `array` обслуживаются
как topology Fields и в shared block не входят. Enum Atom values, defaults и
Condition predicates несут canonical Variant ID; текст `itemValue` разрешается
при сборке Matrix, поэтому rename/reorder Variant не теряет ссылку.
Pending enum default не выходит в realtime до появления Variant. Referenced
Variant нельзя удалить или перенести в другой Field.

Live in-place replacement `fieldsBinding` поддерживается структурным тактом.
Boundary атомарно перестраивает source/value relation и испускает полный Atom
Graviton. Matrix находит затронутый Atom и его текущую shared `valueId` family,
а затем меняет только соответствующие Atom rows, shared blocks и графы. У
остальных Atom сохраняются brane index, row и Process lifecycle. Удаление
освобождает slot, добавление переиспользует свободный slot и не сдвигает
соседние Atom.

При постороннем structural Graviton lock, `processExecutionId`, frozen Fields и
accepted Energy активного Process сохраняются: например, появление дочернего
Screenshot не перезапускает Browser. Но declaration/Matter rebuild самого WIMP
локально инвалидирует executions всех его Atom. Atom остаётся в том же brane,
Matrix выдаёт новую Process identity, а Energy выполняет
`detach → rebuild → cooperative abort` старого action без междоменного ack.

CPU читает обновлённый canonical Store напрямую. WebGPU сохраняет runtime и
compute pipeline, обновляет только изменившиеся blocks/pointers и геометрически
увеличивает buffers при нехватке capacity; накопившиеся неиспользуемые derived
данные периодически уплотняются. Семантика и последовательность Photon должны
оставаться одинаковыми на CPU и WebGPU. Canonical packed ranges также
переиспользуют capacity и растут геометрически. Дедуплицированный несколькими
Atom graph перед локальным изменением отделяется copy-on-write.

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
состояние ожидания через отдельный transition. Mass содержит только
сериализуемые сведения; `MediaStream`, track, peer, decoder, socket и
DataChannel находятся только в Energy.

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
fullscreen и WebGPU renderer. HUD ограничен кнопкой полноэкранного режима:
пользовательских настроек изображения, ручного выбора Root SRC, статуса и
пересчёта сцены в нём нет. Удалённые bot, phone, Android и WebRTC application
paths были отключёнными product-specific ветками и не входили в причинный
runtime contour.

Legacy manifestation evidence, State occurrences, Conditions, relations,
projections и visual implementation остаются доступными для последующего
MF-000 D-5 audit. Cleanup не устанавливает новых visual laws.

Визуальные законы задаются только в коде и не сохраняются в browser storage.
Постоянная декоративная анимация программно выключена. Renderer останавливается,
когда движение завершено; следующий кадр запрашивается из-за релевантного
Impulse, изменения `ViewPoint` или незавершённого конечного проявления. Новая
корневая Particle детерминированно переключает наблюдение на материализованный
Atom без ручной команды из интерфейса.

Текущий `ViewPoint` привязан к DOM element. Смысловой контракт должен стать
platform-neutral, чтобы одна точка наблюдения могла представлять обычный экран,
телефон, WebXR, AR или VR без изменения законов Bulk.

## Create MetaFor

`create-metafor` остаётся активным workspace и CLI. В Galaxy-каталоге он создаёт
корневой Atom с собственным Git; в существующем Atom-репозитории — внутренний
Meta-пакет без nested Git. Его templates, generator tests и
`rules/metafor.md` проверяются локально вместе с остальным runtime.
