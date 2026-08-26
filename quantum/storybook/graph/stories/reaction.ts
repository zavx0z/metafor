import {
  defineStorybookStoryModule,
  type StorybookStoryModule,
} from "@zavx0z/storybook/stories"
import {reactionGraphFixture} from "../fixtures/graph.ts"
import {renderGraphJson} from "./render-json.ts"

/** Shows every declared and resolved dependency without loading Mass content. */
export function createReactionGraphStory(): StorybookStoryModule {
  return defineStorybookStoryModule({
    defaultArgs: {},
    controls: [],
    render(surface, _args, frame) {
      renderGraphJson(
        surface,
        frame,
        "quantum-graph-reaction",
        "Reaction · зависимости и Mass",
        reactionGraphFixture(),
      )
    },
    source() {
      return [
        'import {createGraphFixture} from "../../../tests/graph/fixture.ts"',
        "",
        "const graph = createGraphFixture()",
        "export const result = {",
        "  declaration: graph.template[graph.root]?.reactions?.[0] ?? null,",
        "  relation: graph.runtime.reactions[0] ?? null,",
        "  mass: graph.runtime.roots[0]?.kind === 'atom' ? graph.runtime.roots[0].mass : [],",
        "}",
      ].join("\n")
    },
  })
}
