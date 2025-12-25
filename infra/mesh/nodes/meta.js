/**
 * @typedef {import("@metafor/meta").NodeMeta} NodeMeta
 * @typedef {import("@metafor/meta").Meta} MetaType
 * @typedef {import("@metafor/atom").Atom} Atom
 */

export const meta = MetaFor("meta")
  .context((t) => ({
    id: t.string.optional({ label: "Актор-id" }),
    path: t.string.optional({ label: "Актор-путь" }),

    tag: t.string.optional({ label: "Мета-тег" }),
    src: t.string.optional({ label: "Мета-адрес" }),
    child: t.boolean.required(false, { label: "Наличие дочерних элементов" }),

    error: t.string.optional({ label: "Ошибка" }),
  }))
  .states({
    данные: {
      загрузка: { src: { null: false } },
      ошибка: { error: { null: false } },
    },
    загрузка: {
      родитель: { src: { null: false } },
    },
    родитель: {
      ошибка: { error: { null: false } },
      дети: { child: true },
      ожидание: {},
    },
    дети: {
      ошибка: { error: { null: false } },
      ожидание: {},
    },
    ожидание: {},
    ошибка: {},
    конец: null,
  })
  .core({
    /** @type {NodeMeta|null} */
    node: null,
    /** @type {MetaType|null} */
    meta: null,
  })
  .processes((process, destroy) => ({
    данные: process()
      .action(({ core }) => {
        if (!core.node) throw new Error("Нода не передана")
        if (!core.node.string?.src) throw new Error("Нет параметра src!")
        if (typeof core.node.tag !== "string") throw new Error("Реализовать обработку динамического тега")
        return { tag: core.node.tag, src: /** @type {string} */ (core.node.string.src), id: crypto.randomUUID() }
      })
      .success(({ data, update }) => update(data))
      .error(({ error, update }) => update({ error: error.message })),
    загрузка: process()
      .action(async ({ context, core }) => {
        const { meta } = await import(/**@type {string} */ (context.src))
        if (!meta) throw new Error(`Отсутствует мета по пути: ${context.src}`)
        core.meta = meta
        return meta?.render?.length
      })
      .success(({ data, update }) => update({ child: !!data }))
      .error(({ error, update }) => update({ error: error.message })),
    родитель: process()
      .action(async ({ core, self, context }) => {
        if (!core.meta) throw new Error("Отсутствует мета")
        const { Atom } = await import("@metafor/atom")
        // Atom.append(self.Atom, core.meta, { id: context.id })
      })
      .error(({ error, update }) => update({ error: error.message })),
    дети: process()
      .action(async ({ core, self }) => {
        if (!core.meta) throw new Error("Отсутствует мета")
        const [{ Atom }, { default: meta }] = await Promise.all([import("@metafor/atom"), import("nodes/nodes.js")])
        const child = core.meta.render
        Atom.append(self.atom, meta, { core: { child } })
      })
      .error(({ error, update }) => update({ error: error.message })),
    конец: destroy(),
  }))
  .reactions()
  .view()

/** @typedef {meta} Meta */
