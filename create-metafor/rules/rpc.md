# Клиентский RPC-контракт авторинга Meta

Этот документ владеет клиентским договором service operations, которыми человек
или агент создаёт Meta-пакеты и изменяет структуру живой Вселенной. Transport,
routing и Particle causality принадлежат [`docs/FORCE.md`](../../docs/FORCE.md),
а форма read-only Graph — разделу RPC в [`metafor.md`](metafor.md).

## Общий закон

Клиент меняет Meta только через типизированную Monad RPC operation. Наличие
локального файла, CLI, Force ingress или имени метода не является разрешением.
Каждый вызов связывается с source identity RPC-канала, версией contract,
operation id, capability и точным Meta scope.

RPC payload не объявляет source identity: её добавляет MonadRouter. Capability
проверяет provider операции. Текущий локальный authoring contour допускает
только явно настроенные source identities и не считается публичной сетевой
границей доверия.

Dark запускается без authoring grants по умолчанию. Локальный source identity и
его точные scopes включаются только совместной настройкой
`META_AUTHORING_RPC_SOURCE`, `META_AUTHORING_SCOPES` и более узкого
`META_AUTHORING_CREATE_SCOPES`. Настроенный structural authoring запрещён при
отключённом checkpoint applied-through plane.

Каждая write operation использует закрытый envelope:

```text
contractVersion + operationId + capability + exact operation payload
```

Provider отклоняет неизвестные поля. Для live structural operation пара
`(RPC source identity, operationId)` навсегда связывается в Force history с
одним нормализованным request digest; повтор с другим payload запрещён. Для
source-only Create durable idempotency identity является пара
`(target address, normalized target patch)`: глобальный Create operation
journal ради привязки одного `operationId` не создаётся.
Успешный receipt содержит `contractVersion`, `operationId`, нормализованный
request digest, достигнутую phase и точные source revisions. Для live operation
он ссылается на causal Force acceptance identity, где уже хранится единственный
accepted patch, и содержит Boundary outcome, но не копирует patch и не
раскрывает внутренние SQLite row IDs как клиентские адреса.

## Discovery

`meta.capabilities.read` принимает закрытый request только с `contractVersion`
и возвращает capabilities, действительно выданные вызывающему RPC source.
Ответ содержит:

- `contractVersion`;
- identity capability и разрешённый method;
- разрешённые Meta scopes;
- operation class;
- право касаться live state;
- признак отдельного права на Git commit.

Отсутствующая capability означает запрет. Клиент не достраивает возможность по
документации, наличию executable или результату другой сессии.

## Чтение source revision

`meta.source.revision.read` принимает закрытый request из `contractVersion`,
capability `meta.source.read` и непустого уникального списка canonical Meta
addresses в разрешённом scope. Ответ возвращает только address и digest точных
`meta.ts`. Digest является precondition следующей операции и не подменяет Git
commit identity.

Source bytes, filesystem path, `.git` и содержимое соседнего репозитория этим
методом не раскрываются.

## Создание Meta

`meta.create` создаёт один canonical peer Meta-пакет через существующий Create
template path. Request обязан содержать:

- `contractVersion` и уникальный `operationId`;
- capability `meta.create`;
- canonical address `<owner>/<repository>`;
- имя, описание и утверждённый template profile;
- precondition `target: absent`.

Provider сначала строит и проверяет полный набор template files без изменения
целевого пути, затем заполняет deterministic sibling candidate, повторно
проверяет его и атомарно переименовывает в один новый peer repository. Уже
существующие bytes candidate можно продолжить только при их точном совпадении с
target patch. RPC не запускает второй генератор, не создаёт вложенную Meta и не
материализует новый пакет как самостоятельный runtime root.

Создание пустого Git repository входит в target patch canonical peer. Install,
`git add`, commit, push и публикация не выполняются: для них нужна отдельная
capability.

Receipt возвращает address, source revision, созданные относительные files и
фактическое состояние Git repository. Точный завершённый target является
durable evidence результата и повтор того же target patch возвращает
`already_created`. Другой target patch к существующему address отклоняется.
Create не записывает фиктивную Particle в Force history и не создаёт рядом
отдельный operation journal.

