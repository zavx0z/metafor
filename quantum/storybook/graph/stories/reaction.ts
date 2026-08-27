import type {Document} from "@zavx0z/dom"
import {
  createGraphJsonStory,
  type GraphDomStory,
} from "../dom-story.ts"
import {reactionGraphFixture} from "../fixtures/graph.ts"

/** Shows declared/resolved dependencies and Mass metadata without loading content. */
export function createReactionGraphStory(document: Document): GraphDomStory {
  return createGraphJsonStory(document, {
    id: "quantum-graph-reaction",
    title: "Reaction · зависимости и Mass",
    defaultArgs: {},
    value: () => reactionGraphFixture(),
    typescript: () => [
      'import {createGraphFixture} from "../../../tests/graph/fixture.ts"',
      "",
      "const graph = createGraphFixture()",
      "export const result = {",
      "  declaration: graph.template[graph.root]?.reactions?.[0] ?? null,",
      "  relation: graph.runtime.reactions[0] ?? null,",
      "  mass: graph.runtime.roots[0]?.kind === 'atom' ? graph.runtime.roots[0].mass : [],",
      "}",
    ].join("\n"),
  })
}
