import { Field, Fuzzy, Wimp } from "@dark/strong"

/**
 * Готовит небольшой materialized `Dark`-граф для тестов плоской DB-проекции.
 *
 * @returns Тестовый граф и ссылки на ключевые поля.
 */
export const createSharedDbFixture = () => {
  const root = new Wimp({ src: "meta/root" })
  root.name = "root"

  const rootTitle = new Field({
    key: "title",
    owner: root,
    schema: { type: "string", required: true, default: "", label: "Заголовок" },
    value: "Root title",
  })
  const rootMode = new Field({
    key: "mode",
    owner: root,
    schema: { type: "enum<string>", required: true, values: ["idle", "ready"], default: "idle" },
    value: "idle",
  })
  const rootItems = new Field({
    key: "items",
    owner: root,
    schema: { type: "array<string>", required: true, default: [] },
    value: ["a", "b"],
  })

  root.fields = {
    title: rootTitle,
    mode: rootMode,
    items: rootItems,
  }

  const gate = new Fuzzy({ parent: root })
  root.children.add(gate)

  const child = new Wimp({ src: "meta/child", parent: gate })
  child.name = "child"
  gate.children.add(child)

  const childAlias = new Field({
    key: "alias",
    owner: child,
    schema: { type: "string", required: true, default: "" },
    value: "Root title",
    source: rootTitle,
  })
  const childMode = new Field({
    key: "mode",
    owner: child,
    schema: { type: "enum<string>", required: true, values: ["idle", "ready"], default: "idle" },
    value: "idle",
    source: rootMode,
  })
  const childItems = new Field({
    key: "items",
    owner: child,
    schema: { type: "array<string>", required: true, default: [] },
    value: ["a", "b"],
    source: rootItems,
  })

  child.fields = {
    alias: childAlias,
    mode: childMode,
    items: childItems,
  }

  return {
    root,
    gate,
    child,
    fields: {
      rootTitle,
      rootMode,
      rootItems,
      childAlias,
      childMode,
      childItems,
    },
  }
}
