# Правила создания meta.ts

## Meta-пакеты агентной Вселенной

MetaFor является Мультивселенной и не сводится к агентной системе. Но если
Meta-пакет участвует во Вселенной с агентами, его нужно проектировать по
следующей границе:

> Agent понимает, что должно измениться в предметном мире, но не обязан знать,
> каким инструментом и каким техническим способом это будет выполнено.

Agent, окружающие его Tool, Device и Service описываются через Meta и
материализуются как Atoms:

- Agent Atom предлагает изменение доступных ему Fields;
- Tool Atom владеет предметным действием и его Process;
- Device Atom представляет устройство и живые ресурсы в Energy;
- Service Atom представляет доступность, запросы и результаты.

Agent не вызывает Action, не запускает Process напрямую и не устанавливает
State. Он изменяет предметный Field; Matrix вычисляет State, Energy исполняет
объявленный Process, а Boundary фиксирует только разрешённый фактический
результат.

При авторинге такого Meta-пакета:

1. Оставляй минимальное число независимых предметных Fields.
2. Используй достаточно смысловых States, но не превращай каждый технический
   этап Process в State.
3. Не записывай успех внешнего действия до фактического результата Process.
4. Храни сохраняемый материал в Mass, а живые handles — в Energy.
5. Связывай Agent с Tool, Device и Service Atoms через Matter.
6. Не раскрывай рабочему Agent API, transport и техническую
   последовательность, принадлежащие Process.
7. Оставляй наблюдаемую форму мира за Bulk; законченный универсальный интерфейс
   является направлением его развития.

Критерий:

> Agent достигает цели небольшим изменением Fields, а причинная система
> детерминированно выбирает и исполняет объявленное поведение.

Полное объяснение подхода, преимуществ и границы между действующим runtime и
направлением развития находится в
[`docs/AGENT_UNIVERSES.md`](../../docs/AGENT_UNIVERSES.md).

## Рабочие роли распределённого авторинга

Текущая созидательная цепочка разделена на четыре рабочих правила
ответственности:

- [Оркестратор Мультивселенной](orchestrator.md) распределяет общую цель между
  крупными архитектурными областями;
- [Архитектор Вселенной](architect.md) проектирует параллельные и вложенные
  Atoms и назначает ответственных лидов;
- [Лид Atom](lead.md) отвечает за Atom subtree на любой глубине и определяет
  точные контракты его Process;
- [Исполнитель Process](executor.md) реализует один Process в пределах
  полученного контракта.

Это рабочая терминология развиваемого authoring-контракта, а не названия уже
реализованных RPC или runtime-ролей. Внешний агент-создатель в этих правилах не
равен Agent Atom, который действует внутри Вселенной. Один тип роли Лида может
рекурсивно повторяться на любой глубине, поэтому четыре типа ответственности не
ограничивают глубину графа четырьмя уровнями.

## Структура

```typescript
export default MetaFor("<name>")
  .fields((field) => ({}))
  .superposition({})
  .mass(() => ({}))
  .energy()
  .processes((process, destroy) => [])
  .reactions((reaction) => [])
  .matter(({ state, value, html }) => html``)
  .bulk({
    view: ({ css }) => css``,
  })
```

**Порядок вызовов:** `fields → superposition → mass → energy → processes → reactions → matter → bulk`

`MetaFor` в `meta.ts` предоставляется DSL-средой как глобал; локальный `import "metafor"` не нужен. Обычные TypeScript-модули действий могут импортировать типы явно: `import type { ActionParams } from "@metafor/types/metafor/action"`.

---

## RPC — компактная read-only проекция структуры мира

Этот раздел является каноническим смысловым контрактом RPC-проекций для
клиентов Create MetaFor. [`docs/FORCE.md`](../../docs/FORCE.md) владеет
transport и routing законами Monad RPC, но не формой клиентской проекции.
Клиентские write operations создания Meta и изменения Matter принадлежат
отдельному [RPC-контракту авторинга](rpc.md).

### Что реализовано и проверено сейчас

- `boundary.initialState.read` возвращает полный нормализованный initial state,
  нужный Matrix при рождении.
- `boundary.initialProjection.read` возвращает полный текущий canonical
  projection, которым при рождении пользуется Energy.
- `readGraph` принимает пустой request без выбранного клиентом root. Dark
  получает единственный текущий runtime root из coherent Boundary projection,
  собирает весь reachable declaration/runtime Graph и возвращает root как
  проверяемые данные самого ответа.
- `dark.force.pause` закрывает только внешний вход Agent Particle и ждёт
  согласованную причинную границу checkpoint.
- `dark.force.step` после pause принимает ровно одну Agent Particle и снова
  устанавливает причинную границу.
- `dark.force.stack` возвращает временные границы текущей паузы, а
  `dark.force.resume` открывает внешний вход и очищает этот временный список.
- `bulk.observer.captureViewport` возвращает PNG и компактное доказательство
  Store cut уже подключённого observer-сеанса.
- `dark.force.history.read` возвращает exact current frontier либо ограниченный
  acceptance-sequence range прямо из существующей Dark Force history. Старые
  `dark.history.read/clear` и любой history clear не опубликованы.
- `energy.mass.result.read` возвращает текущий bounded JSON либо base64 result
  одного объявленного Mass key, его digest и causal frontier. Метод принимает
  public Graph Atom locator и не раскрывает внутренний Atom ID.
- `meta.field.value.apply` принимает public Graph Atom locator, semantic Field
  key, типизированное значение и точную ожидаемую causal frontier. Внутренний
  Boundary provider разрешает locator и Field, а Dark Force принимает одну
  Gluon либо Higgs Particle в существующую history.
- `meta.process.execution.read` возвращает для public Graph Atom locator,
  Process key и public execution identity текущий `pending`, `committed`,
  `failed` либо `superseded`, acceptance регистрации, optional settlement,
  доступные Fields/error и exact causal frontier.
- `energy.mass.fence` и `energy.mass.release` являются внутренними lifecycle RPC
  для безопасной работы Boundary с Mass identity, а не клиентским чтением.

В текущем public contract нет проверенного RPC, который возвращает компактный
частичный фрагмент Dark templates/particles вместе с минимальной структурой
мира. `readGraph` возвращает только полный текущий Graph.

### Read contracts одного агента

Новая access policy и конкурентные чтения в этот этап не входят.

`dark.force.history.read` читает существующую append-only Particle-history, а
не создаёт новый журнал. Закрытый request задаёт один cut и ограниченный
диапазон acceptance sequence либо продолжение от causal frontier. Ответ
возвращает `cutId`, фактические границы sequence, `resolution`, признак
усечения, следующий cursor и принятые Particle envelopes. `clear`, rewrite и
автоматическое удаление не публикуются.

`energy.mass.result.read` читает только объявленный Mass key конкретного Atom,
адресованного публичным locator точного Graph snapshot. Request задаёт key,
верхнюю границу bytes и при повторной проверке optional expected digest. Ответ
возвращает digest, exact resolution, causal frontier и bounded JSON либо base64
bytes. `MassHandle`, key-file path, Energy handle и произвольный filesystem
read не раскрываются. Locator является snapshot-local Graph path, защищённым
ожидаемыми root и Meta; provider разрешает его во внутренний Atom ID локально.

