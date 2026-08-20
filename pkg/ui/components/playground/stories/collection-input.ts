import {
  CollectionInput,
  measureCollectionInputHeight,
  type CollectionInputItem,
  type CollectionInputProps,
} from "@ui/components/collection-input"
import {
  definePlaygroundStoryModule,
  type PlaygroundStoryArgs,
  type PlaygroundStoryModule,
} from "@ui/playground/stories"
import {uiShapeMetrics} from "@ui/elements"
import type {CollectionInputStoryVariant} from "../stories.ts"

type CollectionInputStoryArgs = PlaygroundStoryArgs & Readonly<{
  items: readonly CollectionInputItem[]
  "selected-id": string | null
  "visible-rows": number
  density: "regular" | "compact"
  disabled: boolean
  readonly: boolean
  event: string
}>

const SAMPLE_ITEMS = Object.freeze([
  Object.freeze({id: "position", label: "Позиция", description: "Векторный атрибут"}),
  Object.freeze({id: "normal", label: "Нормаль", description: "Отключённый атрибут", disabled: true}),
  Object.freeze({id: "rotation", label: "Вращение", description: "Углы объекта"}),
]) satisfies readonly CollectionInputItem[]

declare global {
  var __componentsStoryControlBridge: ((key: string, value: unknown) => void) | undefined
}

export function createCollectionInputStory(variant: CollectionInputStoryVariant): PlaygroundStoryModule {
  return definePlaygroundStoryModule<CollectionInputStoryArgs>({
    defaultArgs: collectionInputDefaults(variant),
    controls: [
      {key: "items", label: "Элементы", group: "Данные", kind: "custom"},
      {
        key: "selected-id",
        label: "Выбранный элемент",
        group: "Значение",
        kind: "select",
        options: [
          {value: "position", label: "Позиция"},
          {value: "normal", label: "Нормаль"},
          {value: "rotation", label: "Вращение"},
          {value: "", label: "Нет выбора"},
        ],
      },
      {key: "visible-rows", label: "Видимые строки", group: "Внешний вид", kind: "number"},
      {
        key: "density",
        label: "Плотность",
        group: "Внешний вид",
        kind: "select",
        options: [
          {value: "regular", label: "Обычная"},
          {value: "compact", label: "Компактная"},
        ],
      },
      {key: "disabled", label: "Недоступно", group: "Состояние", kind: "boolean"},
      {key: "readonly", label: "Только чтение", group: "Состояние", kind: "boolean"},
      {key: "event", label: "Последнее событие", group: "События", kind: "custom"},
    ],
    render(surface, args, frame) {
      const items = collectionItems(args.items)
      const selectedId = collectionSelectedId(args["selected-id"], items)
      const props: CollectionInputProps = {
        key: "components-story-collection-input",
        items,
        selectedId,
        visibleRows: args["visible-rows"],
        emptyLabel: "Нет элементов",
        density: args.density,
        disabled: args.disabled,
        readOnly: args.readonly,
        onSelect(id) {
          globalThis.__componentsStoryControlBridge?.("selected-id", id)
          globalThis.__componentsStoryControlBridge?.("event", `onSelect: ${id}`)
        },
        onAdd() {
          const id = nextItemId(items)
          const next = Object.freeze([...items, Object.freeze({id, label: `Элемент ${items.length + 1}`})])
          globalThis.__componentsStoryControlBridge?.("items", next)
          globalThis.__componentsStoryControlBridge?.("selected-id", id)
          globalThis.__componentsStoryControlBridge?.("event", "onAdd")
        },
        onRemove(id) {
          globalThis.__componentsStoryControlBridge?.("items", Object.freeze(items.filter((item) => item.id !== id)))
          globalThis.__componentsStoryControlBridge?.("selected-id", null)
          globalThis.__componentsStoryControlBridge?.("event", `onRemove: ${id}`)
        },
        onMove(id, direction) {
          const next = moveCollectionItem(items, id, direction)
          if (next === items) return
          const moveLabel = direction === "up" ? "вверх" : "вниз"
          globalThis.__componentsStoryControlBridge?.("items", next)
          globalThis.__componentsStoryControlBridge?.("event", `onMove: ${id}, ${moveLabel}`)
        },
      }
      const width = 121 + uiShapeMetrics.tightGap + uiShapeMetrics.iconActionSlot
      const height = measureCollectionInputHeight(props)
      CollectionInput(
        surface,
        frame.x + (frame.w - width) / 2,
        frame.y + frame.h * 0.56 - height / 2,
        width,
        height,
        props,
      )
    },
    source(args) {
      return collectionInputSource(args)
    },
  })
}

