import "@metafor/meta"

const meta = MetaFor("space")
  .brane((field) => ({}))
  .superposition({
    "создание слабой силы": {
      "запуск сил": {}
    },
    "запуск сил": {},
  })
  .mass({
    onStateChange: undefined,
  })
  .processes((proces) => ({
    "создание слабой силы": proces()
      .action(async () => {
        const { create } = await import("./proc/create")
        return create()
      })
      .success(({ data }) => {}),
  }))
  .reactions()
  .bulk()

export default meta
export type Meta = typeof meta