`meta.process.execution.read` возвращает наблюдаемый исход Process
для Atom и Process key: public execution identity, `pending`, `committed`,
`failed` либо `superseded`, causal acceptance identity, optional settlement и
доступные result/error data. Acceptance указывает существующую принятую
`photon/test`, settlement — существующую `w+/w- copy`; второй журнал или
execution event Store не создаются. Метод не запускает Process, не меняет State
и не раскрывает Boundary row ID.
Текущие Field values и State по-прежнему читаются через `readGraph`; Process
запускается причинно после предметного Field input, а не отдельным RPC.

Raw `dark.force.step` остаётся проверенным причинным примитивом, но не заменяет
предметный Field RPC: его `path` использует внутреннюю runtime identity,
которой нет в публичном Graph.

### Требование к планируемой проекции

Клиент должен иметь возможность запросить ограниченный read-only фрагмент,
не загружая и не разворачивая всё дерево мира. Точное имя метода и public
request/response types должны появиться одновременно с реализацией и тестами;
до этого они не считаются действующим API.

Планируемая проекция обязана:

1. начинаться с явно выбранного корня или набора Dark template/Particle
   identities и оставаться ограниченной запросом;
2. возвращать только выбранные Dark templates/particles и минимальное topology
   замыкание, необходимое для понимания их положения: требуемую цепочку
   предков, соединяющие edges и identities их endpoints;
3. не раскрывать siblings, descendants или другие ветви только ради построения
   полного дерева; любое дополнительное раскрытие должно быть явно запрошено и
   ограничено;
4. явно отмечать границу или усечение фрагмента, чтобы клиент не принимал
   частичную структуру за полный мир;
5. не возвращать Mass bytes, содержимое key-files, filesystem paths или
   `MassHandle`, а также живые Energy handles. Допустима только уже существующая
   non-content identity декларации, если без неё нельзя понять выбранную
   структуру;
6. не подменять Boundary canonical state и не создавать второй источник истины:
   это наблюдаемая проекция Dark, а не собственный world store клиента.

Этот контракт только read-only. Он не утверждает наличие pause, step, scrub,
historical reconstruction, rewind, write, commit или promotion RPC. Такие
методы не считаются существующими без отдельных public types, реализации и
проверяющих тестов.

### Планируемый bootstrap короткой agent-сессии

Qwen, Gem и другие агенты должны использовать один и тот же RPC surface и одни
public contracts. Отдельные методы или формы ответа под конкретную модель не
создаются. Различаются только выданные сессии capabilities и авторизованная
граница графа; сервер обязан применять эту границу к каждому ответу и каждой
capability.

Каждая новая короткоживущая agent-сессия должна получить явный bootstrap из
трёх согласованных частей:

1. стабильный RPC rules/capability contract с версией и перечнем действительно
   доступных возможностей;
2. ссылку на Git/source snapshot: identity репозитория, неизменяемую revision и
   корень исходной проекции;
3. сериализуемый RPC JSON world snapshot с явно указанным scope.

Bootstrap является переданным новой сессии свидетельством. Агент не должен
полагаться на скрытый долговременный context предыдущей сессии, не указанный в
этом bootstrap, Git/source snapshot или RPC JSON snapshot.

### Scope полной и частичной проекции

Поддерживаются два смысловых режима одного будущего read-only contract:

- **partial/subtree** — проекция внутреннего Atom subtree или связанного
  подграфа ответственности агента;
- **full-world** — проекция всего разрешённого мира, выдаваемая только по
  отдельной явной capability.

По умолчанию scope равен авторизованному внутреннему Atom subtree/graph
responsibility агента. Обычный topology read возвращает только Dark
templates/particles этого scope и минимальное topology замыкание. Если
необходимый edge выходит за границу, внешний endpoint остаётся непрозрачной
boundary identity без раскрытия его содержимого или соседних ветвей.

Full-world scope не подразумевает Mass access. Чтение Mass требует отдельной
явной capability и отдельного контракта. Обычная структурная проекция, включая
full-world, не возвращает unrelated Mass bytes, содержимое key-files,
filesystem paths, `MassHandle` или живые Energy handles.

### Метаданные воспроизводимого snapshot

Каждый bootstrap snapshot должен нести достаточно метаданных, чтобы другая
короткая сессия могла проверить, к какому свидетельству относится JSON:

- версию rules/capability contract;
- identity Git/source repository и неизменяемую revision;
- projection root и объявленную graph boundary;
- identity canonical Boundary snapshot и causal frontier, относительно которых
  построена проекция;
- resolution `exact`, `coarse` или `unknown`;
- явные признаки усечения и непрочитанных branches.

`exact` означает точное свидетельство для указанной revision, frontier и scope,
а не полноту всего мира. `coarse` обозначает агрегированный или интервальный
фрагмент с неопределённостью; его нельзя выдавать за точный набор Particle.
`unknown` означает, что точность или причинная позиция не доказаны. Snapshot с
усечёнными branches остаётся partial, даже если все данные внутри его
объявленной границы имеют resolution `exact`.

Имена bootstrap/projection методов, JSON schema, Boundary snapshot identity и
frontier representation пока не реализованы и не входят в действующий public
API. Текущий проверенный RPC surface остаётся перечисленным в разделе
«Что реализовано и проверено сейчас».

#### Проверенный первый локальный профиль

Один доверенный локальный агент может выполнить полную рабочую сессию без
нового bootstrap endpoint и без скрытого context. Внешний task envelope
передаёт digest применимых документов-владельцев, Git revision, source
revision, результат `meta.capabilities.read`, текущий `readGraph`, exact Force
frontier, цель и root scope. На этом этапе используется полный Graph текущего
root: будущая частичная проекция и новая access policy не считаются
реализованными.

Тот же RPC source применяет structural patch с автоматической source
projection, меняет предметный Field, а затем проверяет State, Process outcome,
Mass result и Bulk viewport evidence по публичным RPC. Следующий запрос history
начинается с `throughSequence + 1` предыдущей exact frontier и не повторяет
Graph snapshot. Истиной результата остаются эти первичные проекции и
существующая Particle-history, а не память агента и не второй журнал.

### Gem на AI-server — планируемый bootstrap profile

Gem на AI-server использует тот же RPC surface и contracts, что другие агенты.
Это профиль bootstrap и budget, а не отдельный набор Gem endpoints. Он не
считается реализованным, пока соответствующие public types, providers и tests
не подтверждены.

Начальный task bootstrap должен содержать:

- scoped JSON snapshot Dark templates/particles и минимального topology
  замыкания для авторизованного Atom subtree/graph;
- task envelope с immutable source revision, projection root/scope, ожидаемым
  output или proposal, resource budget и явным owner gate для canonical commit;
- capability registry, уже отфильтрованный по этому graph scope и task budget.

После bootstrap сессия получает не повтор полного context, а компактный delta
на каждый доступный logical tick. Delta содержит только изменившиеся
templates/particles, минимальные topology consequences и новую causal frontier
identity. Пропущенный frontier или разрыв последовательности требует явного
resync в пределах того же scope; клиент не достраивает пропуск из скрытого
context и не объявляет его точным.

Mass отсутствует в обычном topology snapshot и delta. Действующий
`energy.mass.result.read` делает отдельный bounded fetch объявленного key по
public Atom locator, возвращает digest и exact live resolution, а не
`MassHandle`, filesystem path или расширение world snapshot. Текущая
реализация подключена для доверенного локального контура; отдельная Mass-read
capability и scope policy остаются отложенной работой.

History fetch также остаётся отдельной capability. Каждый результат обязан
сообщать resolution:

