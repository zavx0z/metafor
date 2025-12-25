/**
 * @typedef {import("@metafor/meta").NodeMeta} NodeMeta
 * @typedef {import("@metafor/meta").NodeType} NodeType
 * @typedef {import("@metafor/meta").NodeLogical} NodeLogical
 * @typedef {import("@metafor/meta").Meta} MetaSchema
 * @typedef {import("@metafor/atom").Atom} Atom
 */

export const meta = MetaFor("nodes")
  .context((t) => ({
    children: t.number.required(0, { label: "Кол-во детей" }),
    current: t.number.required(0, { label: "Индекс текущего ребенка" }),

    process: t.array.required(/** @type {string[]} */ ([]), { label: "создаются" }),
    success: t.array.required(/** @type {string[]} */ ([]), { label: "успешно завершены" }),
    rejected: t.array.required(/** @type {string[]} */ ([]), { label: "завершились с ошибкой" }),

    error: t.string.optional({ label: "Ошибка" }),
  }))
  .states({
    данные: {
      ошибка: { error: { null: false } },
      сборка: { children: { gt: 0 } },
    },
    сборка: {
      ошибка: { error: { null: false } },
      следующий: {},
    },
    следующий: {
      ошибка: { error: { null: false } },
      сборка: { current: { gte: 0 } },
      ожидание: { current: { lt: 0 } },
    },
    ожидание: {
      конец: { process: { length: 0 } },
    },
    ошибка: {
      // "данные": {},
    },
    конец: null,
  })
  .core({
    /** @type {NodeType[]} */
    child: [],
  })
  .processes((process, destroy) => ({
    данные: process()
      .action(({ core }) => core.child.length)
      .success(({ data, update }) => update({ children: data, current: 0 }))
      .error(({ error, update }) => update({ error: error.message })),
    сборка: process()
      .action(async ({ self, context, core }) => {
        const [{ Atom }, { default: meta }] = await Promise.all([import("@metafor/atom"), import("nodes/node.js")])
        const node = core.child[context.current]
        const id = Atom.append(self.atom, meta, { core: { node } })
        return [...context.process, id]
      })
      .success(({ data, update }) => update({ process: data }))
      .error(({ error, update }) => update({ error: error.message })),
    следующий: process()
      .action(({ context: { current, children } }) => {
        const last = current + 1
        return last === children ? -1 : last
      })
      .success(({ data, update }) => update({ current: data }))
      .error(({ error, update }) => update({ error: error.message })),
    конец: destroy().before(() => {
      console.log("destroy Nodes")
    }),
  }))
  .reactions((reaction) => [
    [
      ["ожидание", "сборка", "следующий"],
      reaction()
        .filter(({ context }) => ({
          atom: { in: context.process },
          op: "remove",
        }))
        .equal(({ update, atom, context }) => {
          if (context.success.length + 1 === context.process.length) update({ process: [] })
          else update({ success: [...context.success, atom] })
        }),
    ],
    [
      ["ожидание", "сборка", "следующий"],
      reaction()
        .filter(({ context }) => ({
          atom: { in: context.process },
          path: "/context",
          op: "replace",
          value: { includeKey: "error" },
        }))
        .equal(({ update, atom, context }) => {
          if (context.rejected.length + 1 + context.success.length === context.process.length)
            update({ error: "Ожидание завершено с ошибкой" })
          update({ rejected: [...context.rejected, atom] })
        }),
    ],
  ])
  .view()

/** @typedef {meta} Meta */
export default meta
