import {flexColumn} from "@ui/elements"
import {
  blenderLinkRenderer,
  blenderSocketRenderer,
} from "@nodes/ui/blender-node"
import {blenderParameterRenderer} from "@nodes/ui/parameter"
import {
  definePlaygroundStoryModule,
  type PlaygroundStoryArgs,
  type PlaygroundStoryModule,
} from "@ui/playground/stories"
import {
  createParameterStoryFixture,
} from "../fixtures/parameter-fixtures.ts"
import type {
  NodeParameterFieldKind,
  NodeParameterVariant,
} from "../parameter-catalog.ts"

type ParameterStoryArgs = PlaygroundStoryArgs & Readonly<{
  kind: NodeParameterFieldKind
  variant: NodeParameterVariant
}>

export function createParameterStory(
  kind: NodeParameterFieldKind,
  variant: NodeParameterVariant,
): PlaygroundStoryModule {
  return definePlaygroundStoryModule<ParameterStoryArgs>({
    defaultArgs: {kind, variant},
    render(surface, args, frame) {
      flexColumn({
        x: frame.x,
        y: frame.y,
        w: frame.w,
        h: frame.h,
        paddingTop: 58,
        paddingBottom: 28,
        alignItems: "center",
        justifyContent: "center",
        items: [{
          width: Math.min(520, Math.max(300, frame.w * 0.58)),
          height: "1fr",
          draw(x, y, w, h) {
            const parameterWidth = Math.max(180, w - 72)
            const probe = createParameterStoryFixture(args.kind, args.variant, {
              x: 0,
              y: 0,
              w: parameterWidth,
              h,
            })
            const linkHeight = probe.links.length === 0 ? 0 : 46
            const parameterY = y + (h - probe.entry.rect.h - linkHeight) / 2 + linkHeight
            const fixture = createParameterStoryFixture(args.kind, args.variant, {
              x: x + 36,
              y: parameterY,
              w: parameterWidth,
              h,
            })
            for (const entry of fixture.links) {
              blenderLinkRenderer.render({host: surface, entry, selected: false})
            }
            blenderParameterRenderer.render({
              host: surface,
              nodeId: fixture.nodeId,
              entry: fixture.entry,
              selected: false,
            })
            for (const entry of fixture.sockets) {
              blenderSocketRenderer.render({
                host: surface,
                nodeId: fixture.nodeId,
                entry,
                selected: false,
              })
            }
          },
        }],
      })
    },
    source(args) {
      const fixture = createParameterStoryFixture(args.kind, args.variant, {x: 80, y: 80, w: 360, h: 320})
      return [
        'import {blenderParameterRenderer, type ParameterPlan} from "@nodes/ui/parameter"',
        'import {blenderLinkRenderer, blenderSocketRenderer, type BlenderLink, type BlenderSocket} from "@nodes/ui/blender-node"',
        'import type {PositionedLink, PositionedSocket} from "@nodes/ui/node-editor"',
        "",
        `const entry: ParameterPlan = ${JSON.stringify(fixture.entry, null, 2)}`,
        `const sockets: readonly PositionedSocket<BlenderSocket>[] = ${JSON.stringify(fixture.sockets, null, 2)}`,
        `const links: readonly PositionedLink<BlenderLink>[] = ${JSON.stringify(fixture.links, null, 2)}`,
        "",
        "for (const entry of links) {",
        "  blenderLinkRenderer.render({host: surface, entry, selected: false})",
        "}",
        "blenderParameterRenderer.render({",
        "  host: surface,",
        `  nodeId: ${JSON.stringify(fixture.nodeId)},`,
        "  entry,",
        "  selected: false,",
        "})",
        "for (const entry of sockets) {",
        "  blenderSocketRenderer.render({",
        "    host: surface,",
        `    nodeId: ${JSON.stringify(fixture.nodeId)},`,
        "    entry,",
        "    selected: false,",
        "  })",
        "}",
      ].join("\n")
    },
  })
}