- `exact` — точные Particle для доказанного causal frontier/interval;
- `coarse` — агрегат или интервал неопределённости без выдуманных точных ticks;
- `unknown` — история или frontier недостаточны для доказательства.

Действующий `dark.force.history.read` возвращает exact frontier и bounded
acceptance-sequence range существующего cut. Старые типы
`dark.history.read/clear` и отдельный старый класс history не являются рабочей
поверхностью Dark Monad; rewind и history clear не опубликованы.

Gem возвращает proposal и доказательства выполненных validations в формате,
заданном task envelope. Даже при наличии source-write capability canonical
commit не выполняется без отдельной `commit` capability и решения владельца.
Resource budget ограничивает время, вычисление, объём snapshot/delta/history и
число tool calls; исчерпание budget не расширяет scope и не разрешает commit.

### Capability registry для авторинга Process

Bootstrap Process-authoring агента должен включать явный capability registry.
Registry описывает только действительно подключённые и проверенные tool
contracts; отсутствие записи означает отсутствие capability. Нельзя считать
tool доступным по имени агента, окружению, прошлой сессии или наличию кода в
репозитории.

Каждая registry entry должна указывать:

- стабильную identity и версию tool contract;
- owning contour: MetaFor, Interpreter либо явно предоставленный
  production/vendor tool contract;
- разрешённый operation class: `read`, `propose/write Process`,
  `validate/test` или `commit`;
- требуемый Atom subtree/graph scope и дополнительные ограничения ресурса;
- может ли операция касаться live state; по умолчанию — нет;
- отдельное approval/owner gate, если capability допускает commit или live
  mutation.

Группировка по owning contour является routing requirement, а не утверждением,
что все такие tools существуют:

- **MetaFor** — source/contracts и разрешённые проверки внутри указанного
  MetaFor graph scope;
- **Interpreter** — только явно зарегистрированные операции управления
  принадлежащими ему source/process surfaces;
- **production/vendor** — только отдельно переданные contracts с явным scope и
  approval. Само упоминание Production или vendor не даёт права читать их
  деревья, данные или runtime.

Текущая доверенная локальная authoring identity может получить
`meta.declaration.write` и через `meta.declaration.apply` выполнить Process
`add/replace` в разрешённом scope. Операция проверяет descriptor, handlers и
owned `actions/*.ts`, проводит одну принятую Process Inflaton через Dark Force и
Boundary и только затем публикует source targets того же patch. Эта capability
не выполняет Git commit и не выдаётся внутреннему Agent Atom автоматически.

Будущий внутренний Process-authoring Agent получает только минимальный набор
capabilities собственного Atom subtree. Proposal-only capability не изменяет
canonical live world; live mutation и canonical commit остаются отдельными
явно выданными возможностями. Фактическая привязка такого Agent Atom к
structural authoring относится к [`MF-405`](../../project/tasks/MF-405.md) и не
считается реализованной из-за наличия текущего trusted local RPC.

### Фактически подтверждённые tool surfaces

Этот inventory фиксирует действующие entrypoints, но сам по себе не выдаёт их
agent-сессии. Фактическая capability всегда привязана к routed source identity,
версии contract и разрешённому Meta scope.

**MetaFor**

- `create-metafor/src/cli.ts`, вызываемый как `bun create metafor`, создаёт один
  независимый peer Meta-репозиторий непосредственно под выбранным каталогом
  владельца. Canonical `src` всегда имеет форму `<owner>/<repository>`; CLI
  отклоняет создание внутри существующего Meta-репозитория. Он записывает
  полный template, выполняет `bun install`, `git init`, `git add` и initial
  commit, поэтому остаётся отдельным write/commit entrypoint с высоким
  side-effect risk.
- `meta.create` создаёт canonical peer Meta через тот же template path, но не
  выполняет install, `git add`, commit, push или materialization нового root.
- `meta.matter.apply` и `meta.declaration.apply` являются действующими
  structural authoring RPC. Последний поддерживает metadata, Field, State,
  Mass, Reaction, Process и Bulk; Process `add/replace` может публиковать один
  проверенный owned `actions/*.ts` как source target того же принятого patch.
- `meta.capabilities.read` и `meta.source.revision.read` возвращают фактически
  выданные grants и revisions без раскрытия source path либо bytes.
- Root scripts `bun run typecheck`, `bun run typecheck:expect-errors`,
  `bun run test` и `bun run check` являются validation entrypoints для
  разрешённого MetaFor checkout. `typecheck` использует `--noEmit`; test/check
  запускают код тестов и поэтому требуют отдельного resource/process scope.
- Git add/commit/push RPC и автоматически выданной capability внутреннего Agent
  Atom по-прежнему нет.

**Interpreter**

- Единственный поддерживаемый client entrypoint —
  `.codex/skills/interpreter/scripts/interpreter.ts` из точного project root;
  он открывает `/tools` конкретного project-owned Interpreter и требует exact
  process selector.
- Подтверждённые read surfaces: `health.get`, `process.list`, `process.get`,
  `context.get`, `source.read`, `source.read_many`, `git.status`,
  `events.tail`, `console.tail`. Они читают только выбранный Interpreter
  workspace/process context; UI-only `space.*`, `process.focus` и
  `source.open` не являются авторингом Process.
- Подтверждённые write/debug surfaces: `source.write` и
  `source.apply_patch` изменяют source выбранного workspace и автоматически
  перезапускают его Bun process; `process.start`, `process.close`,
  `process.action` и `breakpoint.set/remove` меняют live debugger/process
  state. Их нельзя выдавать proposal-only сессии без отдельного isolated
  workspace и `liveState: true`.
- Interpreter предоставляет только `git.status`. `git commit`, push и
  owner-gated commit tool в его registry не подтверждены.

**Production**

- Архивный `/Users/zavx0z/production/package.json` содержит project scripts, а
  не agent tool registry. Подтверждённый статический validation entrypoint
  `admin:typecheck` запускает TypeScript с `--noEmit` в `app/admin`.
- `admin:test`, `admin:build` и `email:test` существуют, но запускают tests,
  build или environment-backed SMTP code. Без отдельной изоляции и проверки
  side effects они не являются безопасными default capabilities.
- `.ai/commit.md` является prompt-контрактом генерации текста commit message из
  переданного diff, а не исполняемым commit tool. Подтверждённых Production
  source-write или commit tools для Process-authoring registry не найдено.

**Production vendor**

- Путь `/Users/zavx0z/production/vendor` в проверенном архивном контуре
  отсутствует. Ни одного vendor tool contract, version или entrypoint
  подтвердить нельзя; registry обязан оставить этот contour пустым до явной
  поставки и отдельной проверки inventory.

---

## fields — только примитивы

```typescript
.fields((field) => ({
  name: field.string.required("Гость"),
  age: field.number.required(18, { label: "Возраст" }),
  status: field.enum("draft", "published").optional({ label: "Статус" }),
  relatedIds: field.array.required([], { label: "Связанные узлы" }),
}))
```

**Правила:**

- Только примитивы: `string`, `number`, `boolean`, `enum`, `array`
- Сохраняемые объекты — в содержимом объявленного JSON-ключа Mass; Process
  читает и пишет их через `MassHandle`
- `.optional({ label: "..." })` — метаданные для enum
- **array сейчас является topology/runtime-связью `number[]`:** `field.array.required([], { label })`
- **Label должен быть человекопонятным:** язык выбирается по контексту пакета, но подпись должна описывать поле или флаг так, как пользователь увидит его в UI/документации.

