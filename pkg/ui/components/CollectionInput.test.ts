import {describe, expect, test} from "bun:test"
import {
  type UiSurface,
  UiSurface as BaseUiSurface,
} from "@ui/elements"
import {
  CollectionInput,
  findCollectionInputSelection,
  measureCollectionInputHeight,
  normalizeCollectionInputVisibleRows,
  type CollectionInputItem,
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

const trigger = (hit: HitCall | undefined): void => {
  expect(hit).toBeDefined()
  hit![4]()
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
  })

  test("preserves regular and compact row typography and renders descriptions", () => {
    const regular = new RecordingSurface()
    CollectionInput(regular, 0, 0, 180, 108, props([]))
    const regularText = regular.texts.map(([text, , , options]) => ({text, fontPx: options.fontPx}))
    expect(regularText).toContainEqual({text: "Position", fontPx: 12})
    expect(regularText).toContainEqual({text: "Vector attribute", fontPx: 10})

    const compact = new RecordingSurface()
    CollectionInput(compact, 0, 0, 180, 72, props([], {density: "compact"}))
    const compactText = compact.texts.map(([text, , , options]) => ({text, fontPx: options.fontPx}))
    expect(compactText).toContainEqual({text: "Position", fontPx: 11})
    expect(compactText).toContainEqual({text: "Vector attribute", fontPx: 9})
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
      CollectionInput(surface, 0, 0, 180, 108, props(events, state))
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
    CollectionInput(standalone, 0, 0, 180, 108, props(standaloneEvents))
    trigger(standalone.hits[0])
    trigger(standalone.hits[2])
    trigger(standalone.hits[3])

    const definition = (events: string[]): CollectionFieldDefinition => ({
      id: "attributes",
      label: "Attributes",
      kind: "collection",
      items,
      selectedId: "rotation",
      onSelect: (id) => events.push(`select:${id}`),
      onAdd: () => events.push("add"),
      onRemove: (id) => events.push(`remove:${id}`),
    })

    const regular = new RecordingSurface()
    Field(regular, 0, 0, 180, definition(regularEvents))
    trigger(regular.hits[0])
    trigger(regular.hits[2])
    trigger(regular.hits[3])

    const compact = new RecordingSurface()
    Field(compact, 0, 0, 180, definition(compactEvents), {density: "compact"})
    trigger(compact.hits[0])
    trigger(compact.hits[2])
    trigger(compact.hits[3])

    expect(regularEvents).toEqual(standaloneEvents)
    expect(compactEvents).toEqual(standaloneEvents)
  })
})