## Изменение Matter

`meta.matter.apply` принимает одну структурную operation `add`, `move` или
`remove`. Первый contract slice ограничен одним root-level WIMP Matter без
Fields, Mass и Energy bindings. Request содержит:

- `contractVersion`, уникальный `operationId` и capability `meta.matter.write`;
- canonical child Meta address;
- исходного и/или целевого parent Meta;
- точные ожидаемые source revisions каждого затрагиваемого `meta.ts`.

`add` и destination `move` добавляют только последнего sibling. В первом slice
`move` и `remove` также принимают только последний inert root occurrence. Это
сохраняет действующие Matter local identities при последующем cold read. `move`
допустим только для единственного совпавшего occurrence и обязан сохранить
canonical runtime Atom identity. Source Matter identity для `move` вычисляется
из проверенного parent `meta.ts`, а не из Boundary или собранного live Graph.
`remove` удаляет occurrence, но не peer repository.

## Изменение declaration entity

`meta.declaration.apply` с capability `meta.declaration.write` изменяет одну
декларационную entity существующей Meta. Действующий закрытый union содержит
template metadata, optional Field, State вместе с transitions и conditions,
Mass declaration, Reaction и Bulk view. Он принимает применимые к entity
операции `add`, `replace`, `remove` и значимый `move`, а также точные ожидаемые
revisions всех затрагиваемых `meta.ts`. Process остаётся следующим slice того
же метода.

Клиент адресует Field по canonical Meta address и semantic key. SQLite row ID,
Variant row и filesystem path не являются частью RPC. Строковые, числовые,
boolean, array и enum Fields передаются целиком; enum values являются составом
одной Field declaration. Одна RPC operation принимает одну Field Inflaton.
Boundary атомарно проецирует из неё canonical Field row, Variant rows и
runtime consequences, а Bulk получает их обычные производные Gravitons.

State адресуется по имени и передаёт закрытый состав своих transitions и
condition waves одной Inflaton. Boundary одной transaction заменяет этот
состав и выпускает State перед новыми Transition/Condition rows; при удалении
дочерние rows выходят раньше State. Mass адресуется по key, хранит стабильный
WIMP-local `localId` и после commit обновляет Mass projection каждого
существующего Atom этой Meta. Reaction адресуется обязательным semantic key,
который также входит в её initiator. Bulk остаётся singleton declaration:
`view_css` хранится в Boundary, но не входит в Bulk Store.

Чтобы существующие local identities других declarations не менялись после
cold read, `add` добавляет последний Field, `remove` и `move` принимают только
последний optional Field, а изменение состава enum допускается только у
последнего Field. `replace`, не меняющий число enum variants, сохраняет слот
любого optional Field. `move` переносит последний optional Field между двумя
Meta, добавляя его последним в target, и сохраняет persisted Field identity.
Required Field этим slice не изменяется. Удаление enum value, на которую ещё
ссылается живое значение, default или condition, отклоняется атомарно.

## Live-first commit и source projection

Операция проходит один порядок:

```text
RPC request
→ capability, scope, source revisions и полный patch preflight
→ подготовка точных source candidates без публикации
→ один принятый structural patch
→ Dark Force history и Boundary commit
→ тот же неизменяемый patch публикует подготовленные meta.ts
→ receipt
```

Source projection не перечитывает живой мир, не сравнивает его с декларацией и
не строит второй diff. Она применяет тот же accepted patch. Комментарии и
форматирование `meta.ts` не входят в contract.

Тот же accepted Particle напрямую обновляет уже загруженную Dark declaration
projection. Для всех действующих declaration entity после acceptance не
выполняется повторное чтение live world, source или Graph. Для Matter после
успешной публикации source обычный declaration loader читает только
доступные Meta-пакеты от действующего root и материализует новые reachable либо
удаляет ставшие unreachable declarations. Он не читает Boundary, не сравнивает
source с живым Graph и не испускает Matter Particle повторно.

Для нового child Meta parent Matter edge принимается до деклараций child, чтобы
пакет не возникал временным вторым root. Затем Dark причинно публикует отдельные
Inflaton particles деклараций нового reachable Meta.