**Примеры label:**

```typescript
.fields((field) => ({
  // Правильно: человекопонятная подпись + опция
  message: field.string.optional({ label: "Сообщение (-m)" }),
  all: field.boolean.optional({ label: "Все файлы (-a)" }),
  error: field.string.optional({ label: "Error" }),
  amend: field.boolean.optional({ label: "Исправить (--amend)" }),

  // Неправильно: техническая или непонятная подпись
  message: field.string.optional({ label: "msg" }),
  all: field.boolean.optional({ label: "bool" }),
}))
```

---

## Superposition — граф переходов

```typescript
.superposition({
  ожидание: { загрузка: { userId: { gt: 0 } } },
  загрузка: { успех: {}, ошибка: {} },
  успех: { ожидание: { ready: { null: true } } },
})
```

**Условия по виду Field:**

- `boolean`: `eq`, `notEq`, `logicalEq`, `null`;
- `number`: `eq`, `notEq`, `gt`, `gte`, `lt`, `lte`, `notGt`, `notGte`,
  `notLt`, `notLte`, `between`, `in`, `notIn`, `null`;
- `string`: `eq`, `notEq`, `startsWith`, `endsWith`, `include`,
  `notInclude`, `notStartsWith`, `notEndsWith`, `pattern`, `length`,
  `between`, `in`, `notIn`, `null`;
- `enum`: `eq`, `notEq`, `oneOf`, `notOneOf`, `null`;
- `array`: `length`, `includes`, `notIncludes`, `every`, `some`, `isEmpty`,
  `null`.

Краткое значение означает `eq`. Краткий массив означает точное равенство
массива. Все проверки одного перехода соединяются через «и». `between`,
`length.min` и `length.max` включают границы. `every` для пустого массива
истинно, `some` — ложно.

`null` означает отсутствие значения optional Field и не совпадает с `0`,
`false`, пустой строкой, первым вариантом enum или пустым массивом. Операции,
кроме `null`, проверяют только существующее значение.

Пустое условие, неизвестная операция, неподходящий вид Field и неверное
значение являются ошибкой декларации. Они не пропускаются и не превращают
переход в безусловный. Числовое условие имеет один результат независимо от
того, каким способом Matrix выполняет такт.

**Переход по значению:**

```typescript
// Краткая запись для optional полей
состояние: { ожидание: { cmd: null } }  // cmd === null

// Развёрнутая запись для optional полей
состояние: { ожидание: { cmd: { null: false } } }  // cmd !== null
состояние: { ожидание: { cmd: { null: true } } }   // cmd === null
```

**Правила имён состояний:**

- Имена на русском языке
- Описательные имена: `ожидание`, `загрузка`, `успех`, `ошибка`
- Для имён с пробелами использовать кавычки: `"рабочие деревья"`, `"режим редактирования"`
- Самопереход запрещён даже с условием: `готов: { готов: {...} }` недопустим
- Повторение проходит через отдельное содержательное состояние:
  `готов → создание снимка → готов`

```typescript
.superposition({
  ожидание: {
    "рабочие деревья": { cmd: { startsWith: "worktree" } },
    "режим просмотра": { cmd: { startsWith: "show" } },
  },
  "рабочие деревья": { ожидание: {} },
  "режим просмотра": { ожидание: {} },
})
```

**Триггеры переходов:**

```typescript
.superposition({
  "получение команды": {
    "определение операции": { command: { null: false } },  // ✅ Только если команда есть
  },
  "определение операции": {
    "выполнение": { operation: { null: false } },  // ✅ Успех (operation установлен)
    "ошибка": { error: { null: false } },  // ✅ Ошибка (error установлен)
  },
  "выполнение": {
    "получение команды": { operation: null },  // ✅ Завершение выполнения
  },
  "ошибка": {
    "получение команды": { error: null },  // ✅ Сброс ошибки (краткая форма)
  },
})
```

Fields управляют работой Atom. Внешний агент или родитель задаёт значение Field,
после чего Superposition разрешает состояние с Process. Не вызывай action
напрямую и не добавляй скрытый imperative API поверх Atom.

```typescript
.fields((field) => ({
  profileAddress: field.string.optional({ label: "Адрес сохранённого профиля" }),
  browserInstanceId: field.string.optional({ label: "Экземпляр браузера" }),
  rtcConnected: field.boolean.required(false, { label: "WebRTC подключён" }),
  screenshotPath: field.string.optional({ label: "Путь нового снимка" }),
  error: field.string.optional({ label: "Ошибка" }),
}))
.superposition({
  "ожидание профиля": {
    "запуск браузера": { profileAddress: { null: false } },
  },
  "запуск браузера": {
    "ошибка": { error: { null: false } },
    "подключение WebRTC": { browserInstanceId: { null: false } },
  },
  "подключение WebRTC": {
    "ошибка": { error: { null: false } },
    "браузер готов": { rtcConnected: { eq: true } },
  },
  "браузер готов": {
    "создание снимка": { screenshotPath: { null: false } },
  },
  "создание снимка": {
    "ошибка": { error: { null: false } },
    "браузер готов": { screenshotPath: { null: true } },
  },
  "ошибка": null,
})
```

**Порядок триггеров:**

Триггеры проверяются **по порядку** через `Object.entries().find()`. **Первое совпадение** выигрывает.

```typescript
.superposition({
  "парсинг опций": {
    // ✅ Сначала более специфичные (3 опции)
    "амед с подписью и сообщением": { 
      amend: { null: false }, 
      signoff: { null: false }, 
      message: { null: false } 
    },
    // ✅ Затем комбинации (2 опции)
    "коммит всех файлов с сообщением": { 
      all: { null: false }, 
      message: { null: false } 
    },
    // ✅ В конце одиночные (1 опция)
    "коммит с сообщением": { message: { null: false } },
    "коммит всех файлов": { all: { null: false } },
  },
})
```

**Правило:** Более специфичные условия (с несколькими проверками) должны идти **ПЕРЕД** менее специфичными (с одной проверкой).

**Пример:**

- `git commit --amend -s -m "msg"` → ✅ "амед с подписью и сообщением" (3 опции, первое совпадение)
- `git commit -a -m "msg"` → ✅ "коммит всех файлов с сообщением" (2 опции)
- `git commit -m "msg"` → ✅ "коммит с сообщением" (1 опция)

**Process:**

```typescript
.energy<{
  channel: BroadcastChannel
}>()
.processes((process) => [
  process("определение операции")
    .action(async ({ energy, field, mass, self, signal, value }) => {
      const mod = await import("./actions/detectOperation.ts")
      return mod.default({ energy, field, mass, self, signal, value })
    })
    .success(({ update, data }) => update(data))
    .error(({ update, error }) => update({ error: error.message })),
  process("выполнение")
    .action(async () => {
      const mod = await import("./actions/execute.ts")
      return mod.default()
    })
    .success(({ update }) => update({ operation: null })),
])
```

---

## Жизненный цикл process

**Порядок выполнения:**

```text
1. Вход в состояние
   ↓
2. action() → import("...") → return data ИЛИ throw error
   ↓
3. success() ИЛИ error() → update() → поля обновлены
   ↓
4. measurement() → проверка триггеров по полям
   ↓
5. Переход в следующее состояние (если триггер сработал)
```

