import agents from "./agents/index.tsx"
/** A fresh root composition. Existing Boundary roots are never renamed by selecting this package. */
export default MetaFor("Workspace Capsule", {desc: "Сетевое рабочее окружение Capsule с отдельным реестром провайдеров."})
  .fields(field => ({
    input: field.string.optional(),
    task: field.string.optional(),
    answer: field.string.optional(),
    status: field.string.required("idle"),
    error: field.string.optional(),
    providerBinding: field.string.optional(),
    agentEnabled: field.boolean.required(false),
    prepareOnBirth: field.boolean.required(false),
    openOnBirth: field.boolean.required(false),
    networkRequest: field.string.optional(),
    networkRequestId: field.string.required(""),
    networkAck: field.boolean.required(false),
    networkAckId: field.string.required(""),
    networkStatus: field.string.required("stopped"),
    networkError: field.string.optional(),
    oracleReady: field.boolean.required(false),
    oracleError: field.string.optional(),
    capsuleRequest: field.string.optional(),
    capsuleRequestId: field.string.required(""),
    capsuleAck: field.boolean.required(false),
    capsuleAckId: field.string.required(""),
    capsuleStatus: field.string.required("stopped"),
    capsuleError: field.string.optional(),
    capsuleConfiguration: field.string.optional(),
    profileName: field.string.optional(),
    saveId: field.string.optional(),
    templatePath: field.string.optional(),
    instanceId: field.string.optional(),
    capsuleUrl: field.string.optional(),
    /** Declared browser-owner capabilities; native URLs, keys and checked state are excluded. */
    providerCapabilities: field.string.optional(),
    providerBootstrap: field.string.optional(),
    reconfigureTemplatePath: field.string.optional(),
  }))
  .lifecycle({started: {field: "input", value: "started"}, stopping: {field: "input", value: "stopping"}})
  .superposition({
    waiting: {configuring: {input: {eq: "started"}}, stopped: {input: {eq: "stopping"}}},
    configuring: {
      "failed-configuration": {input: {null: true}, capsuleError: {null: false}},
      "preparing-network": {input: {null: true}, capsuleError: {null: true}, prepareOnBirth: {eq: true}},
      "starting-network": {input: {null: true}, capsuleError: {null: true}, prepareOnBirth: {eq: false}},
    },
    "failed-configuration": {configuring: {input: {eq: "started"}}, stopped: {input: {eq: "stopping"}}},
    "preparing-network": {"waiting-preparation": {}},
    "waiting-preparation": {
      "starting-network": {input: {eq: "started"}},
      "failed-preparation": {input: {null: true}, networkError: {null: false}},
      prepared: {input: {null: true}, networkAck: {eq: true}, networkStatus: {eq: "prepared"}}
    },
    prepared: {
      "starting-network": {input: {eq: "started"}},
      stopped: {input: {eq: "stopping"}}
    },
    "failed-preparation": {
      "starting-network": {input: {eq: "started"}},
      stopped: {input: {eq: "stopping"}}
    },
    "starting-network": {"waiting-network": {}},
    "waiting-network": {
      "starting-network": {input: {eq: "started"}},
      "stopping-capsule": {input: {eq: "stopping"}},
      "failed-network": {input: {null: true}, networkError: {null: false}},
      "starting-capsule": {input: {null: true}, networkAck: {eq: true}, openOnBirth: {eq: true}, profileName: {null: false}},
      "deferring-profile": {input: {null: true}, networkAck: {eq: true}, openOnBirth: {eq: false}},
      "awaiting-oracle": {input: {null: true}, networkAck: {eq: true}, openOnBirth: {eq: true}, profileName: {null: true}}
    },
    "deferring-profile": {
      "starting-network": {input: {eq: "started"}},
      "stopping-capsule": {input: {eq: "stopping"}},
      "awaiting-oracle": {input: {null: true}}
    },
    "starting-capsule": {"waiting-capsule": {}},
    "waiting-capsule": {
      "starting-network": {input: {eq: "started"}},
      "stopping-capsule": {input: {eq: "stopping"}},
      "failed-capsule": {input: {null: true}, capsuleError: {null: false}},
      "awaiting-oracle": {input: {null: true}, capsuleAck: {eq: true}}
    },
    "awaiting-oracle": {
      "starting-network": {input: {eq: "started"}},
      ready: {input: {null: true}, oracleReady: {eq: true}},
      "stopping-capsule": {input: {eq: "stopping"}}
    },
    ready: {
      "starting-network": {input: {eq: "started"}},
      "awaiting-oracle": {input: {null: true}, oracleReady: {eq: false}},
      opening: {input: {eq: "open"}},
      saving: {input: {eq: "save"}, capsuleStatus: {eq: "running"}},
      reconfiguring: {input: {startsWith: "profile.reconfigure:"}, capsuleStatus: {eq: "running"}},
      "stopping-capsule": {input: {eq: "stopping"}}
    },
    opening: {"waiting-capsule": {}},
    saving: {"waiting-save": {}},
    "waiting-save": {
      "starting-network": {input: {eq: "started"}},
      "stopping-capsule": {input: {eq: "stopping"}},
      "failed-capsule": {input: {null: true}, capsuleError: {null: false}, capsuleStatus: {eq: "failed"}},
      "save-refused": {input: {null: true}, capsuleAck: {eq: true}, capsuleStatus: {eq: "running"}, capsuleError: {null: false}},
      "awaiting-oracle": {input: {null: true}, capsuleAck: {eq: true}, capsuleStatus: {eq: "saved"}, capsuleError: {null: true}}
    },
    "save-refused": {
      "starting-network": {input: {eq: "started"}},
      "stopping-capsule": {input: {eq: "stopping"}},
      "awaiting-oracle": {input: {null: true}}
    },
    "stopping-capsule": {"waiting-capsule-stop": {}},
    "waiting-capsule-stop": {
      "starting-network": {input: {eq: "started"}},
      "failed-capsule": {input: {null: true}, capsuleError: {null: false}},
      "stopping-network": {input: {null: true}, capsuleAck: {eq: true}}
    },
    "stopping-network": {"waiting-network-stop": {}},
    "waiting-network-stop": {
      "starting-network": {input: {eq: "started"}},
      "failed-network": {input: {null: true}, networkError: {null: false}},
      stopped: {input: {null: true}, networkAck: {eq: true}}
    },
    stopped: {
      "starting-network": {input: {eq: "started"}},
      
    },
    "failed-network": {
      "starting-network": {input: {eq: "started"}},
      "stopping-capsule": {input: {eq: "stopping"}}
    },
    "failed-capsule": {
      "starting-network": {input: {eq: "started"}},
      "stopping-capsule": {input: {eq: "stopping"}}
    },
    reconfiguring: {"waiting-reconfiguration": {}},
    "waiting-reconfiguration": {
      "starting-network": {input: {eq: "started"}},
      "stopping-capsule": {input: {eq: "stopping"}},
      "failed-capsule": {input: {null: true}, capsuleError: {null: false}},
      "awaiting-oracle": {input: {null: true}, capsuleAck: {eq: true}, capsuleStatus: {eq: "running"}}
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
      .success(({update}) => update({input: null, capsuleError: null}))
      .error(({error, update}) => update({capsuleError: error.message, input: null})),
    process("preparing-network", {env: ["server"]})
      .action(async ({signal}) => {
        const action = await import("@cosmos/peer-lifecycle")
        return action.default({event: "started", signal})
      })
      .success(({data, update}) => update({networkRequest: "prepare", networkRequestId: data.requestId, networkAck: false, networkError: null})),
    process("starting-network", {env: ["server"]})
      .action(async ({signal}) => {
        const action = await import("@cosmos/peer-lifecycle")
        return action.default({event: "started", signal})
      })
      .success(({data, update}) => update({networkRequest: data.request, networkRequestId: data.requestId, networkAck: false, networkError: null, oracleReady: false, oracleError: null, input: null})),
    process("starting-capsule", {env: ["server"]})
      .action(async ({signal}) => {
        const action = await import("@cosmos/peer-lifecycle")
        return action.default({event: "started", signal})
      })
      .success(({data, update}) => update({capsuleRequest: data.request, capsuleRequestId: data.requestId, capsuleAck: false, capsuleError: null, input: null})),
    process("opening", {env: ["server"]})
      .action(async ({signal}) => {
        const action = await import("@cosmos/peer-lifecycle")
        return action.default({event: "started", signal})
      })
      .success(({data, update}) => update({capsuleRequest: data.request, capsuleRequestId: data.requestId, capsuleAck: false, capsuleError: null, input: null})),
    process("saving", {env: ["server"]})
      .action(async ({signal}) => {
        const action = await import("@cosmos/peer-lifecycle")
        return action.default({event: "started", signal})
      })
      .success(({data, update}) => update({capsuleRequest: "save", capsuleRequestId: data.requestId, capsuleAck: false, capsuleError: null, input: null})),
    process("stopping-capsule", {env: ["server"]})
      .action(async ({signal}) => {
        const action = await import("@cosmos/peer-lifecycle")
        return action.default({event: "stopping", signal})
      })
      .success(({data, update}) => update({capsuleRequest: data.request, capsuleRequestId: data.requestId, capsuleAck: false, capsuleError: null, input: null})),
    process("stopping-network", {env: ["server"]})
      .action(async ({signal}) => {
        const action = await import("@cosmos/peer-lifecycle")
        return action.default({event: "stopping", signal})
      })
      .success(({data, update}) => update({networkRequest: data.request, networkRequestId: data.requestId, networkAck: false, networkError: null})),
    process("reconfiguring", {env: ["server"]})
      .action(async ({value}) => {
        const {parseProfileReconfigurationInput} = await import("@metafor/types/metafor/profile-intent")
        return parseProfileReconfigurationInput(value.input)
      })
      .success(({data, update}) => update({capsuleRequest: "reconfigure", capsuleRequestId: data.requestId, reconfigureTemplatePath: data.templatePath, capsuleAck: false, capsuleError: null, input: null}))
      .error(({error, update}) => update({capsuleError: error.message, input: null})),
  ])
  .reactions()
  .matter(({value, mass, html}) => html`
    <meta-for src="@internal/peer" fields=${{
      request: value.networkRequest, requestId: value.networkRequestId,
      ack: value.networkAck, ackId: value.networkAckId, status: value.networkStatus, error: value.networkError,
      role: "follower", oracleReady: value.oracleReady, oracleError: value.oracleError,
    }} />
    <meta-for src="capsule" fields=${{
      request: value.capsuleRequest, requestId: value.capsuleRequestId,
      ack: value.capsuleAck, ackId: value.capsuleAckId, status: value.capsuleStatus, error: value.capsuleError,
      providerCapabilities: value.providerCapabilities,
      configuration: value.capsuleConfiguration, profileName: value.profileName, saveId: value.saveId, templatePath: value.templatePath,
      instanceId: value.instanceId, capsuleUrl: value.capsuleUrl, reconfigureTemplatePath: value.reconfigureTemplatePath,
    }} />
    <meta-for src="@metafor/provider" fields=${{bootstrap: value.providerBootstrap}} mass=${{registry: mass.providerRegistry}} />
  `)
  .bulk()

  .agents(agents)
