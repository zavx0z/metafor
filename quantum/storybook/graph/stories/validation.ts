import type {Document} from "@zavx0z/dom"
import {
  createGraphJsonStory,
  type GraphDomStory,
} from "../dom-story.ts"
import {validationGraphFixture} from "../fixtures/graph.ts"

type ValidationGraphArgs = Readonly<{"include-revision": boolean}>

export function createValidationGraphStory(
  document: Document,
): GraphDomStory<ValidationGraphArgs> {
  return createGraphJsonStory(document, {
    id: "quantum-graph-validation",
    title: "Закрытая проверка Graph",
    defaultArgs: {"include-revision": true},
    control: {
      kind: "boolean",
      key: "include-revision",
      label: "Добавить revision",
      description: "Неразрешённое поле проверяет закрытую форму Graph.",
    },
    value: (args) => validationGraphFixture(args["include-revision"]),
    typescript: (args) => [
      'import {validateGraph} from "@metafor/types/metafor/graph"',
      'import {createGraphFixture} from "../../../tests/graph/fixture.ts"',
      "",
      "const graph = createGraphFixture()",
      args["include-revision"]
        ? "const candidate = {...graph, revision: 17}"
        : "const candidate = graph",
      "export const result = validateGraph(candidate)",
    ].join("\n"),
  })
}
