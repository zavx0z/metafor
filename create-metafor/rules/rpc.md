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

Каждая write operation использует закрытый envelope:

```text
contractVersion + operationId + capability + exact operation payload
```

Provider отклоняет неизвестные поля. Один `operationId` навсегда связывается с
одним нормализованным request digest; повтор с другим payload запрещён.
Успешный receipt содержит `contractVersion`, `operationId`, нормализованный
accepted patch, достигнутую phase и точные source revisions. Для live operation
он также содержит causal Force acceptance identity и Boundary outcome, но не
раскрывает внутренние SQLite row IDs как клиентские адреса.

## Discovery

`meta.capabilities.read` возвращает только capabilities, действительно
выданные вызывающему RPC source. Ответ содержит:

- `contractVersion`;
- identity capability и разрешённый method;
- разрешённые Meta scopes;
- operation class;
- право касаться live state;
- признак отдельного права на Git commit.

Отсутствующая capability означает запрет. Клиент не достраивает возможность по
документации, наличию executable или результату другой сессии.

## Чтение source revision

`meta.source.revision.read` принимает canonical Meta addresses в разрешённом
scope и возвращает digest точных `meta.ts`. Digest является precondition
следующей операции и не подменяет Git commit identity.

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
целевого пути, затем атомарно публикует один новый peer repository. RPC не
запускает второй генератор, не создаёт вложенную Meta и не материализует новый
пакет как самостоятельный runtime root.

Создание Git repository входит в создание canonical peer. `git add`, commit,
push и публикация не выполняются: для них нужна отдельная capability.

Receipt возвращает address, source revision, созданные относительные files и
фактическое состояние Git repository. Повтор того же `operationId` возвращает
тот же outcome; другой запрос к существующему target отклоняется.

## Изменение Matter

`meta.matter.apply` принимает одну структурную operation `add`, `move` или
`remove`. Первый contract slice ограничен одним root-level WIMP Matter без
Fields, Mass и Energy bindings. Request содержит:

- `contractVersion`, уникальный `operationId` и capability `meta.matter.write`;
- canonical child Meta address;
- исходного и/или целевого parent Meta;
- точные ожидаемые source revisions каждого затрагиваемого `meta.ts`.

`add` и destination `move` добавляют только последнего sibling. Это сохраняет
действующие Matter local identities при последующем cold read. `move` допустим
только для единственного совпавшего occurrence и обязан сохранить canonical
runtime Atom identity. `remove` удаляет occurrence, но не peer repository.

## Live-first commit и source projection

Операция проходит один порядок:

```text
RPC request
→ capability, scope, source revisions и полный patch preflight
→ подготовка точных source candidates без публикации
→ один принятый Matter patch
→ Dark Force history и Boundary commit
→ тот же неизменяемый patch публикует подготовленные meta.ts
→ receipt
```

Source projection не перечитывает живой мир, не сравнивает его с декларацией и
не строит второй diff. Она применяет тот же accepted patch. Комментарии и
форматирование `meta.ts` не входят в contract.

Для нового child Meta parent Matter edge принимается до деклараций child, чтобы
пакет не возникал временным вторым root. Затем Dark причинно публикует отдельные
Inflaton particles деклараций нового reachable Meta.

Одна реально изменённая entity переносится одним `ForceMessage` с одной
Particle. Service preflight, source candidates и receipt Particles не являются.

## Ошибки и повтор

До live commit любая ошибка оставляет мир и canonical source неизменными.
После live commit source failure сохраняет тот же `operationId`, accepted patch
и подготовленные source candidates. Повтор продолжает projection того же patch
и не выполняет новую runtime mutation.

Provider возвращает предметный outcome одной из фаз: `rejected`, `created`,
`runtime_committed`, `source_pending` или `complete`. Неизвестный частичный
успех запрещён.

Владельцы фаз:

- Dark Monad — RPC admission, capability, scope, normalization и operation
  outcome;
- Create template boundary — полный набор файлов нового Meta;
- Dark Force — durable acceptance и причинный порядок Inflaton;
- Boundary — canonical live commit;
- source projector — публикация заранее подготовленных `meta.ts`;
- Git provider — только отдельно разрешённые add/commit/push operations.

Расширение этого slice на Fields, States, Processes, bindings, произвольную
позицию Matter или canonical commit требует новых public types и проверок, но
не отдельного обходного RPC.
