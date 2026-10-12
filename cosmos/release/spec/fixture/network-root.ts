/** Network-only Root declaration fixture; device composition is explicit and never selected by an OS branch in Quantum. */
export default MetaFor("Network peer")
  .fields(field => ({
    input: field.string.optional(),
    request: field.string.optional(),
    requestId: field.string.required(""),
    ack: field.boolean.required(false),
    ackId: field.string.required(""),
    status: field.string.required("stopped"),
    error: field.string.optional(),
  }))
  .lifecycle({started: {field: "input", value: "started"}, stopping: {field: "input", value: "stopping"}})
  .superposition({
    waiting: {starting: {input: {eq: "started"}}},
    starting: {"waiting-network": {}},
    "waiting-network": {failed: {error: {null: false}}, ready: {ack: {eq: true}}},
    ready: {starting: {input: {eq: "started"}}, stopping: {input: {eq: "stopping"}}},
    stopping: {"waiting-stop": {}},
    "waiting-stop": {failed: {error: {null: false}}, stopped: {ack: {eq: true}}},
    stopped: {starting: {input: {eq: "started"}}},
    failed: {starting: {input: {eq: "started"}}, stopping: {input: {eq: "stopping"}}},
  })
  .mass(() => ({}))
  .energy()
  .processes(process => [
    process("starting", {env: ["server"]}).action(async ({signal}) => {
      const action = await import("@cosmos/peer-lifecycle")
      return action.default({event: "started", signal})
    }).success(({update, data}) => update({request: data.request, requestId: data.requestId, ack: false, error: null, input: null})),
    process("stopping", {env: ["server"]}).action(async ({signal}) => {
      const action = await import("@cosmos/peer-lifecycle")
      return action.default({event: "stopping", signal})
    }).success(({update, data}) => update({request: data.request, requestId: data.requestId, ack: false, error: null, input: null})),
  ])
  .reactions()
  .matter(({value, html}) => html`
    <meta-for
      src="@internal/peer"
      fields=${{request: value.request, requestId: value.requestId, ack: value.ack, ackId: value.ackId, status: value.status, error: value.error}} />
  `)
  .bulk()