**Важно:**

- ✅ **Триггеры проверяются ПОСЛЕ завершения process** (после success/error)
- ✅ **Поля могут обновляться в process**, но переход произойдёт только после завершения
- ❌ **Во время выполнения action** триггеры НЕ проверяются

**Пример:**

```typescript
.processes((process) => [
  process("загрузка")
    .action(async ({ energy, field, mass, self, signal, value }) => {
      const mod = await import("./actions/fetchData.ts")
      return mod.default({ energy, field, mass, self, signal, value })
    })
    .success(({ update, data }) => {
      update({ data })  // Финальное обновление
      // ✅ Теперь проверятся триггеры
    }),
])
```

**Принцип:** Process — атомарная операция. Все обновления полей внутри process накапливаются, и только после завершения (success/error) проверяются триггеры переходов.

---

## Mass — сохраняемые key-files

```typescript
.mass((mass) => ({
  profiles: mass.json({ label: "Профили" }),
  screenshot: mass.binary({ label: "Последний скриншот" }),
}))
```

`.mass(...)` объявляет только локальное имя ключа, codec (`json` или `binary`) и
необязательные `label`/`description`. Key ID, путь, MIME и начальное содержимое в
Meta не задаются.

Process, Reaction, destroy и Matter получают не содержимое файлов, а объект
объявленных `MassHandle`. Handle предоставляет `readBytes()`, `readText()`,
`readJson()` и `write(value)`. JSON-ключ сериализует переданное значение;
binary-ключ принимает только `Uint8Array`. `Map`, `Set`, функции и живые handles
не являются JSON-содержимым Mass; `MediaStream`, track, `RTCDataChannel`, socket,
peer connection и decoder относятся к Energy.

Boundary владеет declaration identity, глобальным key ID, membership и sources
Matter binding. Energy открывает разрешённые ключи в плоском каталоге
`mass/<key-id>.<extension>` и заменяет файл атомарно. Bytes не проходят через
Force/Boundary/Matrix, а версионирование в текущий контракт не входит. Прямые
Matter bindings переиспользуют выданные key IDs; identity нельзя выводить из
Atom ID или совпадения bytes.

Если нет сложных данных:

```typescript
.mass(() => ({}))
```

---

## Energy — живые runtime-сущности

```typescript
.energy<{
  channel: BroadcastChannel
  socket: WebSocket
  mediaStream: MediaStream
  dataChannel: RTCDataChannel
}>()
```

Energy declaration задаёт только постоянные TypeScript-типы сущностей. Generic
не существует в JavaScript, поэтому DSL не создаёт фиктивный объект и не
хранит `null` вместо живых сущностей. Реальный `BroadcastChannel` или
`WebSocket` создаётся action-модулем, помещается в `energy` процессом и
освобождается `destroy`-процессом.

В типе `.energy<EnergyType>()` запрещены:

- функции и фабрики;
- `new WebSocket(...)`, `new BroadcastChannel(...)` и другие side effects;
- `fetch`, чтение файлов и установление соединений;
- nullable union вроде `WebSocket | null`, скрывающий lifecycle-ошибку.

Если Energy не нужна, секция всё равно остаётся обязательной:

```typescript
.energy()
```

---

## Практический Browser Atom

Минимальный Browser Atom не имеет команды «запустить браузер». Его endpoint
изменяет Fields:

1. `profileAddress` получает адрес сохранённого профиля;
2. Process `подготовка WebRTC` рождает минимальный Bun signaling endpoint;
3. Process `запуск браузера` напрямую использует библиотеки Capsule и запускает
   сохранённый профиль без HTTP lifecycle API;
4. Process `подключение к браузеру` использует server-side `werift` и помещает
   endpoint, session, `MediaStream`, video track, `RTCDataChannel`, peer,
   decoder и очередь управления только в Energy;
5. состояние `браузер готов` условно materialize соседние дочерние Meta-пакеты
   `screenshot` и `control`, передавая им прямые Field-, Mass- и
   Energy-bindings;
6. `screenshotPath` разрешает дочерний цикл `ожидание снимка → создание снимка
   → ожидание снимка`; success записывает PNG, сохраняет `lastScreenshotPath` и
   очищает shared `screenshotPath`;
7. `controlCommand` разрешает дочерний цикл `ожидание команды → отправка
   команды → ожидание команды`; success сохраняет сериализуемый результат и
   очищает shared `controlCommand`.

Если несколько независимых намерений должны начаться в одном такте, endpoint
передаёт их одним Gluon в `value.fields`. Boundary фиксирует такой patch одним
canonical `ts`, а Matrix разрешает все подходящие переходы параллельно. Нельзя
добавлять искусственный `sequence` между Screenshot и Control или ждать
завершения одного Process перед запуском другого.

`owner/capsule`, `owner/capsule-browser`, `owner/capsule-screenshot` и
`owner/capsule-control` являются отдельными peer Meta-репозиториями. `meta.ts`
каждого лежит в корне собственного репозитория; Matter topology не повторяется
в файловом пути.

```typescript
// cluster/owner/capsule-browser/meta.ts
.superposition({
  "ожидание профиля": {"подготовка WebRTC": {profileAddress: {null: false}}},
  "подготовка WebRTC": {"запуск браузера": {rtcEndpoint: {null: false}}},
  "запуск браузера": {"подключение к браузеру": {instanceId: {null: false}}},
  "подключение к браузеру": {"браузер готов": {rtcConnected: {eq: true}}},
  "браузер готов": {"остановка": {stopRequested: {eq: true}}},
  "остановка": {"остановлен": {}},
  "остановлен": null,
})
.matter(({state, value, mass, energy, html}) => html`
  ${state === "браузер готов" && html`
    <meta-for
      src="owner/capsule-screenshot"
      fields=${{path: value.screenshotPath, lastPath: value.lastScreenshotPath}}
      mass=${mass}
      energy=${energy} />
  `}
  ${state === "браузер готов" && html`
    <meta-for
      src="owner/capsule-control"
      fields=${{command: value.controlCommand, result: value.controlResult}}
      mass=${mass}
      energy=${energy} />
  `}
`)
```

Каждый Process по-прежнему использует только тонкий wrapper `dynamic import →
direct return`. `.mass()` объявляет metadata ключей, а Energy проецирует выданные
Boundary key IDs в `MassHandle`. Дочерние прямые `mass=${mass}` и
`energy=${energy}` сохраняют локальную handle/store identity. Исходный путь
Meta-пакета не задаёт runtime-вложенность; граф задаёт Matter. Постоянный WebRTC
listener остаётся в Energy между тактами: возвращение Screenshot/Control Atom в
ожидание не переподключает socket, peer или DataChannel и не создаёт окно потери
сообщения.

---

## Processes — process(state, action/success/error) destroy(state)

**Параметры process:**

| Параметр | Описание                                          |
| -------- | ------------------------------------------------- |
| `field`  | **Fields** — типизированные декларации полей      |
| `value`  | **Значения полей** — текущие данные атома         |
| `mass`   | **Mass** — handles объявленных key-files          |
| `energy` | **Energy** — живые runtime-сущности               |
| `signal` | **AbortSignal** — остановка старого execution     |
| `self`   | **Идентификатор** — полный путь к атому           |

**Принцип:**

- **field** — декларация поля (схема, тип, валидатор). Определяется в `.fields()`. Доступно в `process.action({ field })`.
- **value** — значение поля (текущие данные). Доступно в `process.action({ value })`.

