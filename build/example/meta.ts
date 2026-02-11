import "@metafor/meta"

const meta = MetaFor("git")
  .context((t) => ({
    src: t.string.required("./tmp/edit.json", { label: "JSON-patch путь" }),
    patches: t.array.required<number>([], { label: "разделенные патчи" }),
  }))
  .states({
    коммит: {
      завершено: {},
    },
    завершено: null,
  })
  .core()
  .processes((process, destroy) => ({
    коммит: process()
      .action(({ context }) => {
        // console.log(context.src)
        return {} // FIXME: если не возвращать объект, то не вызывается success
      })
      .success(({ update }) => {
        update({ src: "", patches: [] })
      }),
    завершено: destroy(),
  }))
  .reactions()
  .view()

export default meta
