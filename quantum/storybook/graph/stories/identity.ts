import type {Document} from "@zavx0z/dom"
import {
  createGraphJsonStory,
  type GraphDomStory,
} from "../dom-story.ts"
import {identityGraphFixture} from "../fixtures/graph.ts"

type IdentityGraphArgs = Readonly<{"insert-sibling": boolean}>

export function createIdentityGraphStory(document: Document): GraphDomStory<IdentityGraphArgs> {
  return createGraphJsonStory(document, {
    id: "quantum-graph-identity",
    title: "Путь и идентичность после вставки",
    defaultArgs: {"insert-sibling": true},
    control: {
      kind: "boolean",
      key: "insert-sibling",
      label: "Вставить соседний Atom",
      description: "Новый Atom той же Meta вставляется перед существующими детьми.",
    },
    value: (args) => identityGraphFixture(args["insert-sibling"]),
    typescript: (args) => [
      'import {createGraphFixture, insertSameMetaSibling, runtimeFieldAt} from "../../../tests/graph/fixture.ts"',
      "",
      'const pointer = "/runtime/roots/0/children/1"',
      "const before = createGraphFixture()",
      args["insert-sibling"]
        ? "const after = insertSameMetaSibling(before)"
        : "const after = before",
      'export const result = {before: runtimeFieldAt(before, pointer, "name"), after: runtimeFieldAt(after, pointer, "name")}',
    ].join("\n"),
  })
}
