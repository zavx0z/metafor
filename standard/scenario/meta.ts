/** A declared, read-only integrity scenario. Repeated completed requests reuse their Mass receipt. */
export default MetaFor("Сценарий", {desc: "Проверяет устройство работающей агентной системы через Oracle."})
  .fields(field => ({
    request: field.string.optional(),
    ack: field.boolean.required(false),
    ackId: field.string.required(""),
    response: field.string.optional(),
    error: field.string.optional(),
  }))
  .superposition({
    idle: {executing: {request: {null: false}, ack: {eq: false}}},
    executing: {
      completed: {ack: {eq: true}, error: {null: true}},
      failed: {ack: {eq: true}, error: {null: false}},
    },
    completed: {executing: {request: {null: false}, ack: {eq: false}}},
    failed: {executing: {request: {null: false}, ack: {eq: false}}},
  })
  .mass(mass => ({result: mass.json()}))
  .energy()
  .processes(process => [
    process("executing", {env: ["server"]})
      .action(async ({value, mass, environment, signal}) => {
        const action = await import("./run.ts")
        return action.default({request: value.request, mass, environment, signal})
      })
      .success(({data, update}) => update({
        ack: true,
        ackId: data.ackId,
        response: data.response,
        error: data.error,
      }))
      .error(({error, update}) => update({ack: true, response: null, error: error.message})),
  ])
  .reactions()
  .matter()
  .bulk()
