[README](README.ru.md) | [English](./FORCE.md) | **Русский**

# Force

Этот документ является корневой точкой входа в Force-слой MetaFor.
Он задаёт общий строй сил, каналов и содержимого изменения.
Детальные разборы отдельных сил и канала изменения полей topology вынесены в [Gravity](./proto/gravity.ru.md), [Electromagnetism](./proto/electromagnetism.ru.md), [Strong](./proto/strong.ru.md), [Weak](./proto/weak.ru.md) и [Higgs](./proto/higgs.ru.md).

## Назначение

[ONTOLOGY.ru.md](./ONTOLOGY.ru.md) фиксирует, что существует в системе.
[ARCHITECTURE.ru.md](./ARCHITECTURE.ru.md) фиксирует, как это выражается в кодовой проекции.
Force фиксирует, как сила действует через канал и как изменение получает переносимую форму.

Этот слой углубляет онтологию и архитектуру, но не перераспределяет их обязанности.
Каноникализация, дедупликация, интернирование и уплотнение остаются за `Boundary × Strong`.
Типовое различие между обычными полями данных и полями topology остаётся первичным и не определяется самим Force-слоем задним числом.

## Центральные различия

### Сила

Сила задаёт характер преобразования.
Она не является переносимой единицей и не совпадает с содержимым изменения.

### Boson

`Boson` является общим типом силового канала и переносимой единицы.
Он не является силой.

Подтипами `Boson` в Force-слое MetaFor являются:

- `Graviton`,
- `Photon`,
- `Gluon`,
- `Higgs boson`,
- `W boson`,
- `Z boson`.

Каждый такой подтип принадлежит своей силе или отдельному каналу изменения полей topology и не должен смешиваться с другими.

### Impulse

`Impulse` является содержимым изменения.
Он не является силой, не является `Boson` и не является каналом.

В архитектурной сериализуемой проекции `Impulse` может быть выражен через `ParticleOperation` и payload-поля.
Это не превращает его в переносчик.

Силовая связка читается так:

- сила задаёт характер преобразования,
- `Boson` задаёт общий тип канала,
- подтип `Boson` задаёт конкретный силовой канал,
- `Impulse` задаёт содержимое изменения.

## Транспорт и `part`

Физический транспорт MetaFor использует один `BroadcastChannel`: `METAFOR_FORCE_CHANNEL`.
Отдельных физических каналов `gravity`, `gluon`, `higgs`, `weak` и т.п. в runtime Force быть не должно.

Каждый `Particle` несёт смысловой канал в поле `part`.
Один `Particle` представляет ровно один Force part:

```ts
{ part: "graviton", op: "add", path: "wimp", value: "zavx0z/git" }
{ part: "graviton", op: "add", path: "matter", value: "<matter_particle_uuid>" }
{ part: "graviton", op: "add", path: "actor", value: "<actor_uuid>" }
{ part: "graviton", op: "add", path: "topology", value: "<topology_uuid>" }
{ part: "gluon", op: "replace", path: "/field/<uuid>", value: 42 }
{ part: "higgs", op: "replace", path: "/field/<uuid>", value: "branch" }
{ part: "photon", op: "replace", path: "/wimp/<uuid>", value: "ready" }
{ part: "w", op: "test", path: "/wimp/<uuid>/process/<uuid>", value: { kind: "result" } }
{ part: "+z", op: "test", path: "/wimp/<uuid>/process/<uuid>", value: { coordination: "claim" } }
{ part: "-z", op: "test", path: "/wimp/<uuid>/process/<uuid>", value: { coordination: "release" } }
```

`part` хранит force carrier, а доменный тип сигнала пишется в `path`.
WIMP-сигнал не кодирует `/wimp/...`: он пишется как `{ part: "graviton", op: "add", path: "wimp", value: src }`.
`value` здесь не payload WIMP, а только source-id; получатель читает полную декларацию из Store по этому `src`.
Для остальных Store-сущностей действует тот же порядок: `path` — доменная область
(`actor`, `topology`, `matter`, `state`, `process` и т.п.), `value` — id/ключ,
по которому получатель перечитывает полную строку или поддерево из Store.

