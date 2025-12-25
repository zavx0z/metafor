/**
 * @typedef {import("@metafor/meta").NodeMeta} NodeMeta
 * @typedef {import("@metafor/meta").NodeType} NodeType
 * @typedef {import("@metafor/meta").NodeLogical} NodeLogical
 * @typedef {import("@metafor/atom").Atom} Atom
 */

export const meta = MetaFor("node")
  .context((t) => ({
    type: t.enum("log", "meta", "map", "cond", "text", "el").optional({ label: "Тип элемента" }),
    tag: t.string.optional(),

    id: t.string.optional({ label: "Id сборщика" }),
    error: t.string.optional({ label: "Ошибка" }),
  }))
  .states({
    идентификация: {
      мета: { type: "meta", tag: { startsWith: "meta-" } },
      логический: { type: "log" },
      конец: { type: null },
    },
    мета: {
      конец: { type: null },
    },
    логический: {
      конец: { type: null },
    },
    конец: null,
  })
  .core({
    /** @type {NodeType|null} */
    node: null,
    /** @type {Atom|null} */
    builder: null,
  })
  .processes((process, destroy) => ({
    идентификация: process()
      .action(({ core }) => {
        if (!core.node) throw new Error("Нода не передана")
        if (Object.hasOwn(core.node, "tag")) {
          const node = /** @type {NodeMeta } */ (core.node)
          if (typeof node.tag === "string") return { type: node.type, tag: node.tag }
          else return { type: node.type }
        } else return { type: core.node.type }
      })
      .success(({ update, data }) => update(data))
      .error(({ error, update }) => update({ error: error.message })),
    мета: process()
      .action(async ({ self, core }) => {
        const [{ Atom }, { meta }] = await Promise.all([import("@metafor/atom"), import("nodes/meta.js")])
        Atom.append(self.atom, meta, { core: { node: core.node } })
      })
      .error(({ error, update }) => update({ error: error.message })),
    логический: process()
      .action(async ({ core, self }) => {
        if (!core.node) throw new Error("Нет родительского актора")
        const [{ Atom }, { meta }] = await Promise.all([import("@metafor/atom"), import("nodes/logical.js")])
        Atom.append(self.atom, meta, { core: { node: core.node } })
      })
      .error(({ error, update }) => update({ error: error.message })),
    конец: destroy().before(() => {
      console.log("destroy Node")
    }),
  }))
  .reactions((reaction) => [
    [
      ["мета", "логический"],
      reaction()
        .filter(({ context }) => ({
          atom: /** @type {string} */ (context.id),
          path: "/state",
          op: "replace",
          value: "ожидание",
        }))
        .equal(({ update }) => update({ type: null, tag: null, id: null })),
    ],
  ])
  .view()
/** @typedef {meta} Meta */
export default meta
