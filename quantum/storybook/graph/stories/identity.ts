import {
  defineStorybookStoryModule,
  type StorybookStoryArgs,
  type StorybookStoryModule,
} from "@zavx0z/storybook/stories"
import {identityGraphFixture} from "../fixtures/graph.ts"
import {renderGraphJson} from "./render-json.ts"

type IdentityGraphArgs = StorybookStoryArgs & Readonly<{
  "insert-sibling": boolean
}>

export function createIdentityGraphStory(): StorybookStoryModule {
  return defineStorybookStoryModule<IdentityGraphArgs>({
    defaultArgs: {"insert-sibling": true},
    controls: [{
      key: "insert-sibling",
      label: "Вставить соседний Atom",
      group: "Структура",
      kind: "boolean",
      description: "Новый Atom той же Meta вставляется перед существующими детьми.",
    }],
    render(surface, args, frame) {
      renderGraphJson(
        surface,
        frame,
        "quantum-graph-identity",
        "Путь и идентичность после вставки",
        identityGraphFixture(args["insert-sibling"]),
      )
    },
    source(args) {
      return [
        'import {createGraphFixture, insertSameMetaSibling, runtimeFieldAt} from "../../../tests/graph/fixture.ts"',
        "",
        'const pointer = "/runtime/roots/0/children/1"',
        "const before = createGraphFixture()",
        args["insert-sibling"]
          ? "const after = insertSameMetaSibling(before)"
          : "const after = before",
        'export const result = {before: runtimeFieldAt(before, pointer, "name"), after: runtimeFieldAt(after, pointer, "name")}',
      ].join("\n")
    },
  })
}
