import { Fuzzy, Meta, Wimp, materializeFields } from "@dark/strong"

/**
 * Готовит небольшой materialized `Dark`-граф для тестов плоской DB-проекции.
 *
 * @returns Тестовый граф и ссылки на ключевые поля.
 */
export const createSharedDbFixture = () => {
  const rootMeta = new Meta({
    src: "meta/root",
    name: "root",
    fieldSchemas: {
      title: { type: "string", required: true, default: "", label: "Заголовок" },
      mode: { type: "enum<string>", required: true, values: ["idle", "ready"], default: "idle" },
      items: { type: "array<string>", required: true, default: [] },
    },
    superposition: {
      idle: {
        ready: {
          mode: "ready",
        },
      },
      ready: null,
    },
  })

  const root = new Wimp({ src: rootMeta.src, meta: rootMeta })
  root.fields = materializeFields(root, rootMeta.fields)
  const rootTitle = root.fields.title
  const rootMode = root.fields.mode
  const rootItems = root.fields.items
  rootTitle.value = "Root title"
  rootMode.value = "idle"
  rootItems.value = ["a", "b"]

  const gate = new Fuzzy({ parent: root })
  root.children.add(gate)

  const childMeta = new Meta({
    src: "meta/child",
    name: "child",
    fieldSchemas: {
      alias: { type: "string", required: true, default: "" },
      mode: { type: "enum<string>", required: true, values: ["idle", "ready"], default: "idle" },
      items: { type: "array<string>", required: true, default: [] },
    },
    superposition: {
      idle: {
        ready: {
          mode: "ready",
        },
      },
      ready: null,
    },
  })
  const child = new Wimp({ src: childMeta.src, meta: childMeta, parent: gate })
  gate.children.add(child)
  child.fields = materializeFields(child, childMeta.fields, [
    { key: "alias", value: "Root title", source: rootTitle },
    { key: "mode", value: "idle", source: rootMode },
    { key: "items", value: ["a", "b"], source: rootItems },
  ])
  const childAlias = child.fields.alias
  const childMode = child.fields.mode
  const childItems = child.fields.items
  childMode.source = rootMode
  childItems.source = rootItems

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
