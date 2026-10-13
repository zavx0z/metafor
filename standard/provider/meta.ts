import type {ProviderEnergy} from "./runtime-types"

/** Provider owns catalog and native turns. Discovery is autonomous and never invokes a model. */
export default MetaFor("Провайдер окружения", {desc: "Регистрирует назначенные возможности окружения и исполняет явные запросы беседы."})
  .fields(field => ({
    binding: field.string.optional(),
    registryMode: field.string.required("owner"),
    bootstrap: field.string.optional(),
    bootstrapApplied: field.boolean.required(false),
    bootstrapError: field.string.optional(),
    request: field.string.optional(),
    ack: field.boolean.required(false),
    ackId: field.string.required(""),
    response: field.string.optional(),
    error: field.string.optional(),
    sessionId: field.string.optional(),
    outcome: field.string.optional(),
    bindingDescriptor: field.string.optional(),
    providerRef: field.string.optional(),
    discoveryRequest: field.string.optional('{"id":"bootstrap"}'),
    discoveryAck: field.boolean.required(false),
    discoveryAckId: field.string.required(""),
    discoveryResponse: field.string.optional(),
    discoveryError: field.string.optional(),
    discoveryStatus: field.string.required("unknown"),
    registryRevision: field.number.optional(),
  }))
  .superposition({
    idle: {
      bootstrapping: {bootstrap: {null: false}, bootstrapApplied: {eq: false}, bootstrapError: {null: true}},
      discovering: {discoveryRequest: {null: false}},
      turning: {request: {null: false}, ack: {eq: false}, discoveryAck: {eq: true}},
    },
    discovering: {
      ready: {discoveryAck: {eq: true}, discoveryError: {null: true}},
      discoveryFailed: {discoveryAck: {eq: true}, discoveryError: {null: false}},
    },
    ready: {
      bootstrapping: {bootstrap: {null: false}, bootstrapApplied: {eq: false}, bootstrapError: {null: true}},
      discovering: {discoveryRequest: {null: false}},
      turning: {request: {null: false}, ack: {eq: false}, discoveryAck: {eq: true}},
    },
    discoveryFailed: {
      bootstrapping: {bootstrap: {null: false}, bootstrapApplied: {eq: false}, bootstrapError: {null: true}},
      discovering: {discoveryRequest: {null: false}},
      turning: {request: {null: false}, ack: {eq: false}, discoveryAck: {eq: true}},
    },
    turning: {ready: {ack: {eq: true}}},
    bootstrapping: {
      discovering: {bootstrapApplied: {eq: true}, bootstrapError: {null: true}, discoveryRequest: {null: false}},
      ready: {bootstrapApplied: {eq: true}, bootstrapError: {null: true}, discoveryRequest: {null: true}},
      bootstrapFailed: {bootstrapError: {null: false}},
    },
    bootstrapFailed: {bootstrapping: {bootstrapApplied: {eq: false}, bootstrapError: {null: true}}, discovering: {discoveryRequest: {null: false}}},
  })
  .mass(mass => ({registry: mass.json(), turns: mass.json()}))
  .energy<ProviderEnergy>()
  .processes(process => [
    process("bootstrapping", {env: ["server"]})
      .action(async ({value, mass, signal, self}) => {
        const action = await import("./discover.ts")
        return action.bootstrap({bootstrap: value.bootstrap, registryMode: value.registryMode, mass, signal, self})
      })
      .success(({data, update}) => update({bootstrapApplied: data.bootstrapApplied, bootstrapError: data.bootstrapError,
        discoveryRequest: data.discoveryRequest, discoveryAck: data.discoveryAck, providerRef: data.providerRef}))
      .error(({error, update}) => update({bootstrapError: error.message, discoveryRequest: null})),
    process("discovering", {env: ["server"]})
      .action(async ({value, mass, environment, signal, self}) => {
        const action = await import("./discover.ts")
        return action.default({request: value.discoveryRequest, bootstrap: value.bootstrap, registryMode: value.registryMode, mass, environment, signal, self})
      })
      .success(({data, update}) => update({
        discoveryAck: data.discoveryAck,
        discoveryAckId: data.discoveryAckId,
        discoveryResponse: data.discoveryResponse,
        discoveryError: data.discoveryError,
        discoveryStatus: data.discoveryStatus,
        registryRevision: data.registryRevision,
        discoveryRequest: data.discoveryRequest,
        providerRef: data.providerRef,
      }))
      .error(({error, update}) => update({discoveryRequest: null, discoveryAck: true, discoveryResponse: null, discoveryError: error.message, discoveryStatus: "failed"})),
    process("turning", {env: ["server"]})
      .action(async ({value, mass, energy, signal, self}) => {
        const action = await import("./turn.ts")
        return action.default({request: value.request, binding: value.binding, mass, energy, signal, self})
      })
      .success(({data, update}) => update({
        ack: data.ack,
        ackId: data.ackId,
        response: data.response,
        error: data.error,
        sessionId: data.sessionId,
        outcome: data.outcome,
        bindingDescriptor: data.bindingDescriptor,
        providerRef: data.providerRef,
      }))
      .error(({error, update}) => update({ack: true, response: null, error: error.message, outcome: "uncertain"})),
  ])
  .reactions()
  .matter()
  .bulk()
