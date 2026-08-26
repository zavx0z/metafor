# `@metafor/node-tree` — проекция Graph

## Назначение

`@metafor/node-tree` (далее — node-tree) переводит полный валидный public Graph
в универсальный `@nodes/core` (далее — core) NodeTree. Graph остаётся
канонической read-only проекцией мира. NodeTree существует только как
производное представление для layout, renderer и локального наблюдения.

Node-tree не читает Dark, Boundary, Matrix, Energy или Bulk Store, не сохраняет
Graph и не создаёт собственную причинную history. Revision NodeTree относится
только к представлению и не заменяет causal frontier MetaFor.

## Template и runtime

Один WIMP template создаёт один template Frame и один template Node по
`MetaAddress`. Несколько Atom одного WIMP ссылаются на этот общий template и не
порождают runtime WIMP.

Каждый runtime Atom и Topology создаёт отдельные Frame и Node по стабильному
public ref. Вложенность Frames повторяет текущую runtime-вложенность Graph.
Exact Reaction relation остаётся прямым Link от State Socket source Atom к
Reaction Socket target Atom независимо от глубины обоих Atom.

Template-сущности отображаются так:

* Field и Mass являются Parameter общего WIMP Node и получают отдельные
  read/output и write/input Socket;
* State является Node;
* Transition является Node между двумя State, а каждая Condition — его
  Parameter с отдельным Field dependency Link;
* Process и Reaction являются Nodes с явными State, Field и Mass Links;
* Matter является одним WIMP-local Node, чей Parameter содержит полный ordered
  Matter tree без потерь;
* distinct target WIMP одного Matter tree получают производные Links.

Runtime Atom хранит текущее State, различие присутствующего и отсутствующего
Field value, lazy Mass metadata и полный текущий record каждой входящей exact
Reaction relation в собственных Parameters. Link сохраняет устойчивые ref и
endpoints, поэтому изменение `active` вместе со State не становится ложным
изменением topology. Mass content не загружается и не становится частью
NodeTree.

Каждый Parameter сохраняет своё полное значение как JSON-текст в read-only
Field. Поэтому object, array, `null` и optional-presence marker видимы без
MetaFor-specific renderer и без преобразования в `[object Object]`. Порядок
State Transitions и ordered Matter tree остаётся порядком исходного Graph.
Socket и Link используют generic presentation type `custom`; смысл связи
остаётся в их JSON metadata. Exact per-Parameter Socket сохраняются в semantic
NodeTree даже если конкретному renderer нужен другой производный layout
projector для сложного fan-in.

## Matter identity

Public Graph пока не даёт стабильный ref отдельной Matter particle. Поэтому
node-tree не выдаёт array position или `DocumentPointer` за её identity. Один
Matter Node стабильно адресуется owning `MetaAddress`, а полный ordered tree
остаётся его lossless Parameter value.

Отдельная selection и сохранение identity каждой Matter particle потребуют
нового public `MatterRef`. До появления такого контракта projection не создаёт
ложные per-particle Node IDs.

## Обновление

Следующий полный Graph сначала проходит закрытую validation и отдельно
материализуется как допустимый кандидат NodeTree. Невалидный вход не меняет
существующее представление.

Сохранившийся `(nodeId, parameterId)` сохраняет exact Parameter object.
Изменение только значений вызывает `Parameter.set()` и не меняет
`topologyRevision`. Изменяемые authored labels находятся в JSON value, а
presentation label выводится только из устойчивого semantic key. Изменение
Frames, Nodes, состава Parameters, Sockets или Links применяется одним
`NodeTree.reconcile()`.

Node-tree не применяет raw Force paths и не использует `NodeTreeEditor` как
write path MetaFor. Предметное изменение проходит через принадлежащий MetaFor
RPC и Force, после чего принятый Graph снова проецируется в тот же NodeTree.

## Граница package

Production entrypoint `@metafor/node-tree/graph` зависит только от public Graph
types и core. UI, Layout, Engine, DOM, Storybook и доменные runtime packages не
входят в package.

Renderer получает NodeTree через отдельный adapter. View-owned selection,
pan, zoom, viewport и layout result не записываются в Graph или NodeTree.
