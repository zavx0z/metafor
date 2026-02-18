import "@metafor/meta"

const meta = MetaFor("git")
  .context((t) => ({
    src: t.string.required("./tmp/edit.json", { label: "JSON-patch путь" }),
    patches: t.array.required<string>([], { label: "разделенные патчи" }),
    isLoading: t.boolean.required(false, { label: "Флаг загрузки" }),
  }))
  .states({
    коммит: {
      завершено: { isLoading: false },
      ошибка: { isLoading: true },
    },
    завершено: null,
    ошибка: { коммит: {} },
  })
  .core({
    history: [] as string[],
    lastError: null as string | null,
  })
  .processes((process, destroy) => ({
    коммит: process({ label: "Коммит", desc: "Процесс коммита изменений" })
      .action(({ context }) => {
        console.log("Коммит:", context.src)
        return { success: true }
      })
      .success(({ update, data }) => {
        update({ src: "", patches: [], isLoading: false })
      })
      .error(({ update, error }) => {
        update({ isLoading: false })
        console.error("Ошибка коммита:", error.message)
      }),
    завершено: destroy({ label: "Завершено", desc: "Очистка после завершения" }),
  }))
  .reactions((reaction) => [
    [
      ["коммит"],
      reaction({ label: "Обработка сообщений", desc: "Реагирует на внешние события" })
        .filter(({ self, context }) => ({
          meta: "user",
          value: { gt: 0 },
        }))
        .equal(({ update, patch }) => {
          update({ isLoading: true })
          console.log("Получено сообщение:", patch.value)
        }),
    ],
  ])
  .view({
    render: ({ context, state, html }) =>
      html`${state === "коммит" && html`<meta-for src="meta/status.js" context=${{ message: "Коммит в процессе...", src: context.src }}></meta-for>`}
        ${state === "завершено" && html`<meta-for src="meta/success.js" context=${{ message: "Готово!", patches: context.patches }}></meta-for>`}
        ${state === "ошибка" && html`<meta-for src="meta/error.js" context=${{ error: "Ошибка коммита" }}></meta-for>`}`,
    style: ({ css }) => css``,
  })

export default meta
