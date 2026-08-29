import type {Document} from "@zavx0z/dom"
import {
  createGraphJsonStory,
  type GraphDomStory,
} from "./dom-story.tsx"
import {
  currentGraphFixture,
  type CurrentGraphView,
} from "../fixtures/graph.ts"

type CurrentGraphArgs = Readonly<{view: CurrentGraphView}>

export function createCurrentGraphStory(document: Document): GraphDomStory<CurrentGraphArgs> {
  return createGraphJsonStory(document, {
    id: "quantum-graph-current",
    title: "Текущий полный Graph",
    defaultArgs: {view: "graph"},
    control: {
      kind: "select",
      key: "view",
      label: "Проекция",
      description: "Публичный Graph либо независимый состав Bulk projection.",
      options: [
        {value: "graph", label: "Публичный Graph"},
        {value: "bulk", label: "Проекция Bulk"},
      ],
    },
    value: ({view}) => currentGraphFixture(view),
    typescript: ({view}) => [
      'import {createGraphFixture} from "../../../quantum/tests/graph/fixture.ts"',
      'import {projectBulkGraph} from "../../../quantum/bulk/graph/projection.ts"',
      "",
      "const graph = createGraphFixture()",
      view === "graph"
        ? "export const result = graph"
        : "export const result = projectBulkGraph(graph)",
    ].join("\n"),
  })
}
