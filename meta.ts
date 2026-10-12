/** Initial preparation fills only network data; Capsule intent waits for the receiver's ordinary birth. */
export default MetaFor("Peer", {desc: "Независимые сеть и Capsule с явными фазами запуска, восстановления и остановки."})
  .fields(field => ({
    input: field.string.optional(),
    prepareOnBirth: field.boolean.required(false),
    networkRequest: field.string.optional(),
    networkRequestId: field.string.required(""),
    networkAck: field.boolean.required(false),
    networkAckId: field.string.required(""),
    networkStatus: field.string.required("stopped"),
    networkError: field.string.optional(),
    capsuleRequest: field.string.optional(),
    capsuleRequestId: field.string.required(""),
    capsuleAck: field.boolean.required(false),
    capsuleAckId: field.string.required(""),
    capsuleStatus: field.string.required("stopped"),
    capsuleError: field.string.optional(),
    capsuleConfiguration: field.string.optional(),
    profileName: field.string.required("metafor"),
    saveId: field.string.optional(),
    templatePath: field.string.required("browser-agent/03-desktop-audio-microphone.yaml"),
    instanceId: field.string.optional(),
    capsuleUrl: field.string.optional(),
  }))
  .lifecycle({started: {field: "input", value: "started"}, stopping: {field: "input", value: "stopping"}})
  .superposition({
    waiting: {"preparing-network": {input: {eq: "started"}, prepareOnBirth: {eq: true}}, "starting-network": {input: {eq: "started"}, prepareOnBirth: {eq: false}}, stopped: {input: {eq: "stopping"}}},
    "preparing-network": {"waiting-preparation": {}},
    "waiting-preparation": {"failed-preparation": {networkError: {null: false}}, prepared: {networkAck: {eq: true}, networkStatus: {eq: "prepared"}}},
    prepared: {stopped: {input: {eq: "stopping"}}},
    "failed-preparation": {"preparing-network": {input: {eq: "started"}}, stopped: {input: {eq: "stopping"}}},
    "starting-network": {"waiting-network": {}},
    "waiting-network": {"stopping-capsule": {input: {eq: "stopping"}}, "failed-network": {networkError: {null: false}}, "starting-capsule": {networkAck: {eq: true}}},
    "starting-capsule": {"waiting-capsule": {}},
    "waiting-capsule": {"stopping-capsule": {input: {eq: "stopping"}}, "failed-capsule": {capsuleError: {null: false}}, ready: {capsuleAck: {eq: true}}},
    ready: {
      "stopping-capsule": {input: {eq: "stopping"}},
      "recovering-network": {networkStatus: {eq: "failed"}},
      "recovering-capsule": {capsuleStatus: {eq: "failed"}},
      "starting-network": {input: {eq: "started"}},
    },
    "recovering-network": {"waiting-network-recovery": {}},
    "waiting-network-recovery": {"stopping-capsule": {input: {eq: "stopping"}}, "failed-network": {networkError: {null: false}}, "starting-capsule": {networkAck: {eq: true}, capsuleStatus: {eq: "stopped"}}, "recovering-capsule": {networkAck: {eq: true}, capsuleStatus: {eq: "failed"}}, ready: {networkAck: {eq: true}, capsuleStatus: {eq: "running"}}},
    "recovering-capsule": {"waiting-capsule-recovery": {}},
    "waiting-capsule-recovery": {"stopping-capsule": {input: {eq: "stopping"}}, "failed-capsule": {capsuleError: {null: false}}, ready: {capsuleAck: {eq: true}}},
    "stopping-capsule": {"waiting-capsule-stop": {}},
    "waiting-capsule-stop": {"failed-capsule": {capsuleError: {null: false}}, "stopping-network": {capsuleAck: {eq: true}}},
    "stopping-network": {"waiting-network-stop": {}},
    "waiting-network-stop": {"failed-network": {networkError: {null: false}}, stopped: {networkAck: {eq: true}}},
    stopped: {"starting-network": {input: {eq: "started"}}},
    "failed-network": {"recovering-network": {input: {eq: "started"}}, "stopping-capsule": {input: {eq: "stopping"}}},
    "failed-capsule": {"recovering-capsule": {input: {eq: "started"}}, "stopping-capsule": {input: {eq: "stopping"}}},
  })
  .mass(() => ({}))
  .energy()
  .processes(process => [
    process("preparing-network", {env: ["server"]})
      .action(async ({signal}) => {
        const request = await import("@cosmos/peer-lifecycle")
        return request.default({event: "started", signal})
      }).success(({data, update}) => update({networkRequest: "prepare", networkRequestId: data.requestId, networkAck: false, networkError: null, input: null})),
    process("starting-network", {env: ["server"]})
      .action(async ({signal}) => {
        const request = await import("@cosmos/peer-lifecycle")
        return request.default({event: "started", signal})
      }).success(({data, update}) => update({networkRequest: data.request, networkRequestId: data.requestId, networkAck: false, networkError: null, input: null})),
    process("recovering-network", {env: ["server"]})
      .action(async ({signal}) => {
        const request = await import("@cosmos/peer-lifecycle")
        return request.default({event: "started", signal})
      }).success(({data, update}) => update({networkRequest: data.request, networkRequestId: data.requestId, networkAck: false, networkError: null, input: null})),
    process("starting-capsule", {env: ["server"]})
      .action(async ({signal}) => {
        const request = await import("@cosmos/peer-lifecycle")
        return request.default({event: "started", signal})
      }).success(({data, update}) => update({capsuleRequest: data.request, capsuleRequestId: data.requestId, capsuleAck: false, capsuleError: null})),
    process("recovering-capsule", {env: ["server"]})
      .action(async ({signal}) => {
        const request = await import("@cosmos/peer-lifecycle")
        return request.default({event: "started", signal})
      }).success(({data, update}) => update({capsuleRequest: data.request, capsuleRequestId: data.requestId, capsuleAck: false, capsuleError: null, input: null})),
    process("stopping-capsule", {env: ["server"]})
      .action(async ({signal}) => {
        const request = await import("@cosmos/peer-lifecycle")
        return request.default({event: "stopping", signal})
      }).success(({data, update}) => update({capsuleRequest: data.request, capsuleRequestId: data.requestId, capsuleAck: false, capsuleError: null, input: null})),
    process("stopping-network", {env: ["server"]})
      .action(async ({signal}) => {
        const request = await import("@cosmos/peer-lifecycle")
        return request.default({event: "stopping", signal})
      }).success(({data, update}) => update({networkRequest: data.request, networkRequestId: data.requestId, networkAck: false, networkError: null})),
  ])
  .reactions()
  .matter(({value, html}) => html`
    <meta-for
      src="@internal/peer"
      fields=${{
        request: value.networkRequest, requestId: value.networkRequestId,
        ack: value.networkAck, ackId: value.networkAckId, status: value.networkStatus, error: value.networkError,
      }} />
    <meta-for
      src="capsule"
      fields=${{
        request: value.capsuleRequest, requestId: value.capsuleRequestId,
        ack: value.capsuleAck, ackId: value.capsuleAckId, status: value.capsuleStatus, error: value.capsuleError,
        configuration: value.capsuleConfiguration, profileName: value.profileName, saveId: value.saveId, templatePath: value.templatePath, instanceId: value.instanceId, capsuleUrl: value.capsuleUrl,
      }} />
  `)
  .bulk()
