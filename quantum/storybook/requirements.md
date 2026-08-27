# Требования `@quantum/storybook`

## `QUANTUM-STORYBOOK-DOM-001` — единая DOM-лаборатория

Quantum Storybook остаётся одним private package, process, delivery page и
WebGPU canvas. Его exact route tree сохраняет все публичные `graph/**` routes и
`bulk/hud/default`; неизвестные suffixes остаются 404. Root URL направляет на
объявленный home `/graph/` и не является отдельным сценарием.

Exact bootstrap выбирает только одну из двух DOM-native domain entries. Graph и
Bulk создают собственный `@zavx0z/dom` Document, общий DOM Workbench и один
`createDocumentCanvasRuntime()` на существующем canvas. Navigation, controls и
product interaction используют standard bubbling DOM events.

Graph catalog лениво загружает пять принятых сценариев: полный документ,
Reaction relation, closed validation, производную NodeTree и snapshot-local
identity. Каждый route-tree overview имеет собственное semantic presentation и
не подставляет первый detail leaf. JSON-сценарии показываются public
`@ui/components/code-editor`, а NodeTree строится настоящим
`@metafor/node-tree` adapter и отображает его Frames, Nodes, Parameters, Sockets
и Links как один стабильный DOM tree.

Bulk detail использует production `createBulkHudDocument()`. Root и HUD
overviews не создают detail controller и показывают только собственное
semantic содержание.

Static artifact содержит exact source/dependency identities, обе route families,
lazy domain/story chunks и один Engine-owned font. Browser graph и собранный
artifact не содержат прежний Layout/Elements rendering path. Storybook не
экспортирует product API и не становится владельцем Graph, NodeTree или Bulk
state.