**Важно:** Действия процессов выносятся в отдельные ESM-модули.

### Структура action-модуля

```typescript
// actions/fetchUser.ts
import type { ActionParams } from "@metafor/types/metafor/action"
import type { FieldType } from "@metafor/types/metafor/fields"
import type { MassHandle } from "@metafor/types/metafor/schema"

export interface FetchUserResult {
  name: string
  email: string
}

type FetchUserFields = { id: FieldType<"number", true, number> }
type FetchUserValue = { id: number }
type FetchUserMass = { cache: MassHandle }
type FetchUserEnergy = { client: { get(url: string): Promise<Response> } }

export default async function action({
  field,
  value,
  mass,
  energy,
  signal,
}: ActionParams<FetchUserFields, FetchUserMass, FetchUserValue, FetchUserEnergy>): Promise<FetchUserResult> {
  // field.id — декларация поля (схема)
  // value.id — значение поля (данные)
  // mass.cache — handle объявленного JSON key-file
  // energy — живые сущности текущего Energy runtime
  const res = await fetch(`/api/users/${value.id}`, {signal})
  const user = await res.json() as FetchUserResult
  await mass.cache.write({ [value.id]: user })
  return user
}
```

**Параметры action:**

| Параметр | Описание                                                      |
| -------- | ------------------------------------------------------------- |
| `field`  | **Декларация полей** — схема, тип, валидатор (из `.fields()`) |
| `value`  | **Значения полей** — текущие данные атома                     |
| `mass`   | **Mass** — handles объявленных JSON/binary key-files          |
| `energy` | **Energy** — живые runtime-сущности                           |
| `signal` | **AbortSignal** — cooperative остановка execution             |
| `self`   | **Идентификатор** — полный путь к атому                       |

**Принцип:**

- **field** — декларация поля (схема, тип, валидатор)
- **value** — значение поля (текущие данные)

**Правила:**

1. **Первая и единственная подготовительная инструкция:** `await import("...")`
2. **Следующая и последняя инструкция:** direct `return` вызова export этого модуля
3. **Любое имя экспорта:** `default`, `action`, `process`, `load`, `run`, `execute`

Между `import` и `return` нельзя объявлять промежуточные вычисления, менять
`mass`/`energy` или выполнять cleanup. Runtime-валидатор отклоняет такой mixed
wrapper. В аргументах внешнего вызова разрешено только декларативное wiring
готовых значений: никаких spread/iterator, вложенных вызовов, присваиваний,
coercion/operators, `new`, `await` или других side effects. Сигнатура wrapper — только простая
деструктуризация имён без default/rest. Вся исполняемая логика принадлежит
импортированному модулю. Computed keys/access и глобальные значения также не
входят в wiring: используются только параметры wrapper, их прямые свойства,
object-поля и примитивные литералы.

### Пример в meta.ts

```typescript
.processes((process, destroy) => [
  process("loading", { label: "Загрузка", env: ["browser", "node"] })
    .action(async ({ energy, field, mass, self, signal, value }) => {
      const mod = await import("./actions/fetchUser.ts")
      return mod.default({ energy, field, mass, self, signal, value })
    })
    .success(({ update, data }) => update({ name: data.name }))
    .error(({ update, error }) => update({ error: error.message })),
])
```

**Примечание:** `success` и `error` обработчики остаются inline в DSL. Только `action` выносится в отдельный модуль.

`destroy` также не содержит cleanup-логику внутри декларации. Он динамически
импортирует отдельный модуль, которому передаются раздельные `energy` и `mass`:

```typescript
destroy("остановка", { env: ["server"] }).before(async ({ energy, mass }) => {
  const mod = await import("./actions/release.ts")
  return mod.default({ energy, mass })
})
```

После `before` Energy runtime удаляет набор живых сущностей этого Atom. Mass
имеет отдельное хранилище и отдельный lifecycle.

**Параметры process:**

| Параметр | Тип              | Описание                                                                 |
| -------- | ---------------- | ------------------------------------------------------------------------ |
| `label`  | `string`         | Название процесса для документации                                       |
| `desc`   | `string`         | Описание процесса для документации                                       |
| `env`    | `ExecutionEnv[]` | Среды исполнения: `"browser"`, `"node"`, `"worker"`, `"server"`, `"any"` |

**Примеры env:**

```typescript
// Только браузер
process("loading", { env: ["browser"] })

// Браузер и NodeType.js
process("loading", { env: ["browser", "node"] })

// Любая среда
process("loading", { env: ["any"] })
```

**Типизация возвращаемого значения:**

```typescript
// meta.ts: wrapper только передаёт точные типы внешнему модулю
.action(async ({ energy, field, mass, self, signal, value }) => {
  const mod = await import("./actions/getGroup.ts")
  return mod.default({ energy, field, mass, self, signal, value })
})
```

```typescript
// actions/getGroup.ts: результат выводится из точного типа Value
type GroupValue = {
  group: "start" | "work" | "examine" | null
}
type GroupParams = {
  field: Record<string, unknown>
  value: GroupValue
  mass: Record<string, never>
  energy: Record<string, never>
  signal: AbortSignal
  self: { atom: string; meta: string; path: string }
}

export default async function action({
  value,
}: GroupParams): Promise<{ group: NonNullable<GroupValue["group"]> }> {
  const group = await detectGroup()
  return { group }
}

// ❌ Не хардкодить строковый литерал
return { group: group as "start" }
```

Если процессов нет:

```typescript
.processes((process, destroy) => [])
```

---

## Reactions — события других атомов

```typescript
.reactions((reaction) => [
  [["idle", "loading"], reaction({ label: "Обработка" })
    .filter({ meta: "child", op: "replace", path: "/fields" })
    .equal(({ update, patch }) => update({ value: patch.value }))],
])
```

**Фильтры:** `meta`, `op` (add|replace|remove|test), `path` (/\|/fields\|/state), `value`

Если реакций нет:

```typescript
.reactions((reaction) => [])
```

---

## Matter — иерархия и runtime bindings атомов

```typescript
.matter(({ state, value, mass, energy, html }) => html`
  <meta-for
    src="owner/project-${value.operation}"
    fields=${{ command: value.command, args: value.args }}
    mass=${{ cache: mass.cache }}
    energy=${{ socket: energy.socket }} />
  ${state === "ошибка" && html`
    <meta-for
      src="owner/project-error"
      fields=${{ message: value.error }} />
  `}
`)
.bulk({
  view: ({ css }) => css`.container { padding: 1rem; }`,
})
```

**Правила:**

- Matter описывает только иерархию атомов, а не локальную HTML-разметку
- Теги `<meta-for>` самозакрывающиеся: `<meta-for src="..." />`
- Поля передаются через атрибут `fields={{ ... }}`
- Точная прямая передача ordinary scalar Field, например
  `fields=${{ path: value.screenshotPath }}`, создаёт shared canonical Value:
  ребёнок, родитель и другие связанные siblings изменяют одну величину
- Любое вычисление (`+`, template, condition, несколько dependencies) создаёт
  независимый дочерний Field; одинаковые текущие значения сами по себе Fields
  не связывают
- Имена внутри строковых литералов вычисляемого атрибута сохраняются дословно:
  совпадение с именем переменной не создаёт dependency и не заменяется
  внутренним индексом parser
- `enum` и `array` являются topology Fields и в entanglement не участвуют
- Рабочая Mass передаётся отдельно через `mass=${...}`, живые Energy-сущности —
  через `energy=${...}`
