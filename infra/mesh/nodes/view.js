/**
 * @typedef {Record<string, any>} Shared
 * @typedef {meta} Meta
 */
export const meta = MetaFor("view")
  .context((t) => ({
    finally: t.boolean.optional(false, { label: "Завершено" }),
    error: t.string.optional({ label: "Ошибка" }),
  }))
  .states({
    начало: {
      ошибка: { error: { null: false } },
      ожидание: {},
    },
    ожидание: {
      конец: {
        finally: true,
      },
    },
    ошибка: {
      ожидание: {},
      конец: {
        finally: true,
      },
    },
    конец: null,
  })
  .core({
    /** @type {Shared} */
    data: {},
  })
  .processes((process) => ({
    ошибка: process()
      .action(() => {
        return { error: null }
      })
      .success(({ data, update }) => update(data))
      .error(({ error, update }) => update({ error: error.message })),
  }))
  .reactions((reaction) => [
    [
      ["начало", "ожидание", "ошибка", "конец"],
      reaction()
        .filter(({ self }) => ({
          meta: self.meta,
          atom: "",
          path: "/state",
          op: "replace",
          value: "состояние",
        }))
        .equal(() => {}),
    ],
  ])
  .view()

export default meta
