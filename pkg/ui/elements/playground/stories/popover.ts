import {button} from "@ui/elements/button"
import {div} from "@ui/elements/div"
import {popover} from "@ui/elements/popover"
import {span} from "@ui/elements/span"
import {uiShapeMetrics} from "../../shape.ts"
import {
  definePlaygroundStoryModule,
  type PlaygroundStoryArgs,
  type PlaygroundStoryModule,
} from "@ui/playground/stories"

type PopoverStoryArgs = PlaygroundStoryArgs & Readonly<{
  open: boolean
  event: string
}>

declare global {
  var __elementsStoryControlBridge: ((key: string, value: unknown) => void) | undefined
}

export function createPopoverStory(variant: "closed" | "open"): PlaygroundStoryModule {
  return definePlaygroundStoryModule<PopoverStoryArgs>({
    defaultArgs: {open: variant === "open", event: "Ожидание"},
    controls: [
      {key: "open", label: "Открыт", group: "Состояние", kind: "boolean"},
      {key: "event", label: "Последнее событие", group: "События", kind: "custom"},
    ],
    render(surface, args, frame) {
      const width = 146
      const x = frame.x + (frame.w - width) / 2
      const y = frame.y + frame.h * 0.42
      popover(surface, x, y, width, uiShapeMetrics.controlHeight, {
        key: "elements-story-popover",
        open: args.open,
        contentSize: {width: 180, height: 72},
        onOpenChange(open) {
          globalThis.__elementsStoryControlBridge?.("open", open)
          globalThis.__elementsStoryControlBridge?.("event", `onOpenChange: ${open}`)
        },
        trigger(context) {
          button(surface, x, y, width, uiShapeMetrics.controlHeight, {
            key: "elements-story-popover-trigger",
            children: context.open ? "Закрыть" : "Открыть",
            onClick: context.toggle,
          })
        },
        content(rect) {
          div(surface, rect.x, rect.y, rect.w, rect.h, {
            style: {background: "bgPanel", borderColor: "borderRule", borderRadius: uiShapeMetrics.lowRadius},
          })
          span(surface, rect.x + 10, rect.y + 24, rect.w - 20, 24, {
            children: `Popover · ${rect.side}`,
            style: {color: "text", textAlign: "center"},
          })
        },
      })
    },
    source(args) {
      return [
        'import {button} from "@ui/elements/button"',
        'import {div} from "@ui/elements/div"',
        'import {popover} from "@ui/elements/popover"',
        "",
        `let open = ${args.open}`,
        "popover(surface, x, y, width, height, {",
        '  key: "details",',
        "  open,",
        "  contentSize: {width: 180, height: 72},",
        "  onOpenChange: setOpen,",
        "  trigger: ({toggle}) => button(surface, x, y, width, height, {children: \"Открыть\", onClick: toggle}),",
        "  content: (rect) => div(surface, rect.x, rect.y, rect.w, rect.h),",
        "})",
      ].join("\n")
    },
  })
}
