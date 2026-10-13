import agents from "./agents/index.tsx"
/** Intel Mac environment observes the assigned Studio on birth; profile actions require explicit intent. */
export default MetaFor("Intel macOS Chrome Studio", {desc: "Рабочее окружение назначенной Chrome Studio с WebRTC-представлением."})
  .fields(field => ({
    input: field.string.optional(),
    task: field.string.optional(),
    answer: field.string.optional(),
    status: field.string.required("idle"),
    error: field.string.optional(),
    providerBinding: field.string.optional(),
    agentEnabled: field.boolean.required(false),
    prepareOnBirth: field.boolean.required(false),
    networkRequest: field.string.optional(),
    networkRequestId: field.string.required(""),
    networkAck: field.boolean.required(false),
    networkAckId: field.string.required(""),
    networkStatus: field.string.required("stopped"),
    networkError: field.string.optional(),
    oracleReady: field.boolean.required(false),
    oracleError: field.string.optional(),
    studioConfiguration: field.string.optional(),
    studioRequest: field.string.optional(),
    studioRequestId: field.string.required(""),
    studioAck: field.boolean.required(false),
    studioAckId: field.string.required(""),
    studioStatus: field.string.required("disconnected"),
    studioError: field.string.optional(),
    profileName: field.string.optional(),
    saveId: field.string.optional(),
    templatePath: field.string.optional(),
    workMode: field.string.required("view"),
    catalog: field.string.optional(),
    viewer: field.string.optional(),
    providerBootstrap: field.string.optional(),
    browserAgentEnabled: field.boolean.required(false),
    browserTask: field.string.optional(),
    browserAnswer: field.string.optional(),
    browserStatus: field.string.required("idle"),
    browserError: field.string.optional(),
    browserProviderBinding: field.string.optional(),
    localBrowserAgentEnabled: field.boolean.required(false),
  }))
  .lifecycle({started: {field: "input", value: "started"}, stopping: {field: "input", value: "stopping"}})
  .superposition({
    waiting: {configuring: {input: {eq: "started"}}, stopped: {input: {eq: "stopping"}}},
    configuring: {
      "failed-configuration": {input: {null: true}, studioError: {null: false}},
      "preparing-network": {input: {null: true}, studioError: {null: true}, prepareOnBirth: {eq: true}},
      "starting-network": {input: {null: true}, studioError: {null: true}, prepareOnBirth: {eq: false}},
    },
    "failed-configuration": {configuring: {input: {eq: "started"}}, stopped: {input: {eq: "stopping"}}},
    "preparing-network": {"waiting-preparation": {}},
    "waiting-preparation": {
      "starting-network": {input: {eq: "started"}},
      failed: {input: {null: true}, networkError: {null: false}},
      prepared: {input: {null: true}, networkAck: {eq: true}, networkStatus: {eq: "prepared"}}
    },
    prepared: {
      "starting-network": {input: {eq: "started"}},
      stopped: {input: {eq: "stopping"}}
    },
    "starting-network": {"waiting-network": {}},
    "waiting-network": {
      "starting-network": {input: {eq: "started"}},
      failed: {input: {null: true}, networkError: {null: false}},
      connecting: {input: {null: true}, networkAck: {eq: true}}
    },
    connecting: {"waiting-connection": {}},
    "waiting-connection": {
      "starting-network": {input: {eq: "started"}},
      failed: {input: {null: true}, studioError: {null: false}},
      "awaiting-oracle": {input: {null: true}, studioAck: {eq: true}}
    },
    "awaiting-oracle": {
      "starting-network": {input: {eq: "started"}},
      ready: {input: {null: true}, oracleReady: {eq: true}},
      disconnecting: {input: {eq: "stopping"}}
    },
    ready: {
      "starting-network": {input: {eq: "started"}},
      "awaiting-oracle": {input: {null: true}, oracleReady: {eq: false}},
      opening: {input: {eq: "open"}},
      closing: {input: {eq: "close"}},
      saving: {input: {eq: "save"}},
      disconnecting: {input: {eq: "stopping"}}
    },
    opening: {"waiting-profile": {}},
    closing: {"waiting-profile": {}},
    saving: {"waiting-profile": {}},
    "waiting-profile": {
      "starting-network": {input: {eq: "started"}},
      failed: {input: {null: true}, studioError: {null: false}},
      "awaiting-oracle": {input: {null: true}, studioAck: {eq: true}}
    },
    disconnecting: {"waiting-disconnection": {}},
    "waiting-disconnection": {
      "starting-network": {input: {eq: "started"}},
      failed: {input: {null: true}, studioError: {null: false}},
      "stopping-network": {input: {null: true}, studioAck: {eq: true}}
    },
    "stopping-network": {"waiting-network-stop": {}},
    "waiting-network-stop": {
      "starting-network": {input: {eq: "started"}},
      failed: {input: {null: true}, networkError: {null: false}},
      stopped: {input: {null: true}, networkAck: {eq: true}}
    },
    stopped: {
      "starting-network": {input: {eq: "started"}},
      
    },
    failed: {
      "starting-network": {input: {eq: "started"}},
      disconnecting: {input: {eq: "stopping"}}
    },
  })
  .mass(mass => ({configuration: mass.json(), imports: mass.json(), providerRegistry: mass.json()}))
  .energy()
  .processes(process => [
    process("configuring", {env: ["server"]})
      .action(async ({value, mass, signal}) => {
        const action = await import("./configuration.ts")
        return action.default({profileName: value.profileName, saveId: value.saveId, templatePath: value.templatePath, mass, signal})
      })
      .success(({update}) => update({input: null, studioError: null}))
      .error(({error, update}) => update({input: null, studioError: error.message})),
    process("preparing-network", {env: ["server"]})
      .action(async ({signal}) => {
        const action = await import("@cosmos/peer-lifecycle")
        return action.default({event: "started", signal})
      })
      .success(({data, update}) => update({networkRequest: "prepare", networkRequestId: data.requestId, networkAck: false, networkError: null, input: null})),
    process("starting-network", {env: ["server"]})
      .action(async ({signal}) => {
        const action = await import("@cosmos/peer-lifecycle")
        return action.default({event: "started", signal})
      })
      .success(({data, update}) => update({networkRequest: data.request, networkRequestId: data.requestId, networkAck: false, networkError: null, oracleReady: false, oracleError: null, input: null})),
    process("stopping-network", {env: ["server"]})
      .action(async ({signal}) => {
        const action = await import("@cosmos/peer-lifecycle")
        return action.default({event: "stopping", signal})
      })
      .success(({data, update}) => update({networkRequest: data.request, networkRequestId: data.requestId, networkAck: false, networkError: null, oracleReady: false, oracleError: null, input: null})),
    process("connecting", {env: ["server"]})
      .action(async ({signal}) => {
        const action = await import("@cosmos/peer-lifecycle")
        return action.default({event: "started", signal})
      })
      .success(({data, update}) => update({studioRequest: "observe", studioRequestId: data.requestId, studioAck: false, studioError: null, input: null})),
    process("opening", {env: ["server"]})
      .action(async ({signal}) => {
        const action = await import("@cosmos/peer-lifecycle")
        return action.default({event: "started", signal})
      })
      .success(({data, update}) => update({studioRequest: "open", studioRequestId: data.requestId, studioAck: false, studioError: null, input: null})),
    process("closing", {env: ["server"]})
      .action(async ({signal}) => {
        const action = await import("@cosmos/peer-lifecycle")
        return action.default({event: "started", signal})
      })
      .success(({data, update}) => update({studioRequest: "close", studioRequestId: data.requestId, studioAck: false, studioError: null, input: null})),
    process("saving", {env: ["server"]})
      .action(async ({signal}) => {
        const action = await import("@cosmos/peer-lifecycle")
        return action.default({event: "started", signal})
      })
      .success(({data, update}) => update({studioRequest: "save", studioRequestId: data.requestId, studioAck: false, studioError: null, input: null})),
    process("disconnecting", {env: ["server"]})
      .action(async ({signal}) => {
        const action = await import("@cosmos/peer-lifecycle")
        return action.default({event: "started", signal})
      })
      .success(({data, update}) => update({studioRequest: "disconnect", studioRequestId: data.requestId, studioAck: false, studioError: null, input: null})),
  ])
  .reactions()
  .matter(({value, mass, html}) => html`
    <meta-for src="@internal/peer" fields=${{
      request: value.networkRequest, requestId: value.networkRequestId,
      ack: value.networkAck, ackId: value.networkAckId, status: value.networkStatus, error: value.networkError,
      role: "leader", oracleReady: value.oracleReady, oracleError: value.oracleError,
    }} />
    <meta-for src="chrome-studio" fields=${{
      request: value.studioRequest, requestId: value.studioRequestId,
      ack: value.studioAck, ackId: value.studioAckId, status: value.studioStatus, error: value.studioError,
      configuration: value.studioConfiguration, profileName: value.profileName, saveId: value.saveId,
      templatePath: value.templatePath, workMode: value.workMode,
      catalog: value.catalog, viewer: value.viewer,
    }} />
    <meta-for src="@metafor/provider" fields=${{bootstrap: value.providerBootstrap}} mass=${{registry: mass.providerRegistry}} />
  `)
  .bulk()

  .agents(agents)