Batch `parts` может содержать разные `part`, но маршрутизация всегда читается с самого Particle, а не с envelope.
Envelope не должен дублировать `part`, `channel`, `source` или `boson`.

Transport-layer не строит собственные очереди поверх `BroadcastChannel`.
Если нужен порядок, дедупликация, replay или целостность, это обязанность store transaction, revision/domain tick или владельца runtime, а не Promise-очереди подписчика.

## Store commit и доменные сигналы

`Store` хранит полную каноническую форму мира.
Лёгкий Force `Particle` с `uuid`, `part` и revision не является payload для
восстановления другого `Store`; он только сообщает доменам, что уже
зафиксированная часть мира изменилась и её нужно перечитать из `Store`.

В распределённой системе физически может существовать несколько `Store`:
серверные SQLite-базы, browser IndexedDB-реплики или другие runtime-узлы.
Если другой `Store` должен получить изменение, единицей переноса является тот же
causal commit, а не отдельный независимый sync-канал.

Правильный порядок:

```text
domain full change
  -> local Store transaction
  -> commit(txId / revision / parents)
  -> commit envelope:
       writes  — данные для Store-реплик, которым нужно применить изменение
       signals — лёгкие Force parts для доменной реакции
```

На принимающей стороне порядок обратной доставки доменам фиксирован:

```text
receive commit envelope
  -> apply writes into local Store transaction
  -> commit local Store
  -> deliver signals to Dark / Boundary / Bulk subscribers
```

Нельзя разводить `store-sync` и domain Force в два независимых потока, потому
что тогда `Boundary` или `Bulk` могут получить сигнал раньше, чем локальная
реплика `Store` содержит данные, на которые этот сигнал указывает.
Если репликация не нужна, commit envelope может не нести `writes` наружу, но
доменный Force part всё равно должен рождаться только после локального commit.

Следствие: отправка доменного Force part принадлежит `Store`/commit-слою, а
не caller-у, который уже записал данные.
Транспортный модуль Force живёт в `store/force`; подписки и прямые
низкоуровневые каналы импортируются оттуда, а не из корня проекта.
Текущая стартовая поверхность для доменного emit после Store-записи встроена в
ORM write-методы: `actor.create`, `topology.create`, `wimp.states.add`,
`wimp.processes.add`, `wimp.matter.*` и связанные sub-ORM методы рождают
Force part после SQL-записи. Дальше эта поверхность должна схлопываться в
полноценный commit envelope, но caller уже не должен сам создавать
`BroadcastChannel` или вручную слать второй Force part.
Домен, агент, UI или другой участник среды не должен выполнять двойное ручное
действие:

```text
write Store
send Force part separately
```

Для участника среды должен существовать один смысловой вход: изменить значение
поля, состояние или контекст. Внутри этого входа среда выполняет store
transaction, формирует commit envelope и только после commit доставляет
`signals` как Force parts.

Если API требует от участника одновременно менять БД и вручную слать Force part, это
означает, что runtime-контракт ещё не доведён: отправку Force part нужно перенести в
store/commit path.

## Типы полей

Force различает:

- обычные поля данных,
- поля topology.

`enum` и `array` относятся к полям topology по своей типовой природе.
Это первичная категория модели, а не постфактум-вывод из формы контракта.
Контракт только разворачивает уже существующую topology-семантику.

Поля topology в MetaFor читаются как поля Higgs:

- `enum` всегда выражает выбор topology,
- `array` всегда выражает множественность topology и разворачивание ветвей.

Ни `enum`, ни `array` нельзя читать как обычное поле значения.
Ни одно из них не принадлежит режиму обычного обновления поля.
Оба меняются только как изменение topology через `Higgs boson`, а не как обычная мутация значения.

