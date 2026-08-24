import {describe, expect, test} from "bun:test"
import {definePlaygroundStories, definePlaygroundStoryModule, storyRoute, type PlaygroundStoryModule} from "./story.ts"

const module = definePlaygroundStoryModule({
  defaultArgs: {label: "Основная", disabled: false, variant: "contained"},
  controls: [
    {key: "label", label: "Подпись", group: "Основные", kind: "text"},
    {key: "disabled", label: "Недоступна", group: "Состояние", kind: "boolean"},
    {
      key: "variant",
      label: "Вариант",
      group: "Основные",
      kind: "select",
      options: [{value: "text", label: "Текстовая"}, {value: "contained", label: "Заполненная"}],
    },
  ],
  render() {},
  source(args) {
    return `Button(surface, x, y, w, h, {children: ${JSON.stringify(args.label)}, variant: ${JSON.stringify(args.variant)}})`
  },
})

function catalog(load: () => Promise<PlaygroundStoryModule>) {
  return definePlaygroundStories({
    groups: [{
      id: "basic",
      label: "Основные",
      components: [{
        id: "button",
        label: "Кнопка",
        apiName: "Button",
        tags: ["action", "действие"],
        sections: [{
          id: "basic",
          label: "Основное",
          variants: [{
            id: "contained",
            label: "Заполненная",
            title: "Заполненная кнопка",
            tags: ["primary"],
            load,
          }],
        }],
      }],
    }],
    fallback: {component: "button", section: "basic", variant: "contained"},
  })
}

describe("typed playground story registry", () => {
  test("flattens package metadata into deterministic pathname index", () => {
    let loads = 0
    const registry = catalog(async () => {
      loads += 1
      return module
    })
    expect(registry.fallback).toBe("button/basic/contained")
    expect(registry.declaration).toEqual({
      location: "pathname",
      routes: ["button/basic/contained"],
      fallback: "button/basic/contained",
    })
    expect(registry.routeTree.overviews).toEqual(["", "button", "button/basic"])
    expect(registry.routeTree.children("").map(({path}) => path)).toEqual(["button"])
    expect(registry.routeTree.children("button").map(({path}) => path)).toEqual(["button/basic"])
    expect(registry.routeTree.children("button/basic").map(({kind, path}) => [kind, path])).toEqual([
      ["leaf", "button/basic/contained"],
    ])
    expect(registry.index).toEqual([{
      route: "button/basic/contained",
      groupId: "basic",
      groupLabel: "Основные",
      componentId: "button",
      componentLabel: "Кнопка",
      apiName: "Button",
      sectionId: "basic",
      sectionLabel: "Основное",
      variantId: "contained",
      variantLabel: "Заполненная",
      title: "Заполненная кнопка",
      tags: ["action", "действие", "primary"],
      searchText: "основные кнопка button основное заполненная заполненная кнопка action действие primary",
    }])
    expect(registry.find("button/basic/contained")).toBe(registry.index[0])
    expect(registry.variants("button/basic/contained")).toEqual(registry.index)
    expect(registry.variants("missing")).toEqual([])
    expect(Object.isFrozen(registry)).toBeTrue()
    expect(Object.isFrozen(registry.routeTree)).toBeTrue()
    expect(Object.isFrozen(registry.index)).toBeTrue()
    expect(loads).toBe(0)
  })

  test("loads one story lazily and caches the exact promise", async () => {
    let loads = 0
    const registry = catalog(async () => {
      loads += 1
      return module
    })
    const first = registry.load("button/basic/contained")
    const second = registry.load("button/basic/contained")
    expect(second).toBe(first)
    expect(await first).toBe(module)
    expect(loads).toBe(1)
    expect(module.source({...module.defaultArgs, label: "Готово"})).toContain('"Готово"')
    expect(() => module.source({...module.defaultArgs, label: ""})).not.toThrow()
  })

  test("retries a failed lazy story instead of poisoning the index", async () => {
    let attempts = 0
    const registry = catalog(async () => {
      attempts += 1
      if (attempts === 1) throw new Error("temporary")
      return module
    })
    await expect(registry.load("button/basic/contained")).rejects.toThrow("temporary")
    expect(await registry.load("button/basic/contained")).toBe(module)
    expect(attempts).toBe(2)
  })

  test("rejects ambiguous hierarchy and invalid story modules", async () => {
    expect(() => storyRoute({component: "Button", section: "basic", variant: "contained"})).toThrow()
    expect(() => definePlaygroundStories({
      groups: [{id: "empty", label: "Пусто", components: []}],
      fallback: {component: "button", section: "basic", variant: "contained"},
    })).toThrow("has no components")
    expect(() => definePlaygroundStories({
      groups: [{
        id: "duplicate",
        label: "Дубликаты",
        components: [
          {id: "button", label: "Кнопка", apiName: "Button", sections: [{id: "basic", label: "Основное", variants: [{id: "one", label: "Один", title: "Один", load: async () => module}]}]},
          {id: "button", label: "Кнопка 2", apiName: "Button", sections: [{id: "basic", label: "Основное", variants: [{id: "two", label: "Два", title: "Два", load: async () => module}]}]},
        ],
      }],
      fallback: {component: "button", section: "basic", variant: "one"},
    })).toThrow("Duplicate playground story component")

    const invalid = catalog(async () => ({defaultArgs: {}, controls: [], render() {}} as unknown as PlaygroundStoryModule))
    await expect(invalid.load("button/basic/contained")).rejects.toThrow("source must be a function")
    await expect(invalid.load("missing")).rejects.toThrow("Unknown playground story route")
  })
})
