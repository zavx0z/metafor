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
  .processes((process, destroy) => ({
    коммит: process({ label: "Коммит", desc: "Процесс коммита изменений" })
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
    завершено: destroy({ label: "Завершено", desc: "Очистка после завершения" }),
  }))
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
  .gravity(
    ({ value, state, html }) =>
      html`${state === "коммит" && html`<meta-for src="meta/status.js" fields=${{ message: "Коммит в процессе...", src: value.src }}></meta-for>`}
        ${state === "завершено" && html`<meta-for src="meta/success.js" fields=${{ message: "Готово!", patches: value.patches }}></meta-for>`}
        ${state === "ошибка" && html`<meta-for src="meta/error.js" fields=${{ error: "Ошибка коммита" }}></meta-for>`}`,
  )
  .bulk({
    view: ({ css }) => css``,
  })

export default meta
