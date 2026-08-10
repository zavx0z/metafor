# @ui/node

`@ui/node` владеет presentation-моделью node-system, измерением карточек,
viewport transforms и отображением через MetaFor WebGPU UI. Пакет не знает о
Hamiltonian, Dark, Bulk, Oracle или Force. Автоматические placement и routing
он делегирует [`@metafor/layout`](../../layout/README.md) через минимальный
числовой `LayoutGraph`.

`NodeSystemSurface` получает `PositionedNodeSystem` и отвечает только за:

* карточки, typography, sockets и compound compositing;
* локальное скругление готовых orthogonal waypoints без изменения endpoints;
* selection, hit-testing, pan/zoom и управляемое приложением fit;
* необязательное ручное move/resize для generic editors;
* transient moving-message particles поверх существующих semantic edges;
* связь выбранной ноды с отдельным `NodeInspectorSurface`.

Приложение, где автоматический engine единолично владеет координатами,
передаёт `editable: false`. В этом режиме selection никогда не меняет geometry,
а renderer не добавляет anchors, gateways, bends или второй routing pass.

## Карточки и сокеты

Surface и main-thread layout adapter используют общий `NodeSystemCardPlan`.
Adapter передаёт в `@metafor/layout` только измеренные width/height карточек и
вертикальные offsets сокетов. Значения параметров рисуются штатным
`@ui/components TextField` в disabled-состоянии, если монитор не владеет их
изменением. Каждый socket остаётся частью конкретной parameter row, а endpoint
ребра совпадает с центром этого видимого socket.

Compound background рисуется ниже проходящих внутри владельца routes, затем
foreground владельца и полные карточки потомков перекрывают линии. Поэтому
edge виден внутри owner, но не проходит поверх текста или дочерней карточки.

## Бесконечный холст

`canvasTransform = {x, y, scale}` описывает содержимое внутри surface, а не
engine `ViewPoint`. Trackpad wheel панорамирует холст, pinch плавно масштабирует
его вокруг cursor. После первого materialized transform resize surface не
делает неявный fit: это решение остаётся у приложения.

## Inspector и сообщения

Inspector использует штатные `HudWindow` и `HudSideTab`. Выбор ноды обновляет
его содержимое, но не обязан открывать окно. Geometry pane и её stick хранит
приложение.

Transient edge-message не входит в layout document. Одно сообщение создаёт
одну движущуюся частицу вдоль готового rounded route и не меняет topology,
selection или persisted presentation state. Анимационные кадры запрашиваются
только пока существует хотя бы одна живая частица.

## Проверка

```bash
bun test pkg/ui/node
```

Числовые законы и Worker parity проверяются отдельно у владельца:

```bash
bun test pkg/layout/src
```
