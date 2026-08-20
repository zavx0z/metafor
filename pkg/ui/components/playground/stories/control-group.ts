import {ControlGroup} from "@ui/components/control-group"
import {flexColumn} from "@ui/elements/flex"
import {input} from "@ui/elements/input"
import {uiShapeMetrics} from "@ui/elements"
import {
  definePlaygroundStoryModule,
  type PlaygroundStoryArgs,
  type PlaygroundStoryModule,
} from "@ui/playground/stories"

type ControlGroupStoryArgs = PlaygroundStoryArgs & Readonly<{
  rows: number
}>

export function createControlGroupStory(): PlaygroundStoryModule {
  return definePlaygroundStoryModule<ControlGroupStoryArgs>({
    defaultArgs: {rows: 3},
    controls: [
      {key: "rows", label: "Строки", group: "Внешний вид", kind: "number"},
    ],
    render(surface, args, frame) {
      const rows = controlGroupRows(args.rows)
      const width = 146
      const height = rows * uiShapeMetrics.controlHeight
      const x = frame.x + (frame.w - width) / 2
      const y = frame.y + frame.h * 0.56 - height / 2
      ControlGroup(surface, x, y, width, height, {
        rows,
        children(group) {
          flexColumn({
            x,
            y,
            w: width,
            h: height,
            gap: 0,
            items: Array.from({length: rows}, (_, index) => ({
              height: "1fr" as const,
              draw: (cellX, cellY, cellW, cellH) => input(surface, cellX, cellY, cellW, cellH, {
                key: `components-story-control-group:${index}`,
                value: String(index + 1),
                appearance: group.cell(index, 0).inputAppearance,
                style: group.cellStyle,
              }),
            })),
          })
        },
      })
    },
    source(args) {
      return controlGroupSource(controlGroupRows(args.rows))
    },
  })
}

function controlGroupRows(value: number): number {
  if (!Number.isFinite(value)) return 3
  return Math.min(4, Math.max(2, Math.trunc(value)))
}

function controlGroupSource(rows: number): string {
  return [
    'import {ControlGroup} from "@ui/components/control-group"',
    'import {flexColumn} from "@ui/elements/flex"',
    'import {input} from "@ui/elements/input"',
    "",
    `ControlGroup(surface, x, y, 146, ${rows * uiShapeMetrics.controlHeight}, {`,
    `  rows: ${rows},`,
    "  children(group) {",
    "    flexColumn({x, y, w: 146, h, gap: 0, items: cells(group)})",
    "  },",
    "})",
  ].join("\n")
}
