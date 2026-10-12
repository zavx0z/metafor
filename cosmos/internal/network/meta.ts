/** Explicit network-only device composition; no OS selection and no Capsule declaration. */
export default MetaFor("Network")
  .fields(field => ({
    input: field.string.optional(), prepareOnBirth: field.boolean.required(false),
    request: field.string.optional(), requestId: field.string.required(""),
    ack: field.boolean.required(false), ackId: field.string.required(""),
    status: field.string.required("stopped"), error: field.string.optional(),
  }))
  .lifecycle({started: {field: "input", value: "started"}, stopping: {field: "input", value: "stopping"}})
  .superposition({
    waiting: {"preparing-network": {input: {eq: "started"}, prepareOnBirth: {eq: true}}, starting: {input: {eq: "started"}, prepareOnBirth: {eq: false}}, stopped: {input: {eq: "stopping"}}},
    "preparing-network": {"waiting-preparation": {}},
    "waiting-preparation": {"failed-preparation": {error: {null: false}}, prepared: {ack: {eq: true}, status: {eq: "prepared"}}},
    prepared: {stopped: {input: {eq: "stopping"}}},
    "failed-preparation": {"preparing-network": {input: {eq: "started"}}, stopped: {input: {eq: "stopping"}}},
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
    process("preparing-network", {env: ["server"]}).action(async ({signal}) => {
      const action = await import("@cosmos/peer-lifecycle")
      return action.default({event: "started", signal})
    }).success(({update, data}) => update({request: "prepare", requestId: data.requestId, ack: false, error: null, input: null})),
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
      fields=${{
        request: value.request, requestId: value.requestId, ack: value.ack, ackId: value.ackId, status: value.status, error: value.error,
      }}
    />
  `)
  .bulk()