Ограничения полей topology таковы:

- `enum` не является просто ограниченным литеральным полем,
- `enum` меняется как выбор topology, а не как обычная мутация значения,
- `array` не является обычной изменяемой коллекцией,
- `array` меняется как множественность topology, а не как обычная мутация значения,
- `array` не участвует в entanglement,
- `array` не мутируется внешними реакциями,
- `array` может меняться только внутренним процессом атома и только проходя через изменение `State`.

Формальная topology-модель, типизированная topology-адресация и topology-уровневая адресация entanglement вынесены в [TOPOLOGY.ru.md](./TOPOLOGY.ru.md), чтобы Force не подменял архитектурную сборку скрытого мира.

## Глобальная симметрия

Силовая симметрия MetaFor задаётся так:

- `Gravity -> Graviton`
- `Electromagnetism -> Photon`
- `Strong -> Gluon`
- `Higgs field change -> Higgs boson`
- `Weak -> W boson / Z boson`

Это соответствие должно читаться единообразно в онтологии, архитектуре и Forceе.

## Силовые взаимодействия

### Gravity

`Gravity` отвечает за отношение, инварианты локализации, адресуемость и структурную организацию.
Её `Dark`-проекция проявляется как скрытая связность и внутренняя геометрия, `Boundary`-проекция — как геометрия уплощения и индексное пространство, а `Bulk`-проекция — как проявленная раскладка и пространственная локализация.
Её каналом является `Graviton`, который относится к внутреннему структурному Forceу, а не к наблюдаемому сигналу.

Подробный разбор вынесен в [Gravity](./proto/gravity.ru.md).

### Electromagnetism

`Electromagnetism` отвечает за наблюдаемое распространение и перенос `State`.
Её каналом является `Photon`, который приносит состояние в сигнальную, гранично-видимую и проявленную форму.

Подробный разбор вынесен в [Electromagnetism](./proto/electromagnetism.ru.md).

### Strong

`Strong` отвечает за удержание, сцепление, связность и устойчивость формы.
Её каналом является `Gluon`, через который изменяются значения обычных `Field`.

При этом `Gluon` не заменяет архитектурную роль `Boundary × Strong`.
Каноникализация, дедупликация, интернирование и уплотнение остаются отдельной обязанностью границы.
Глюонный октет и соответствия типам `Field` вынесены в [Strong](./proto/strong.ru.md).

### Higgs

`Higgs` в MetaFor обозначает изменение полей topology.
Его каналом является `Higgs boson`, который изменяет поля topology как поля Higgs.

Здесь важно различать:

- `Photon` переносит `State`,
- `Gluon` изменяет обычные `Field`,
- `Higgs boson` изменяет поля topology,
- `Graviton` удерживает рамку отношения и локализации, в которой эти изменения получают место.

Подробный разбор вынесен в [Higgs](./proto/higgs.ru.md).

### Weak

`Weak` отвечает за переход, прохождение, мутацию и медицию состояния.
Её каналы — `W boson` и `Z boson`.

`W boson` относится к активному переходу.
`Z boson` относится к нейтральной медиции и внутренней связке переходных состояний.
Это не превращает `Weak` в сигнальный канал уровня `Photon`.

Подробный разбор вынесен в [Weak](./proto/weak.ru.md).

## Детальные документы

- [Gravity](./proto/gravity.ru.md) — отношение, инварианты локализации, адресуемость и структурная организация по доменным проекциям.
- [Electromagnetism](./proto/electromagnetism.ru.md) — наблюдаемое распространение, сигнал и перенос `State`.
- [Strong](./proto/strong.ru.md) — изменение значений обычных `Field`, удержание формы и границы действия `Gluon`.
- [Higgs](./proto/higgs.ru.md) — поля topology как поля Higgs, выбор ветви, множественность ветвей и `Higgs boson`.
- [Weak](./proto/weak.ru.md) — активный переход, нейтральная медиция и различие между `W boson` и `Z boson`.
