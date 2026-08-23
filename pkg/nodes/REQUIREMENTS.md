# Требования пакета nodes

Этот документ владеет живым runtime-контрактом универсального нодового графа и
получением его производных представлений. Алгоритмические законы расположения
принадлежат [`@nodes/layout`](layout/README.md), а WebGPU view и renderer
contracts — [`@nodes/ui`](ui/REQUIREMENTS.md).

## Сущности и identity

1. Единственный runtime-словарь:
   `NodeTree → Frame / Node → Parameter → Socket → Link`.
2. `Frame` является отдельным владельцем визуальной вложенности. Node ссылается
   на него и не исполняет роль Frame.
3. `Parameter` является устойчивой identity строки Node и Store одного значения.
   `Socket` может ссылаться на Parameter, но не хранит и не дублирует его value.
4. Link соединяет два exact Socket по `nodeId + socketId`. Capability
   `input | output | bidirectional` не выводится из visual side.
5. ID Frame и Node уникальны во всём дереве; Parameter и Socket уникальны внутри
   owning Node; Link уникален в дереве. Неизвестные ссылки, циклические Frame и
   несовместимые endpoints отклоняются до проекции.
6. Первая runtime-версия получает topology в конструкторе. Значения Parameter
   живые; structural mutation получает отдельный публичный договор, а не
   неявное изменение внутренних массивов.

## Parameter как Store

1. `Parameter.value` является единственным текущим значением Parameter.
2. `Parameter.set(value)` изменяет значение атомарно, увеличивает revision и
   уведомляет подписчиков только при фактическом изменении.
3. `NodeTree` подписывается на принадлежащие ему Parameter и публикует одно
   типизированное change-событие с новой revision дерева.
4. Field renderer читает `Parameter.value`, а пользовательское изменение
   вызывает тот же `Parameter.set`. Отдельные `Record`, callback-owned copies и
   скрытый Store внутри NodeEditor запрещены.
5. Значение и presentation metadata должны иметь чистую snapshot-проекцию.
   Методы, subscriptions, closures и callbacks в snapshot не попадают.

## NodeTree и snapshot

1. Живой `NodeTree` владеет topology, Parameter subscriptions, общей revision и
   topologyRevision.
2. `snapshot()` возвращает новый JSON-compatible снимок сущностей и значений.
   Изменение снимка не меняет runtime, а runtime methods в снимке отсутствуют.
3. `NodeTree` существует без canvas, Engine и browser. Закрытие NodeEditor не
   уничтожает граф или значения Parameter.
4. Один `NodeTree` может одновременно обслуживать несколько независимых view.
   Selection, pan, zoom, hover, viewport и overlay state не являются состоянием
   графа.

## Projection

1. `tree.project(projector, request)` является единым входом получения
   производного представления. Конкретные измерения приходят от projector;
   `NodeTree` не содержит методов `measureBlenderNode` и не зависит от renderer.
2. Request явно задаёт всё, что может изменить результат: точный viewport,
   renderer identity, font/theme/density и layout policy либо их устойчивый key.
3. Intrinsic measurement содержит размеры Node, нижнюю границу собственного
   content и local offsets exact Socket. Он не содержит глобальных координат.
4. Positioned result содержит rect Frame/Node, resolved side и center Socket,
   points Link и bounds точного view.
5. Local render plan строится один раз после получения окончательного rect и
   затем передаётся Node renderer для materialization. NodeEditor не повторяет
   measurement или plan той же projection revision.
6. Projector не записывает размеры, стороны или coordinates обратно в
   канонические entities.

## Кэш и invalidation

1. Кэш проекции различает как минимум measurement key, layout key и plan key.
2. Тот же projector/request на той же применимой revision возвращает тот же
   результат без нового measurement, layout и plan.
3. Value-only изменение, не влияющее на intrinsic geometry, не меняет layout
   key и не запускает solver повторно.
4. Изменение label, состава Field/Parameter/Socket, font/theme/density либо
   intrinsic presentation перемеряет только затронутую Node; изменение topology
   или viewport пересчитывает layout.
5. Pan/zoom меняет только transform конкретного view. Оно не увеличивает
   measurement, layout или plan counters.
6. Асинхронный результат применяется только к generation дерева и request, для
   которых был запущен; устаревший результат отклоняется.

## Package boundary

1. Runtime entities, snapshot и generic projection contracts не импортируют
   `@nodes/ui`, `@ui/*`, Engine, DOM или product vocabulary.
2. `@nodes/layout` получает только минимальный numeric structured-clone graph.
3. `@nodes/ui` может адаптировать public runtime contracts `nodes`, но exact
   NodeEditor entrypoint не загружает solver без явного projection import.
4. Blender Field binding принадлежит UI adapter: root Parameter хранит value и
   renderer-neutral metadata, но не `FieldDefinition` callbacks.
5. Parent playground является dev-only workspace consumer. Он не входит в
   production exports `nodes`, `@nodes/layout` или `@nodes/ui`.
6. Legacy `NodeSystem*`, Port/Edge contracts и compatibility aliases не
   сохраняются.
7. `nodes`, `@nodes/layout` и `@nodes/ui` сохраняют независимые package-owned
   playground. Parent integration playground дополняет package-local стенды,
   но не заменяет и не удаляет их.

## Parent playground

1. Parent playground использует один `UiRuntime` и общий пятизонный
   `@ui/playground`, но semantic runtime и диагностика принадлежат `nodes`.
2. Route `/node-tree/runtime/live` показывает один живой NodeTree, его чистый
   snapshot, текущие revisions и counters measurement/layout/plan/materialize.
3. Изменение Field проходит `Field → Parameter.set → NodeTree change → project
   → NodeEditor` без отдельной карты значений и без ручных coordinates Node.
4. Ready marker публикуется только после первой projection, передачи результата
   NodeEditor и фактически отрисованного WebGPU frame.
5. Playground no-HMR и запускается через `$nodes-dev`; exact DOM, console `0` и
   non-black canvas доказывают только parent contour.
