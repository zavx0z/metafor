/** @jsxImportSource @metafor/dsl */
/** One canonical work environment; its Agent owns the conversation and scenario lifecycle. */
export default MetaFor("Рабочее окружение", {
  desc: "Принимает задачу для одного специалиста и показывает подтверждённый результат.",
})
  .fields(field => ({
    task: field.string.optional({label: "Задача"}),
    answer: field.string.optional({label: "Ответ"}),
    status: field.string.required("idle", {label: "Работа"}),
    error: field.string.optional({label: "Ошибка"}),
    providerBinding: field.string.optional(),
    providerBootstrap: field.string.optional(),
  }))
  .superposition({ready: null})
  .mass(() => ({}))
  .energy()
  .processes()
  .reactions()
  .matter()
  .bulk()
  .agents(({atom, value, oracle, graph, force}) => (
    <agent
      id="assistant"
      atom={atom}
      task={value.task}
      answer={value.answer}
      status={value.status}
      error={value.error}
      providerBinding={value.providerBinding}
      providerBootstrap={value.providerBootstrap}
      tools={[
        oracle.tool("scenario.run", {scenario: "agent-system.integrity"}),
        oracle.tool("codespace.status", {}, {meta: "@metafor/codespace"}),
        oracle.tool("codespace.start", {}, {meta: "@metafor/codespace"}),
      ]}
    >
      <display id="world" source={graph} />
      <display id="activity" source={force} />
    </agent>
  ))