function collectionInputDefaults(variant: CollectionInputStoryVariant): CollectionInputStoryArgs {
  return Object.freeze({
    items: variant === "empty" ? Object.freeze([]) : SAMPLE_ITEMS,
    "selected-id": variant === "empty" ? null : "rotation",
    "visible-rows": 3,
    density: variant === "compact" ? "compact" : "regular",
    disabled: variant === "disabled",
    readonly: variant === "readonly",
    event: "Ожидание",
  })
}

function collectionInputSource(args: CollectionInputStoryArgs): string {
  const items = collectionItems(args.items)
  const selectedId = collectionSelectedId(args["selected-id"], items)
  const properties = [
    "  items,",
    `  selectedId: ${JSON.stringify(selectedId)},`,
    `  visibleRows: ${JSON.stringify(args["visible-rows"])},`,
    `  density: ${JSON.stringify(args.density)},`,
  ]
  if (args.disabled) properties.push("  disabled: true,")
  if (args.readonly) properties.push("  readOnly: true,")
  properties.push(
    "  onSelect: setSelectedId,",
    "  onAdd: addItem,",
    "  onRemove: removeItem,",
    "  onMove: moveItem,",
  )
  return [
    'import {CollectionInput, type CollectionInputItem} from "@ui/components/collection-input"',
    "",
    `const items: readonly CollectionInputItem[] = ${JSON.stringify(items)}`,
    "",
    "CollectionInput(surface, x, y, width, height, {",
    ...properties,
    "})",
  ].join("\n")
}

function collectionItems(value: unknown): readonly CollectionInputItem[] {
  if (!Array.isArray(value)) return SAMPLE_ITEMS
  return Object.freeze(value.flatMap((entry): readonly CollectionInputItem[] => {
    if (typeof entry !== "object" || entry === null) return []
    const candidate = entry as Readonly<Record<string, unknown>>
    if (typeof candidate.id !== "string" || typeof candidate.label !== "string") return []
    return [Object.freeze({
      id: candidate.id,
      label: candidate.label,
      ...(typeof candidate.description === "string" ? {description: candidate.description} : {}),
      ...(candidate.disabled === true ? {disabled: true} : {}),
    })]
  }))
}

function collectionSelectedId(value: unknown, items: readonly CollectionInputItem[]): string | null {
  if (value === null || value === "") return null
  return typeof value === "string" && items.some(({id}) => id === value) ? value : null
}

function nextItemId(items: readonly CollectionInputItem[]): string {
  let index = items.length + 1
  while (items.some(({id}) => id === `item-${index}`)) index += 1
  return `item-${index}`
}

function moveCollectionItem(
  items: readonly CollectionInputItem[],
  id: string,
  direction: "up" | "down",
): readonly CollectionInputItem[] {
  const index = items.findIndex((item) => item.id === id)
  const targetIndex = direction === "up" ? index - 1 : index + 1
  if (index < 0 || targetIndex < 0 || targetIndex >= items.length) return items
  return Object.freeze(items.map((item, itemIndex) => {
    if (itemIndex === index) return items[targetIndex]!
    if (itemIndex === targetIndex) return items[index]!
    return item
  }))
}
