# Graph: утверждённый read-contract

Статус: **owner-approved contract baseline (`MF-100`)**.

Этот документ задаёт implementation boundary для `MF-101`. Он не является
implementation и сам по себе не разрешает менять runtime, Store, Mass, Lada
или активный contour.

## 1. Один публичный Graph

Graph — единственный public graph format и имеет одну schema. JSON является
только его технической сериализацией для transport/storage; это не имя
доменной сущности, не второй формат и не отдельный контракт:

```ts
type Graph = {
  schema: "metafor/graph"
  root: MetaAddress
  template: Record<MetaAddress, MetaTemplate>
  runtime: {
    roots: RuntimeNode[]
  }
}
```

`MetaAddress` всегда содержит ровно два canonical safe segment
`<owner>/<repository>`.

Отдельных `MetaDocument`/`MetaProjection`, `authoring`, `planner`,
`diagnostic`, compact или иных public formats/views нет. Partial
selection/query может быть отдельной retrieval operation над этим Graph,
но не меняет schema и не создаёт второй Graph payload. `MF-101` обязан
сначала реализовать полный read.

`meta.ts` и Git остаются canonical human-authored source. Graph всегда
собирается заново и не хранится как authored document или второй Store.

## 2. Complete compact template

`template` содержит все Meta, загруженные Dark для выбранного `root`.
Map key является canonical Meta address, значение — полная сериализуемая
compact normalization текущего `MetaDSL`:

```ts
type MetaTemplate = JsonProjection<MetaDSL>
```

`JsonProjection<MetaDSL>` означает не новый декларационный язык, а точный
closed JSON contract результата действующего `MetaFor(...)` builder после
normalization. Public types и runtime validator `MF-101` обязаны выразить его
явно без functions, symbols, `undefined` и неизвестных properties.

Template включает всё, что присутствует в normalized DSL:

- `name` и `desc`;
- все Fields, включая `required`, defaults, labels, enum variants и остальные
  declaration attributes;
- полную Superposition со States, Transitions и Conditions;
- metadata-only Mass declarations;
- полные Process и Reaction descriptors, включая сериализованные executable
  descriptors, read/write sets и environment constraints;
- полную normalized Matter structure и bindings;
- declared Bulk.

Executable descriptors не скрываются capability/opt-in view: отдельного view
нет, а declaration должна быть полной. Mass bytes, `MassHandle` values и live
Energy objects не являются частью `MetaDSL` template.

Каждый Matter target из `template` обязан разрешаться в другой полный entry
этого же `template` map. Нераскрытый external stub запрещён. Повторное
использование одной Meta не дублирует её declaration: occurrences ссылаются на
canonical Meta address и structural declaration path.

## 3. Current runtime

`runtime` содержит текущую materialized structure Boundary для выбранного
`root`. Runtime nodes вложены, поэтому JSON path самого node является его
public occurrence identity.

```ts
type DocumentPointer = `#${JsonPointer}`

type RuntimeAtom = {
  kind: "atom"
  declaration: DocumentPointer
  meta: MetaAddress
  state: string | null
  values: Record<string, JsonValue>
  children?: RuntimeNode[]
}

type RuntimeTopology = {
  kind: "topology"
  declaration: DocumentPointer
  topology: "fuzzy" | "axion" | "macho"
  children?: RuntimeNode[]
}

