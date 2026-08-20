import {describe, expect, test} from "bun:test"
import {
  type UiSurface,
  UiSurface as BaseUiSurface,
  uiShapeMetrics,
} from "@ui/elements"
import {
  CollectionInput,
  findCollectionInputSelection,
  measureCollectionInputHeight,
  normalizeCollectionInputVisibleRows,
  type CollectionInputItem,
  type CollectionInputMoveDirection,
  type CollectionInputProps,
} from "./CollectionInput.ts"
import {
  Field,
  type CollectionFieldDefinition,
} from "./Field.ts"

type RoundedRectCall = Parameters<UiSurface["drawRoundedRect"]>
type CenteredTextCall = Parameters<UiSurface["drawTextCentered"]>
type TextCall = Parameters<UiSurface["drawText"]>
type HitCall = Parameters<UiSurface["hit"]>

class RecordingSurface extends BaseUiSurface {
  readonly roundedRects: RoundedRectCall[] = []
  readonly centeredTexts: CenteredTextCall[] = []
  readonly texts: TextCall[] = []
  readonly hits: HitCall[] = []

  override drawRoundedRect(...args: RoundedRectCall): void {
    this.roundedRects.push(args)
  }

  override drawTextCentered(...args: CenteredTextCall): number {
    this.centeredTexts.push(args)
    return 0
  }

  override drawText(...args: TextCall): number {
    this.texts.push(args)
    return 0
  }

  override hit(...args: HitCall): void {
    this.hits.push(args)
  }

  override pushClip(): void {}

  override popClip(): void {}

  protected render(): void {}
}

const items = Object.freeze([
  Object.freeze({id: "position", label: "Position", description: "Vector attribute"}),
  Object.freeze({id: "normal", label: "Normal", description: "Disabled attribute", disabled: true}),
  Object.freeze({id: "rotation", label: "Rotation"}),
]) satisfies readonly CollectionInputItem[]

const props = (
  events: string[],
  extra: Partial<CollectionInputProps> = {},
): CollectionInputProps => ({
  key: "attributes",
  items,
  selectedId: "rotation",
  onSelect: (id) => events.push(`select:${id}`),
  onAdd: () => events.push("add"),
  onRemove: (id) => events.push(`remove:${id}`),
  ...extra,
})

const move = (events: string[]) => (
  id: string,
  direction: CollectionInputMoveDirection,
): void => {
  events.push(`move:${id}:${direction}`)
}

const trigger = (hit: HitCall | undefined): void => {
  expect(hit).toBeDefined()
  hit![4]()
}

const expectTextInsideRows = (surface: RecordingSurface, rowHeight: number): void => {
  for (const [, , y, options] of surface.texts) {
    const rowY = Math.floor(y / rowHeight) * rowHeight
    expect(y).toBeGreaterThanOrEqual(rowY)
    expect(y + options.fontPx).toBeLessThanOrEqual(rowY + rowHeight)
  }
}

