import {describe, expect, test} from "bun:test"
import {
  blenderRgba8ToColor,
  blenderTheme,
  resolveNumericZoneColors,
  resolveOpaqueBlenderRgba8,
  resolveWidgetColors,
} from "./blender-theme.ts"
import {blenderTheme as publicTheme} from "./theme.ts"

function hex(color: readonly number[]): string {
  return `#${color.map((part) => part.toString(16).padStart(2, "0")).join("")}`
}

function expectDeepFrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) return
  expect(Object.isFrozen(value)).toBeTrue()
  for (const child of Object.values(value)) expectDeepFrozen(child)
}

describe("Blender 4.5.5 raw theme", () => {
  test("preserves class-specific RGBA bytes and source alpha", () => {
    const expected = {
      regular: ["#3d3d3dff", "#545454ff", "#4772b3ff", "#1d1d1d80", "#e6e6e6ff", "#ffffffff", 0.2],
      text: ["#3d3d3dff", "#1d1d1dff", "#181818ff", "#ffffff33", "#e6e6e6ff", "#ffffffff", 0.2],
      number: ["#3d3d3dff", "#545454ff", "#222222ff", "#4772b3ff", "#e6e6e6ff", "#ffffffff", 0.2],
      numberSlider: ["#3d3d3dff", "#545454ff", "#222222ff", "#4772b3ff", "#e6e6e6ff", "#ffffffff", 0.2],
      option: ["#3d3d3dff", "#545454ff", "#4772b3ff", "#ffffffff", "#e6e6e6ff", "#ffffffff", 0.2],
      toggle: ["#3d3d3dff", "#545454ff", "#4772b3ff", "#252525ff", "#e6e6e6ff", "#ffffffff", 0.2],
      tool: ["#3d3d3dff", "#545454ff", "#4772b3ff", "#ffffffff", "#e6e6e6ff", "#ffffffff", 0.2],
      toolbarItem: ["#3d3d3dff", "#282828ff", "#4772b3ff", "#ffffffb3", "#e6e6e6ff", "#ffffffff", 0.2],
      tab: ["#1d1d1dff", "#1d1d1dff", "#303030ff", "#1d1d1dff", "#989898ff", "#ffffffff", 0.2],
      menu: ["#3d3d3dff", "#282828ff", "#4772b3b3", "#d9d9d9ff", "#e6e6e6ff", "#ffffffff", 0.2],
      menuBack: ["#242424ff", "#181818ff", "#4772b3ff", "#d9d9d9ff", "#999999ff", "#ffffffff", 0.2],
      menuItem: ["#3d3d3d00", "#18181800", "#4772b3ff", "#ffffff8f", "#ddddddff", "#ffffffff", 0.2],
      box: ["#3d3d3dff", "#1d1d1d80", "#545454ff", "#191919ff", "#e6e6e6ff", "#ffffffff", 0.2],
      listItem: ["#2d2d2dff", "#ffffff00", "#4772b3ff", "#ffffff33", "#ccccccff", "#ffffffff", 0.2],
      scroll: ["#3d3d3dff", "#22222200", "#ffffffff", "#545454ff", "#e6e6e6ff", "#ffffffff", 0.5],
    } as const

    for (const [kind, values] of Object.entries(expected)) {
      const set = blenderTheme.widgets[kind as keyof typeof blenderTheme.widgets]
      expect([
        hex(set.outline),
        hex(set.inner),
        hex(set.innerSelected),
        hex(set.item),
        hex(set.text),
        hex(set.textSelected),
        set.roundness,
      ]).toEqual([...values])
    }
  })

  test("preserves material, status, axes, and Space Node namespaces", () => {
    expect({
      widgetEmboss: hex(blenderTheme.material.widgetEmboss),
      menuShadowFactor: blenderTheme.material.menuShadowFactor,
      menuShadowWidth: blenderTheme.material.menuShadowWidth,
      editorBorder: hex(blenderTheme.material.editorBorder),
      editorOutline: hex(blenderTheme.material.editorOutline),
      editorOutlineActive: hex(blenderTheme.material.editorOutlineActive),
      checkerPrimary: hex(blenderTheme.material.checkerPrimary),
      checkerSecondary: hex(blenderTheme.material.checkerSecondary),
      checkerSize: blenderTheme.material.checkerSize,
      panelRoundness: blenderTheme.material.panelRoundness,
      widgetTextCursor: hex(blenderTheme.material.widgetTextCursor),
    }).toEqual({
      widgetEmboss: "#00000026",
      menuShadowFactor: 0.4,
      menuShadowWidth: 2,
      editorBorder: "#161616ff",
      editorOutline: "#ffffff15",
      editorOutlineActive: "#ffffff2a",
      checkerPrimary: "#333333ff",
      checkerSecondary: "#262626ff",
      checkerSize: 8,
      panelRoundness: 0.4,
      widgetTextCursor: "#71a8ffff",
    })
    expect(Object.fromEntries(Object.entries(blenderTheme.state).map(([key, value]) => [key, hex(value)]))).toEqual({
      error: "#771111ff",
      warning: "#ac8737ff",
      info: "#28487dff",
      success: "#188625ff",
    })
    expect(Object.fromEntries(Object.entries(blenderTheme.axes).map(([key, value]) => [key, hex(value)]))).toEqual({
      x: "#ff3352ff",
      y: "#8bdc00ff",
      z: "#2890ffff",
    })
    expect({
      back: hex(blenderTheme.spaceNode.back),
      header: hex(blenderTheme.spaceNode.header),
      navigationBar: hex(blenderTheme.spaceNode.navigationBar),
      executionButtons: hex(blenderTheme.spaceNode.executionButtons),
      panelHeader: hex(blenderTheme.spaceNode.panel.header),
      panelBack: hex(blenderTheme.spaceNode.panel.back),
      panelSubBack: hex(blenderTheme.spaceNode.panel.subBack),
      tabActive: hex(blenderTheme.spaceNode.tab.active),
      tabInactive: hex(blenderTheme.spaceNode.tab.inactive),
      tabBack: hex(blenderTheme.spaceNode.tab.back),
      tabOutline: hex(blenderTheme.spaceNode.tab.outline),
      list: hex(blenderTheme.spaceNode.list),
    }).toEqual({
      back: "#1d1d1d00",
      header: "#1d1d1db3",
      navigationBar: "#1d1d1dff",
      executionButtons: "#303030ff",
      panelHeader: "#3d3d3dff",
      panelBack: "#3d3d3dff",
      panelSubBack: "#0000001f",
      tabActive: "#303030ff",
      tabInactive: "#1d1d1dff",
      tabBack: "#181818ff",
      tabOutline: "#3d3d3dff",
      list: "#303030ff",
    })
  })

  test("uses the exact generic alpha-factor truth table before state copy", () => {
    expect(resolveWidgetColors("regular", {searchNoMatch: true}).inner[3]).toBe(127)
    expect(resolveWidgetColors("regular", {disabled: true}).inner[3]).toBe(127)
    expect(resolveWidgetColors("regular", {inactive: true}).inner[3]).toBe(127)
    expect(resolveWidgetColors("regular", {disabled: true, searchNoMatch: true}).inner[3]).toBe(63)
    expect(resolveWidgetColors("regular", {selected: true, disabled: true}).inner).toEqual([
      0x47, 0x72, 0xb3, 127,
    ])
    expect(resolveWidgetColors("regular", {disabled: true})).toEqual({
      outline: [0x3d, 0x3d, 0x3d, 127],
      inner: [0x54, 0x54, 0x54, 127],
      item: [0x1d, 0x1d, 0x1d, 64],
      text: [0xe6, 0xe6, 0xe6, 127],
      roundness: 0.2,
    })
    expect(resolveWidgetColors("regular", {selected: true, disabled: true}).text[3]).toBe(127)
  })

  test("uses exact generic state precedence and HSL byte clamp", () => {
    const selectedHover = resolveWidgetColors("number", {selected: true, hovered: true})
    expect(selectedHover.inner).toEqual([0x22, 0x22, 0x22, 0xff])
    expect(resolveWidgetColors("number", {pressed: true, hovered: true})).toEqual(selectedHover)

    expect(resolveWidgetColors("regular", {hovered: true})).toEqual({
      outline: [70, 70, 70, 255],
      inner: [101, 101, 101, 255],
      item: [29, 29, 29, 128],
      text: [255, 255, 255, 255],
      roundness: 0.2,
    })

    const activeHover = resolveWidgetColors("regular", {activeDefault: true, hovered: true})
    expect(activeHover).toEqual({
      outline: [70, 70, 70, 255],
      inner: [98, 139, 202, 255],
      item: [29, 29, 29, 128],
      text: [255, 255, 255, 255],
      roundness: 0.2,
    })
    expect(resolveWidgetColors("regular", {listItem: true}).inner).toEqual([255, 255, 255, 0])
  })

  test("uses the mutually-exclusive menu-item source chain", () => {
    expect(resolveWidgetColors("menuItem", {hovered: true})).toEqual({
      outline: [61, 61, 61, 0],
      inner: [63, 63, 63, 255],
      item: [255, 255, 255, 143],
      text: [255, 255, 255, 255],
      roundness: 0.2,
    })
    expect(resolveWidgetColors("menuItem", {disabled: true})).toEqual({
      outline: [61, 61, 61, 0],
      inner: [24, 24, 24, 0],
      item: [255, 255, 255, 143],
      text: [221, 221, 221, 128],
      roundness: 0.2,
    })
    expect(resolveWidgetColors("menuItem", {disabled: true, hovered: true})).toEqual({
      outline: [61, 61, 61, 0],
      inner: [122, 122, 122, 64],
      item: [255, 255, 255, 143],
      text: [221, 221, 221, 128],
      roundness: 0.2,
    })
    expect(resolveWidgetColors("menuItem", {inactive: true}).text).toEqual([122, 122, 122, 255])
    expect(resolveWidgetColors("menuItem", {inactive: true, hovered: true})).toEqual({
      outline: [61, 61, 61, 0],
      inner: [63, 63, 63, 255],
      item: [255, 255, 255, 143],
      text: [159, 159, 159, 255],
      roundness: 0.2,
    })
    expect(resolveWidgetColors("menuItem", {activeDefault: true}).inner).toEqual([71, 114, 179, 255])
    expect(resolveWidgetColors("menuItem", {selectedDraw: true}).inner).toEqual([71, 114, 179, 255])
    expect(resolveWidgetColors("menuItem", {selectedPreview: true}).inner).toEqual([
      0x47, 0x72, 0xb3, 0xff,
    ])
    expect(resolveWidgetColors("menuItem", {selected: true}).inner).toEqual([24, 24, 24, 0])
  })

  test("returns numeric zones as a separate frozen secondary draw set", () => {
    expect(resolveNumericZoneColors("number", {hovered: true})).toBeNull()
    expect(resolveNumericZoneColors("number", {hovered: true, numericZone: "left", textInput: true})).toBeNull()
    expect(resolveNumericZoneColors("number", {numericZone: "left"})).toBeNull()
    expect(resolveNumericZoneColors("number", {hovered: true, numericZone: null})).toBeNull()
    expect(resolveNumericZoneColors("number", {hovered: true, numericZone: "left"})).toEqual({
      zone: "left",
      colors: {
        outline: [81, 81, 81, 255],
        inner: [121, 121, 121, 255],
        item: [255, 255, 255, 255],
        text: [255, 255, 255, 255],
        roundness: 0.2,
      },
    })
    expect(resolveNumericZoneColors("number", {hovered: true, numericZone: "left"}, "right")).toEqual({
      zone: "right",
      colors: {
        outline: [70, 70, 70, 255],
        inner: [101, 101, 101, 255],
        item: [255, 255, 255, 255],
        text: [255, 255, 255, 255],
        roundness: 0.2,
      },
    })
  })

  test("deep-freezes raw and resolved tuples while converting Engine colors separately", () => {
    const resolved = resolveWidgetColors("text")
    const state = {hovered: true, numericZone: "right" as const}
    const stateBefore = structuredClone(state)
    const numeric = resolveNumericZoneColors("numberSlider", state)
    expect(state).toEqual(stateBefore)
    expectDeepFrozen(blenderTheme)
    expectDeepFrozen(resolved)
    expectDeepFrozen(numeric)
    expect(publicTheme).toBe(blenderTheme)

    const color = blenderRgba8ToColor([0x47, 0x72, 0xb3, 0xb3])
    expect([color.r, color.g, color.b, color.a]).toEqual([
      0x47 / 255,
      0x72 / 255,
      0xb3 / 255,
      0xb3 / 255,
    ])
  })

  test("resolves an explicit opaque root composite while preserving raw source alpha", () => {
    const raw = blenderTheme.spaceNode.back
    const resolved = resolveOpaqueBlenderRgba8(raw, blenderTheme.spaceNode.navigationBar)
    expect(raw).toEqual([0x1d, 0x1d, 0x1d, 0x00])
    expect(resolved).toEqual([0x1d, 0x1d, 0x1d, 0xff])
    expect(Object.isFrozen(resolved)).toBeTrue()
  })
})
