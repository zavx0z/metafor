import {
  defineStorybookStoryModule,
  type StorybookStoryArgs,
  type StorybookStoryModule,
} from "@zavx0z/storybook/stories"
import {validationGraphFixture} from "../fixtures/graph.ts"
import {renderGraphJson} from "./render-json.ts"
import {graphJsonStorySource} from "./source.ts"

type ValidationGraphArgs = StorybookStoryArgs & Readonly<{
  "include-revision": boolean
}>

export function createValidationGraphStory(): StorybookStoryModule {
  return defineStorybookStoryModule<ValidationGraphArgs>({
    defaultArgs: {"include-revision": true},
    controls: [{
      key: "include-revision",
      label: "Добавить revision",
      group: "Кандидат",
      kind: "boolean",
      description: "Неразрешённое поле проверяет закрытую форму Graph.",
    }],
    render(surface, args, frame) {
      renderGraphJson(
        surface,
        frame,
        "quantum-graph-validation",
        "Закрытая проверка Graph",
        validationGraphFixture(args["include-revision"]),
      )
    },
    source(args) {
      const typescript = [
        'import {validateGraph} from "@metafor/types/metafor/graph"',
        'import {createGraphFixture} from "../../../tests/graph/fixture.ts"',
        "",
        "const graph = createGraphFixture()",
        args["include-revision"]
          ? "const candidate = {...graph, revision: 17}"
          : "const candidate = graph",
        "export const result = validateGraph(candidate)",
      ].join("\n")
      return graphJsonStorySource({
        id: "quantum-graph-validation",
        title: "Закрытая проверка Graph",
        typescript,
      })
    },
  })
}