describe("public CollectionInput", () => {
  test("normalizes bounded visible rows and measures MetaFor production rhythm", () => {
    expect(normalizeCollectionInputVisibleRows()).toBe(3)
    expect(normalizeCollectionInputVisibleRows(0)).toBe(1)
    expect(normalizeCollectionInputVisibleRows(4.8)).toBe(4)
    expect(normalizeCollectionInputVisibleRows(99)).toBe(8)
    expect(normalizeCollectionInputVisibleRows(Number.NaN)).toBe(3)
    expect(measureCollectionInputHeight({visibleRows: 3})).toBe(108)
    expect(measureCollectionInputHeight({density: "compact", visibleRows: 3})).toBe(72)
    expect(measureCollectionInputHeight({visibleRows: 1})).toBe(60)
    expect(measureCollectionInputHeight({density: "compact", visibleRows: 1})).toBe(47)
    expect(measureCollectionInputHeight({visibleRows: 3, onMove: () => {}})).toBe(124)
    expect(measureCollectionInputHeight({density: "compact", visibleRows: 3, onMove: () => {}})).toBe(97)
    expect(measureCollectionInputHeight({visibleRows: 1, onMove: () => {}})).toBe(124)
    expect(measureCollectionInputHeight({density: "compact", visibleRows: 1, onMove: () => {}})).toBe(97)
  })

  test("resolves only an existing controlled selection without changing immutable items", () => {
    expect(findCollectionInputSelection(items, "rotation")).toBe(items[2])
    expect(findCollectionInputSelection(items, "missing")).toBeUndefined()
    expect(findCollectionInputSelection(items, null)).toBeUndefined()
    expect(items.map(({id}) => id)).toEqual(["position", "normal", "rotation"])
  })

  test("publishes row selection, independent add and valid selected-item removal", () => {
    const events: string[] = []
    const surface = new RecordingSurface()
    CollectionInput(surface, 4, 6, 180, 108, props(events))

    expect(surface.hits.map(([x, y, width, height]) => ({x, y, width, height}))).toEqual([
      {x: 4, y: 6, width: 145, height: 36},
      {x: 4, y: 78, width: 145, height: 36},
      {x: 156, y: 6, width: 28, height: 28},
      {x: 156, y: 38, width: 28, height: 28},
    ])
    trigger(surface.hits[0])
    trigger(surface.hits[2])
    trigger(surface.hits[3])
    expect(events).toEqual(["select:position", "add", "remove:rotation"])
    expect(items[2]?.id).toBe("rotation")
    expect(surface.centeredTexts.map(([text]) => text)).not.toContain("↑")
    expect(surface.centeredTexts.map(([text]) => text)).not.toContain("↓")
  })

  test("adds adjacent reorder actions without changing the controlled items", () => {
    const events: string[] = []
    const surface = new RecordingSurface()
    const before = items.map((item) => item)
    CollectionInput(surface, 4, 6, 180, 124, props(events, {onMove: move(events)}))

    expect(surface.hits.map(([x, y, width, height]) => ({x, y, width, height}))).toEqual([
      {x: 4, y: 6, width: 145, height: 36},
      {x: 4, y: 78, width: 145, height: 36},
      {x: 156, y: 6, width: 28, height: 28},
      {x: 156, y: 38, width: 28, height: 28},
      {x: 156, y: 70, width: 28, height: 28},
      {x: 156, y: 102, width: 28, height: 28},
    ])
    expect(surface.centeredTexts.map(([text]) => text)).toEqual(["↑", "↓"])
    trigger(surface.hits[4])
    expect(events).toEqual(["move:rotation:up"])
    expect(items.map((item) => item)).toEqual(before)
    expect(items[2]).toBe(before[2])
  })

  test("enables only the legal adjacent move at collection boundaries", () => {
    const cases = [
      {selectedId: "position", direction: "down"},
      {selectedId: "rotation", direction: "up"},
    ] as const

    for (const {selectedId, direction} of cases) {
      const events: string[] = []
      const surface = new RecordingSurface()
      CollectionInput(surface, 0, 0, 180, 124, props(events, {selectedId, onMove: move(events)}))
      const actionHits = surface.hits.filter(([x]) => x === 152)
      const moveHits = actionHits.filter(([, hitY]) => hitY === 64 || hitY === 96)
      expect(moveHits).toHaveLength(2)
      for (const hit of moveHits) trigger(hit)
      expect(events).toEqual([`move:${selectedId}:${direction}`])
    }
  })

  test("blocks reorder for missing, null and disabled selections", () => {
    for (const selectedId of [null, "missing", "normal"] as const) {
      const events: string[] = []
      const surface = new RecordingSurface()
      CollectionInput(surface, 0, 0, 180, 124, props(events, {selectedId, onMove: move(events)}))
      const moveHits = surface.hits.filter(([x, y]) => x === 152 && (y === 64 || y === 96))
      expect(moveHits).toHaveLength(2)
      for (const hit of moveHits) trigger(hit)
      expect(events).toEqual([])
    }
  })

  test("keeps all regular and compact reorder operators inside one-row measured height", () => {
    for (const density of ["regular", "compact"] as const) {
      const events: string[] = []
      const height = measureCollectionInputHeight({density, visibleRows: 1, onMove: move(events)})
      const surface = new RecordingSurface()
      CollectionInput(surface, 0, 0, 180, height, props(events, {
        density,
        visibleRows: 1,
        selectedId: "position",
        onMove: move(events),
      }))
      const dockX = density === "compact" ? 158 : 152
      const actionHits = surface.hits.filter(([x]) => x === dockX)
      expect(actionHits).toHaveLength(4)
      for (const [, y, , hitHeight] of actionHits) expect(y + hitHeight).toBeLessThanOrEqual(height)
      expect(surface.centeredTexts.map(([text]) => text)).toEqual(["↑", "↓"])
    }
  })

  test("keeps regular descriptions and compact single-line text inside exact rows", () => {
    const regular = new RecordingSurface()
    CollectionInput(regular, 0, 0, 180, 108, props([]))
    const regularText = regular.texts.map(([text, , , options]) => ({text, fontPx: options.fontPx}))
    expect(regularText).toContainEqual({text: "Position", fontPx: 12})
    expect(regularText).toContainEqual({text: "Vector attribute", fontPx: 10})
    expectTextInsideRows(regular, 36)
    expect(regular.roundedRects[0]?.[4].radius).toBe(uiShapeMetrics.lowRadius)

    const compact = new RecordingSurface()
    CollectionInput(compact, 0, 0, 180, 72, props([], {density: "compact"}))
    const compactText = compact.texts.map(([text, , , options]) => ({text, fontPx: options.fontPx}))
    expect(compactText).toContainEqual({text: "Position", fontPx: 11})
    expect(compactText.map(({text}) => text)).not.toContain("Vector attribute")
    expect(compactText.map(({text}) => text)).not.toContain("Disabled attribute")
    expectTextInsideRows(compact, 24)
    expect(compact.roundedRects[0]?.[4].radius).toBe(uiShapeMetrics.lowRadius)
  })

  test("keeps add independent while invalid, disabled and read-only state block mutation", () => {
    for (const extra of [
      {selectedId: null},
      {selectedId: "missing"},
      {selectedId: "normal"},
    ] satisfies Partial<CollectionInputProps>[]) {
      const events: string[] = []
      const surface = new RecordingSurface()
      CollectionInput(surface, 0, 0, 180, 108, props(events, extra))
      const actionHits = surface.hits.filter(([x]) => x === 152)
      const addHit = actionHits.find(([, y]) => y === 0)
      trigger(addHit)
      for (const hit of actionHits.filter(([, y]) => y !== 0)) trigger(hit)
      expect(events).toEqual(["add"])
    }

    for (const state of [{disabled: true}, {readOnly: true}] as const) {
      const events: string[] = []
      const surface = new RecordingSurface()
      CollectionInput(surface, 0, 0, 180, 124, props(events, {...state, onMove: move(events)}))
      for (const hit of surface.hits) trigger(hit)
      expect(events).toEqual([])
    }
  })

  test("renders a stable empty row and bounded scroll viewport", () => {
    const surface = new RecordingSurface()
    CollectionInput(surface, 0, 0, 180, 48, props([], {
      density: "compact",
      items: [],
      selectedId: null,
      visibleRows: 2,
      emptyLabel: "Нет атрибутов",
    }))

    expect(surface.texts.map(([text]) => text)).toContain("Нет атрибутов")
    expect(surface.hits.map(([x, y, width, height]) => ({x, y, width, height}))).toEqual([
      {x: 158, y: 0, width: 22, height: 22},
      {x: 158, y: 25, width: 22, height: 22},
    ])
  })

  test("delegates the same controlled actions through regular and compact collection Fields", () => {
    const standaloneEvents: string[] = []
    const regularEvents: string[] = []
    const compactEvents: string[] = []

    const standalone = new RecordingSurface()
    CollectionInput(standalone, 0, 0, 180, 124, props(standaloneEvents, {onMove: move(standaloneEvents)}))
    trigger(standalone.hits[0])
    trigger(standalone.hits[2])
    trigger(standalone.hits[3])
    trigger(standalone.hits[4])

    const definition = (events: string[]): CollectionFieldDefinition => ({
      id: "attributes",
      label: "Attributes",
      kind: "collection",
      items,
      selectedId: "rotation",
      onSelect: (id) => events.push(`select:${id}`),
      onAdd: () => events.push("add"),
      onRemove: (id) => events.push(`remove:${id}`),
      onMove: move(events),
    })

    const regular = new RecordingSurface()
    Field(regular, 0, 0, 180, definition(regularEvents))
    trigger(regular.hits[0])
    trigger(regular.hits[2])
    trigger(regular.hits[3])
    trigger(regular.hits[4])

    const compact = new RecordingSurface()
    Field(compact, 0, 0, 180, definition(compactEvents), {density: "compact"})
    trigger(compact.hits[0])
    trigger(compact.hits[2])
    trigger(compact.hits[3])
    trigger(compact.hits[4])

    expect(regularEvents).toEqual(standaloneEvents)
    expect(compactEvents).toEqual(standaloneEvents)
  })
})
