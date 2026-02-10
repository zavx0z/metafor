import "@metafor/meta"

const meta = MetaFor("json-patch-manager")
  .context((t) => ({
    src: t.string.required("./tmp/edit.json", { label: "JSON-patch путь" }),
    patches: t.array.required<number>([], { label: "разделенные патчи" }),
  }))
  .states({
    "патчи разделены": {
      завершено: { patches: { isEmpty: true } },
    },
    завершено: null,
  })
  .core()
  .processes((process, destroy) => ({
    "патчи разделены": process()
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
