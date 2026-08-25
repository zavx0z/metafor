import {
  defineStorybookStoryModule,
  type StorybookStoryArgs,
  type StorybookStoryModule,
} from "@zavx0z/storybook/stories"
import {
  currentGraphFixture,
  type CurrentGraphView,
} from "../fixtures/graph.ts"
import {renderGraphJson} from "./render-json.ts"

type CurrentGraphArgs = StorybookStoryArgs & Readonly<{
  view: CurrentGraphView
}>

export function createCurrentGraphStory(): StorybookStoryModule {
  return defineStorybookStoryModule<CurrentGraphArgs>({
    defaultArgs: {view: "graph"},
    controls: [{
      key: "view",
      label: "Проекция",
      group: "Отображение",
      kind: "select",
      options: [
        {value: "graph", label: "Публичный Graph"},
        {value: "bulk", label: "Проекция Bulk"},
      ],
    }],
    render(surface, args, frame) {
      renderGraphJson(
        surface,
        frame,
        "quantum-graph-current",
        args.view === "graph" ? "Текущий полный Graph" : "Состав проекции Bulk",
        currentGraphFixture(args.view),
      )
    },
    source(args) {
      return [
        'import {createGraphFixture} from "../../../tests/graph/fixture.ts"',
        'import {projectBulkGraph} from "../../../bulk/graph/projection.ts"',
        "",
        "const graph = createGraphFixture()",
        args.view === "graph"
          ? "export const result = graph"
          : "export const result = projectBulkGraph(graph)",
      ].join("\n")
    },
  })
}
