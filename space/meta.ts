import "@metafor/meta"

const meta = MetaFor("space")
  .brane((field) => ({}))
  .superposition({
    "загрузка слабой силы": {
      завершено: {},
      ошибка: {},
    },
    завершено: null,
    ошибка: null,
  })
  .mass({
    onStateChange: undefined,
  })
  .processes((process) => ({
    "загрузка слабой силы": process({ label: "Загрузка и исполнение", env: ["any"] }).action(async () => {
      const mod = await import("./proc/create.ts")
      mod.default()
    }),
  }))
  .reactions()
  .bulk()

export default meta
