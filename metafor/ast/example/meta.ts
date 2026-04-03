import { MetaFor } from "@metafor/dsl"

const meta = MetaFor("git")
  .fields((field) => ({
    src: field.string.required("./tmp/edit.json", { label: "JSON-patch путь" }),
    patches: field.array.required<string>([], { label: "разделенные патчи" }),
    isLoading: field.boolean.required(false, { label: "Флаг загрузки" }),
  }))
  .superposition({
    коммит: {
      завершено: { isLoading: false },
      ошибка: { isLoading: true },
    },
    завершено: null,
    ошибка: { коммит: {} },
  })
  .mass({
    history: [] as string[],
    lastError: null as string | null,
  })
  .processes((process, destroy) => [
    process("коммит", { label: "Коммит", desc: "Процесс коммита изменений" })
      .action(async ({ field, value, mass, self }) => {
        const mod = await import("./actions/commit.ts")
        return mod.default({ field, value, mass, self })
      })
      .success(({ update, data }) => {
        update({ src: "", patches: [], isLoading: false })
      })
      .error(({ update, error }) => {
        update({ isLoading: false })
        console.error("Ошибка коммита:", error.message)
      }),
    destroy("завершено", { label: "Завершено", desc: "Очистка после завершения" }),
  ])
  .reactions((reaction) => [
    [
      ["коммит"],
      reaction({ label: "Обработка сообщений", desc: "Реагирует на внешние события" })
        .filter(({ self, value }) => ({
          meta: "user",
          value: { gt: 0 },
        }))
        .equal(({ update, patch }) => {
          update({ isLoading: true })
          console.log("Получено сообщение:", patch.value)
        }),
    ],
  ])
  .matter(
    ({ value, state, html }) =>
      html`${state === "коммит" && html`<meta-for src="demo/status" fields=${{ message: "Коммит в процессе...", src: value.src }} />`}
        ${state === "завершено" && html`<meta-for src="demo/success" fields=${{ message: "Готово!", patches: value.patches }} />`}
        ${state === "ошибка" && html`<meta-for src="demo/error" fields=${{ message: "Ошибка коммита" }} />`}`,
  )
  .bulk({
    view: ({ css }) => css``,
  })

export default meta