Одна реально изменённая entity переносится одним `ForceMessage` с одной
Particle. Service preflight, source candidates и receipt Particles не являются.

## Ошибки и повтор

До live commit любая ошибка оставляет мир и canonical source неизменными.
После live commit source failure сохраняет подготовленные source candidates.
Тот же `operationId`, request digest, accepted patch и before/after source
revisions уже атомарно связаны в Force history. Повтор находит эту acceptance
identity, продолжает projection того же patch и не выполняет новую runtime
mutation.

Имена candidate, rollback и lock однозначно выводятся из target `meta.ts` и
`operationId`. Projector принимает только три состояния target: точную
before revision, точную after revision или конфликт. При before обязателен
candidate с after revision. Частично опубликованный multi-file move дополнительно
требует rollback bytes с before revision для уже заменённого target. Если все
targets уже имеют after revisions, операция считается завершённой и оставшиеся
технические artifacts удаляются под теми же source locks.

Provider возвращает предметный outcome одной из фаз: `rejected`, `created`,
`runtime_committed`, `source_pending` или `complete`. Неизвестный частичный
успех запрещён.

После успешного Boundary commit при ещё не опубликованных candidates live
receipt имеет phase `source_pending`, acceptance identity той же Force history
entry, точные before/after source revisions и наблюдаемую причину ошибки.
Успешная или уже выполненная публикация возвращает phase `complete` и outcome
каждого source target после applied declaration materialization. Если source
уже опубликован, но materialization ещё не завершён, receipt имеет phase
`runtime_committed` и наблюдаемую причину pending materialization.

Владельцы фаз:

- Dark Monad — RPC admission, capability, scope, normalization и operation
  outcome;
- Create template boundary — полный набор файлов нового Meta;
- Dark Force — durable acceptance и причинный порядок Inflaton;
- Boundary — canonical live commit;
- source projector — публикация заранее подготовленных `meta.ts`;
- Git provider — только отдельно разрешённые add/commit/push operations.

## Оставшееся функциональное расширение для одного агента

Следующие имена фиксируют утверждённую форму ближайшего расширения, но не
считаются действующим API до появления public types, provider и обычных тестов.
Новая access policy, новый graph scope и конкурентные writes в это расширение
не входят.

Действующий `meta.declaration.apply` уже использует один закрытый write envelope,
точную source revision и live-first/source-projection порядок для metadata,
Field, State composition, Mass, Reaction и Bulk. Следующий slice добавляет
Process вместе с ограниченным набором принадлежащих этой декларации action и
handler source artifacts.

Эти операции `add`, `replace`, `remove` и, где порядок является частью договора,
`move` адресуют semantic entity по canonical Meta address и ключу либо имени,
а не по SQLite row ID или filesystem path. Одна изменённая entity остаётся
одной принятой Inflaton Particle. Process использует этот же provider и patch
path; отдельный Process generator и произвольный source writer не создаются.

Действующий `meta.matter.apply` расширяется, а не дублируется вторым Matter
методом. Следующий contract slice должен адресовать точное occurrence внутри
Matter tree и поддержать WIMP, fuzzy, axion и macho, bindings, значимую позицию,
а также `add`, `move` и `remove`. Текущий проверенный slice остаётся ограничен
inert root-level WIMP и последней позицией.

`meta.field.value.apply` является предметным runtime input. Request адресует
Atom через публичный locator точного Graph snapshot, называет Field key,
передаёт типизированное значение и ожидаемую causal frontier. Provider
разрешает locator во внутреннюю Boundary identity, проверяет Field declaration
и проводит одну Gluon либо Higgs Particle через существующую Force-history.
Boundary ID не становится частью публичного Graph, а runtime value не
проецируется в `meta.ts` как декларация.

Отдельных `state.set` и `process.run` не будет. Агент меняет предметный Field;
Matrix вычисляет State, Energy исполняет объявленный Process, а результат
наблюдается через Graph, history, Mass result и Process execution projection.

Canonical commit, push, access policy, произвольный файловый write и
самоизменение Лады остаются отдельной последующей работой.