type RuntimeNode = RuntimeAtom | RuntimeTopology
```

`declaration` всегда разрешается внутри `template` этого же документа:

- root Atom ссылается на template своей Meta;
- child Atom или topology ссылается на точный normalized Matter node, который
  породил эту structural location.

Array position runtime node является частью nested public path. Repeated
occurrences представлены отдельными соседними nodes; дополнительный storage ID
или ordinal identity не публикуется.

### 3.1 Sparse Atom values

`values` содержит только Field values, которые сейчас реально присутствуют у
Atom в Boundary:

- присутствующий key означает существующий current value, включая `null`;
- отсутствующий key означает, что current value у этого Atom отсутствует;
- Field default остаётся declaration в `template`;
- runtime не сообщает, был current value создан из default или поздней write.

Boundary projection разрешает internal Field ID в declaration key, State ID в
State name, а enum Variant ID в объявленное JSON value до public boundary.

В Graph отсутствуют:

- `materialized`, `inherited-default`, `missing` и `not-projected` cells;
- `values/missing` envelope;
- field coverage/truncation metadata;
- provenance default-vs-write.

### 3.2 Public identity и relations

Публичная identity выражается:

- canonical Meta address;
- вложенной JSON structure;
- JSON Pointer references внутри того же document.

Boundary `Atom.id`, declaration/Field/State/Value IDs, `valueId`, SQLite row
handles, synthetic IDs и другие internal storage identities не пересекают
public Graph boundary.

Matter и shared Field/Mass/Energy relations остаются в complete normalized
Matter declaration и public structural references. Graph не добавляет:

- направленные occurrence ports;
- boundary stubs;
- отдельный global `edges` graph;
- diagnostic shared-value identity.

Boundary может использовать internal IDs при построении своей projection, но
обязан удалить их до передачи public current projection в assembler.

## 4. Семантический порядок

Graph не вводит universal `order` vector и не объявляет любой порядок
отображения новым законом.

| Конструкция | Закон Graph |
| --- | --- |
| States | declaration sequence сохраняется; первый State является initial |
| Transitions одного State | sequence сохраняется; первый matching Transition имеет приоритет |
| Conditions Transition | логическая конъюнкция; отдельного priority-order нет |
| Enum variants | sequence сохраняется как ordinal mapping |
| Fields | declaration sequence сохраняет действующую materialization identity |
| Processes | declaration sequence сохраняется; `finally` выполняются в этом порядке |
| Reactions | sequence сохраняет current declaration identity/deterministic emission, но не создаёт first-match law |
| Matter | сохраняются parent, edge slot, sibling и repeated-occurrence order |
| Mass declarations | order не получает отдельной domain semantics |
| Display order | не является Graph law |

Template serializer сохраняет действующую normalized MetaDSL representation,
но consumer не приписывает semantic priority sections, для которых она не
доказана.

## 5. Stateless Dark Monad assembly

Public operation предоставляется через Dark Monad, например:

```ts
readGraph({root: MetaAddress}): Promise<Graph>
```

Точный method name фиксируется public type `MF-101`; отдельный transport
protocol не требуется.

Assembly flow:

```text
validated canonical root
→ Dark declaration projection
→ Boundary current projection
→ stateless structural join
→ Graph runtime validation
→ one public Graph
```

Владение:

| Компонент | Ответственность |
| --- | --- |
| Dark Monad | complete normalized MetaDSL graph выбранного root |
| Boundary | current Atom/topology structure, State и present Field values |
| Dark Monad | stateless orchestration, structural join и final validation |
| Dark Force | transport Monad RPC, без интерпретации Graph payload |

Dark Monad не хранит assembled document и не читает Boundary storage напрямую.
Её declaration provider не читает Boundary/SQLite, Boundary не загружает
`meta.ts`. После `MF-102` provider и assembler находятся в Dark Monad, а
принятый public Graph contract и stateless behavior не меняются.

Если Dark и Boundary projections нельзя согласовать по canonical Meta address
и public structural declaration references, read завершается точной validation
error. Assembler не выдаёт partial stub и не угадывает relation.

## 6. Runtime validation

`MF-101` предоставляет один public validator:

```ts
interface GraphValidators {
  graph(input: unknown): ValidationResult<Graph>
}

type ValidationResult<T> =
  | {ok: true; value: T}
  | {
      ok: false
      issues: Array<{
        path: JsonPointer
        code: string
        message: string
      }>
    }
```

Validator эквивалентен closed JSON Schema плюс semantic checks:

1. `schema` имеет единственное значение `metafor/graph`.
2. `root`, template keys и Matter Meta refs — canonical two-segment addresses.
3. `template` содержит root и все reachable Matter targets без stubs.
4. Каждый template является complete normalized MetaDSL JSON.
5. Field/Mass/Process/Reaction keys и State names уникальны локально.
6. Field defaults/variants, Transition targets/conditions и Process/Reaction
   read/write references согласованы с template.
7. Каждый runtime `declaration` pointer разрешается внутри `template`.
8. Runtime Atom `meta`, State и value keys существуют в referenced template.
9. Runtime `values` содержит только current values и не содержит status cells.
10. Raw internal identity properties, revisions, digests, CAS, coverage, ports,
    stubs и global edges отклоняются.
11. Semantic sequences из раздела 4 не теряются при assembly.

Public consumer повторно валидирует полученный RPC result.

## 7. Что не входит в Graph

Graph не содержит:

- template/source/instance revisions;
- content digests или CAS fields;
- Git metadata/history;
- Particle или structural-operation history;
- JSON Patch и patch history;
- Mass bytes либо `MassHandle` runtime values;
- live Energy objects;
- raw Boundary/SQLite diagnostics;
- source maps или дополнительную diagnostic schema.

History, patches и разрешённые Mass results имеют отдельные owner APIs. Это не
альтернативные Graph views.

## 8. Проверяемая implementation boundary `MF-101`

`MF-101` должен:

1. Зафиксировать explicit public types и closed runtime validator одного
   Graph.
2. Получить complete declaration projection от Dark Monad без создания
   authored Graph Store.
3. Получить current structural projection от Boundary без public raw IDs.
4. Statelessly собрать projection через Dark Monad.
5. Доказать full document на небольшой изолированной fixture Meta, не на Ладе.
6. Доказать negative cases всех запрещённых properties.
7. Доказать State/Transition/Variant/Process/Matter ordering laws и отсутствие
   отдельного Condition/Mass/display priority law.
8. Пройти targeted tests и typecheck без запуска, остановки либо изменения
   live contour.

На этом срезе запрещены:

- runtime/process restart и hot reload;
- Store/Mass migrations или writes;
- изменения Лады и flat topology;
- public revisions/digests/CAS;
- alternate Graph schemas/views;
- source authoring/patch implementation.

## 9. Закрытые решения

Owner review `MF-100` завершён. Для начала `MF-101` не осталось product или
architecture choices:

- public format и Dark Monad assembly owner определены;
- template/runtime boundary определена;
- sparse semantics и public identity определены;
- forbidden revision/diagnostic/graph concepts определены;
- semantic ordering определён.

Остаются обычные implementation choices внутри этого контракта: размещение
public types, internal provider DTO, method name, pure helper boundaries и test
fixtures. Они не требуют нового owner gate, пока не меняют законы выше.
