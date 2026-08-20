import {button} from "@ui/elements/button"
import {div} from "@ui/elements/div"
import {span} from "@ui/elements/span"
import {
  definePlaygroundStoryModule,
  type PlaygroundStoryArgs,
  type PlaygroundStoryModule,
} from "@ui/playground/stories"

type EventStoryArgs = PlaygroundStoryArgs & Readonly<{
  label: string
  state: "idle" | "hover" | "press" | "release" | "click" | "disabled"
  clicks: number
  disabled: boolean
}>

declare global {
  var __elementsStoryControlBridge: ((key: string, value: unknown) => void) | undefined
}

export function createEventStory(variant: string): PlaygroundStoryModule {
  const state = eventState(variant)
  return definePlaygroundStoryModule<EventStoryArgs>({
    defaultArgs: {
      label: "Проверить событие",
      state,
      clicks: state === "click" ? 1 : 0,
      disabled: state === "disabled",
    },
    controls: [
      {key: "label", label: "Подпись", group: "Элемент", kind: "text"},
      {
        key: "state",
        label: "Состояние",
        group: "Событие",
        kind: "select",
        options: [
          {value: "idle", label: "Ожидание"},
          {value: "hover", label: "Наведение"},
          {value: "press", label: "Нажатие"},
          {value: "release", label: "Отпускание"},
          {value: "click", label: "Клик"},
          {value: "disabled", label: "Недоступно"},
        ],
      },
      {key: "disabled", label: "Недоступно", group: "Элемент", kind: "boolean"},
    ],
    render(surface, args, frame) {
      const centerX = frame.x + frame.w / 2
      const centerY = frame.y + frame.h * 0.57
      div(surface, centerX - 320, centerY - 150, 640, 300, {
        style: {background: "rgba(255, 255, 255, 0.035)", borderColor: "rgba(214, 231, 255, 0.16)", borderRadius: 32},
      })
      button(surface, centerX - 120, centerY - 74, 240, 52, {
        key: "elements-story-event-button",
        children: args.label,
        disabled: args.disabled,
        onPointerEnter: () => updateState("hover"),
        onPointerLeave: () => updateState("idle"),
        onPointerDown: () => updateState("press"),
        onPointerUp: () => updateState("release"),
        onClick: () => {
          globalThis.__elementsStoryControlBridge?.("clicks", args.clicks + 1)
          updateState("click")
        },
        style: {borderColor: stateColor(args.state)},
      })
      span(surface, centerX - 260, centerY + 18, 520, 30, {
        children: `Состояние: ${eventLabel(args.state)}`,
        style: {fontSize: 14, color: stateColor(args.state), textAlign: "center"},
      })
      span(surface, centerX - 260, centerY + 62, 520, 26, {
        children: `Клики: ${args.clicks}`,
        style: {fontSize: 12, color: "muted", textAlign: "center"},
      })
    },
    source(args) {
      return [
        'import {button} from "@ui/elements/button"',
        "",
        "button(surface, x, y, w, h, {",
        `  children: ${JSON.stringify(args.label)},`,
        `  disabled: ${args.disabled},`,
        "  onPointerEnter: () => setState(\"hover\"),",
        "  onPointerLeave: () => setState(\"idle\"),",
        "  onPointerDown: () => setState(\"press\"),",
        "  onPointerUp: () => setState(\"release\"),",
        "  onClick: () => setState(\"click\"),",
        "})",
      ].join("\n")
    },
  })
}

function updateState(state: EventStoryArgs["state"]): void {
  globalThis.__elementsStoryControlBridge?.("state", state)
}

function eventState(value: string): EventStoryArgs["state"] {
  if (value === "hover" || value === "press" || value === "release" || value === "click" || value === "disabled") return value
  return "idle"
}

function eventLabel(state: EventStoryArgs["state"]): string {
  if (state === "hover") return "наведение"
  if (state === "press") return "нажатие"
  if (state === "release") return "отпускание"
  if (state === "click") return "клик"
  if (state === "disabled") return "недоступно"
  return "ожидание"
}

function stateColor(state: EventStoryArgs["state"]): "cyan" | "green" | "orange" | "red" | "muted" {
  if (state === "click") return "green"
  if (state === "press") return "orange"
  if (state === "disabled") return "muted"
  if (state === "release") return "red"
  return "cyan"
}