- Для передачи всего родительского store используй `mass=${mass}` или
  `energy=${energy}`; это exact-reference alias внутри одного Energy runtime
- `mass` binding может зависеть только от `mass`, а `energy` binding — только от
  `energy`; не смешивай домены и не помещай в binding функции, `new`, I/O или
  создание соединений
- Для Mass/Energy в SQLite фиксируются только `massBinding` и `energyBinding`
  descriptors; значения и живые объекты остаются в локальных Energy stores
- Для прямого Field binding Boundary отдельно фиксирует source relation и общий
  Value identity. Это canonical Field data, а не Mass/Energy object
- `fields` expression materialized Matter edge можно заменить на лету:
  Boundary перестраивает source/value relation, Graviton переносит новый Atom
  projection, а Matrix заново готовит shared CPU/GPU layout до следующего такта
- Установленный binding не вычисляется на каждом claim; его инвалидирует
  Graviton, изменивший Matter continuation ребёнка или отношение Atom/Topology
  к owning parent
- Если dependency ещё не создана, дочерний Process не claim-ится до следующего
  релевантного trigger
- Если fields === null, ничего не рендерится
- Ошибки отображаются через отдельный атом
- В сериализованном matter допустимы только topology-узлы: `meta`, `log`, `cond`, `map`
- `&&` и тернарный `? :` допустимы только если их basis — `state` или `enum`
- `map()` в matter допустим только по `array`-полю topology
- Динамический `src` допустим только если он зависит от одного статического `enum`-поля
- После вычисления каждый вариант `src` обязан по-прежнему содержать ровно
  `owner/repository`; значение enum не может добавлять третий сегмент
- Если dynamic `src` уже зависит от `enum`, не оборачивай его в `value.mode && ...`: direct `<meta-for src="...${value.mode}" />` достаточно, `null` не должен материализовать атом `...-null`
- Тернарная ветвь сохраняет все свои `<meta-for>` в авторском порядке. Пустая
  ветвь не создаёт Matter, а второй узел `then` не становится первым узлом
  `else`
- Не поднимай в topology branch-choice по `boolean`, `string`, `number` или `mass`
- Не рендери в matter `div`, `span`, `button`, текст и прочие HTML-элементы — это не атомы

Пример обратной записи без отдельного RPC:

```typescript
// Родитель
.matter(({ value, html }) => html`
  <meta-for
    src="zavx0z/capsule-screenshot"
    fields=${{ path: value.screenshotPath }} />
`)

// Дочерний Process после записи файла
.success(({ update }) => update({ path: null }))
```

`path` ребёнка и `screenshotPath` родителя — одна каноническая величина.
Очистка ребёнком очищает родителя и разрешает переходы всех Atom, читающих эту
величину, в одном параллельном time step. Если написать
`path: value.screenshotPath + ""`, это уже computed-copy без обратной связи.

**Topology-семантика в matter:**

```typescript
.matter(({ state, value, html }) => html`
  ${state === "готово" && html`<meta-for src="zavx0z/project-panel" />`}
  ${state === "загрузка"
    ? html`<meta-for src="zavx0z/project-spinner" />`
    : html`<meta-for src="zavx0z/project-content" />`}
  <meta-for src="owner/project-${value.mode}" />
  ${value.mode === "card"
    ? html`<meta-for src="zavx0z/project-card" />`
    : html`<meta-for src="zavx0z/project-table" />`}
`)

// ❌ Нельзя: boolean не является topology basis
.matter(({ value, html }) => html`
  ${value.enabled ? html`<meta-for src="owner/project-x" />` : html`<meta-for src="owner/project-y" />`}
`)

// ❌ Нельзя: mass не является topology basis
.matter(({ mass, html }) => html`
  ${mass.cache ? html`<meta-for src="owner/project-x" />` : html`<meta-for src="owner/project-y" />`}
`)

// ❌ Нельзя: optional enum не нужно проверять через truthy/null guard
.matter(({ value, html }) => html`
  ${value.mode && html`<meta-for src="owner/project-${value.mode}" />`}
`)

// ❌ Нельзя: HTML belongs to Bulk, not matter
.matter(({ value, html }) => html`
  <div>${value.title}</div>
`)
```

---

## Пример атома

```typescript
export default MetaFor("git")
  .fields((field) => ({
    operation: field.enum("start", "work", "examine").optional({ label: "Тип операции" }),
    error: field.string.optional({ label: "Ошибка" }),
    command: field.string.optional({ label: "Команда" }),
    args: field.string.optional({ label: "Аргументы" }),
  }))
  .superposition({
    "получение команды": {
      "определение операции": { command: { null: false } },
    },
    "определение операции": {
      "выполнение": { operation: { null: false } },
      "ошибка": { error: { null: false } },
    },
    "выполнение": {
      "получение команды": { operation: null },
    },
    "ошибка": {
      "получение команды": { error: null },
    },
  })
  .mass((mass) => ({attempts: mass.json()}))
  .energy()
  .processes((process) => [
    process("определение операции")
      .action(async ({ energy, field, mass, self, signal, value }) => {
        const mod = await import("./actions/detectOperation.ts")
        return mod.default({ energy, field, mass, self, signal, value })
      })
      .success(({ update, data }) => update(data))
      .error(({ update, error }) => update({ error: error.message })),
    process("выполнение")
      .action(async () => {
        const mod = await import("./actions/execute.ts")
        return mod.default()
      })
      .success(({ update }) => update({ operation: null })),
  ])
  .reactions(() => [])
  .matter(({ state, value, html }) => html`
    <meta-for src="owner/project-${value.operation}" fields=${{ command: value.command }} />
    ${state === "ошибка" && html`
      <meta-for src="owner/project-error" fields=${{ message: value.error }} />
    `}
  `)
  .bulk()
```

### Пример action-модуля: detectOperation.ts

```typescript
// actions/detectOperation.ts
import type { ActionParams } from "@metafor/types/metafor/action"
import type { FieldType } from "@metafor/types/metafor/fields"
import type { MassHandle } from "@metafor/types/metafor/schema"

interface DetectOperationValue {
  command?: string | null
}

interface DetectOperationResult {
  operation: "start" | "work" | "examine"
}

type GitFields = {
  operation: FieldType<"enum", false, undefined, readonly ["start", "work", "examine"]>
  error: FieldType<"string">
  command: FieldType<"string">
  args: FieldType<"string">
}
type GitValue = {
  operation: "start" | "work" | "examine" | null
  error: string | null
  command: string | null
  args: string | null
}
type GitMass = { attempts: MassHandle }
type GitEnergy = Record<never, never>

export default async function action({
  mass,
  energy,
  value,
}: ActionParams<GitFields, GitMass, GitValue, GitEnergy>): Promise<DetectOperationResult> {
  const command = value.command?.split(" ")[0]
  if (!command) throw new Error("Команда не указана")

  const patterns = {
    start: /^(clone|init)$/,
    work: /^(add|mv|restore)$/,
    examine: /^(show|status|diff)$/,
  } as const
  for (const [key, regex] of Object.entries(patterns)) {
    if (regex.test(command)) {
      return { operation: key as "start" | "work" | "examine" }
    }
  }
  
  throw new Error(`Неизвестная команда: ${command}`)
}
```

---

## Соглашения

1. Файл: `<username>/<name>/meta.ts` (например: `owner/project/meta.ts`)
2. Имя: `MetaFor("<name>")`
3. Enum: всегда с `label`
4. Импорт в `meta.ts` не нужен: `MetaFor` предоставляет DSL-среда
5. Bulk: только `<meta-for>` для иерархии атомов
6. Цепочка: все методы обязательны (даже пустые)
7. **Action-модули:** логика действий в отдельных файлах `actions/*.ts`
8. **Структура action:** `import("...")` + `return`
9. **Работа запускается Fields:** значение Field разрешает переход и Process
10. **Без самопереходов:** цикл всегда проходит через другое состояние
11. **Mass файловая:** Meta объявляет codec и metadata, Process получает
    `MassHandle`; живые runtime-сущности находятся только в Energy

---

## Декларация в MetaFor, исполнение в модулях

**Нельзя:**

```typescript
// ❌ Вне MetaFor
const PATTERNS = { start: /^(clone|init)$/ }
function getGroup(cmd) { ... }

export default MetaFor("git")...
```

**Можно:**

```typescript
// ✅ В MetaFor только декларации Mass и типы Energy
export default MetaFor("git")
  .mass((mass) => ({
    attempts: mass.json(),
  }))
  .energy<{
    socket: WebSocket
  }>()
  .processes((process) => [
    process("определение операции")
      .action(async ({ energy, field, mass, self, signal, value }) => {
        const mod = await import("./actions/detectOperation.ts")
        return mod.default({ energy, field, mass, self, signal, value })
      })
      .success(({ update, data }) => update(data))
  ])
```

**Правило:** `.fields()` и `.mass()` содержат декларативные данные, а
`.energy<EnergyType>()` — только TypeScript-типы. Любые функции, алгоритмы,
подключения, паттерны исполнения и cleanup живут только в отдельных
action-модулях. Inline callback процесса является тонким wrapper:
`import("...")` и `return`.
Его аргументы только передают готовые значения и не исполняют логику.

**Action-модули:**

- Выносите логику действий в отдельные файлы: `actions/*.ts`
- Каждый модуль экспортирует функцию по умолчанию или именованную
- Модуль импортируется динамически: `await import("./actions/...")`

---

## Cluster, Galaxy и Atom-репозитории

Физический корень внешних Meta называется `cluster/`. Он содержит Galaxy —
каталоги GitHub-владельцев. Каждый непосредственный дочерний каталог владельца
является независимым peer Meta-репозиторием; его `meta.ts` находится
непосредственно в корне. Дополнительных каталогов `galaxy/`, `atom/`, `metas/`,
вложенных Meta-репозиториев и третьего address segment нет.

**Локальная структура:**

```text
cluster/
└── owner/                     # Galaxy: GitHub-владелец
    ├── project/               # независимый peer Git-репозиторий
    │   └── meta.ts            # src: owner/project
    ├── project-start/         # независимый peer Git-репозиторий
    │   └── meta.ts            # src: owner/project-start
    └── project-work/          # независимый peer Git-репозиторий
        └── meta.ts            # src: owner/project-work
```

Каждая Meta создаётся командой `create-metafor <repository> --dir
cluster/<owner>` и получает полный актуальный template, lockfile после
`bun install`, собственный Git и один `Initial commit`. Составные роли получают
уникальные hyphenated repository names, например `project-start` и
`project-work`. Создание внутри уже существующего Meta-репозитория отклоняется.

**Пути в `src`:**

- любая Meta: `<owner>/<repository>` — ровно два сегмента.

Префикс `cluster/` в `src` не входит. Source-путь идентифицирует peer
Meta-репозиторий, но не кодирует runtime parent chain: одна Meta может
materialize occurrences у разных родителей и на любой глубине. Композиция
выражается Meta/Matter/Monad references, а не файловой вложенностью.

WIMP `src` не равен npm-имени. Например, source `owner/project-start`
соответствует npm-имени `@owner/project-start`; оба выводятся только из owner и
repository.

Если выбор репозитория зависит от topology, basis должен быть только `state` или `enum`.

```typescript
.matter(({ value, html }) => html`
  ${value.operation === "start" && html`
    <meta-for src="owner/project-start" fields=${{ command: value.command, args: value.args }} />
  `}
  ${value.operation === "work" && html`
    <meta-for src="owner/project-work" fields=${{ command: value.command, args: value.args }} />
  `}
`)
.bulk()
```

**Одна Meta ссылается на peer Meta-репозитории:**

```typescript
// owner/project/meta.ts
export default MetaFor("git")
  .fields((field) => ({
    operation: field.enum("start", "work").optional({ label: "Тип операции" }),
    command: field.string.optional({ label: "Команда" }),
    args: field.string.optional({ label: "Аргументы" }),
  }))
  .superposition({
    "получение команды": {
      "определение операции": { command: { null: false } },
    },
    "определение операции": {
      "выполнение": { operation: { null: false } },
      "ошибка": { error: { null: false } },
    },
    "выполнение": {
      "получение команды": { operation: null },
    },
    "ошибка": {
      "получение команды": { error: null },
    },
  })
  .mass((mass) => ({attempts: mass.json()}))
  .energy()
  .processes((process) => [
    process("определение операции")
      .action(async ({ energy, field, mass, self, signal, value }) => {
        const mod = await import("./actions/detectOperation.ts")
        return mod.default({ energy, field, mass, self, signal, value })
      })
      .success(({ update, data }) => update(data))
      .error(({ update, error }) => update({ error: error.message })),
    process("выполнение")
      .action(async () => {
        const mod = await import("./actions/execute.ts")
        return mod.default()
      })
      .success(({ update }) => update({ operation: null })),
  ])
  .reactions(() => [])
  .matter(({ value, html }) => html`
    ${value.operation === "start" && html`
      <meta-for src="owner/project-start" fields=${{ command: value.command, args: value.args }} />
    `}
    ${value.operation === "work" && html`
      <meta-for src="owner/project-work" fields=${{ command: value.command, args: value.args }} />
    `}
  `)
  .bulk()
```

### Пример action-модуля в репозитории

```typescript
// actions/detectOperation.ts
import type { ActionParams } from "@metafor/types/metafor/action"
import type { FieldType } from "@metafor/types/metafor/fields"
import type { MassHandle } from "@metafor/types/metafor/schema"

interface DetectOperationValue {
  command?: string | null
}

interface DetectOperationResult {
  operation: "start" | "work"
}

type GitFields = {
  operation: FieldType<"enum", false, undefined, readonly ["start", "work"]>
  command: FieldType<"string">
  args: FieldType<"string">
}
type GitValue = {
  operation: "start" | "work" | null
  command: string | null
  args: string | null
}
type GitMass = { attempts: MassHandle }
type GitEnergy = Record<never, never>

export default async function action({
  mass,
  energy,
  field,
  value,
}: ActionParams<GitFields, GitMass, GitValue, GitEnergy>): Promise<DetectOperationResult> {
  // field — декларация полей (схема)
  // value — значения полей (данные)
  const command = value.command?.split(" ")[0]
  if (!command) throw new Error("Команда не указана")

  const patterns = {
    start: /^(clone|init)$/,
    work: /^(add|mv|restore)$/,
  } as const
  for (const [key, regex] of Object.entries(patterns)) {
    if (regex.test(command)) {
      return { operation: key as "start" | "work" }
    }
  }

  throw new Error(`Неизвестная команда: ${command}`)
}
```
