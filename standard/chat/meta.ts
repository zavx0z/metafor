import type {ChatActionResult} from "./types"

/** Chat owns transcript; its canonical Provider child owns catalog and every model turn. */
export default MetaFor("Беседа агента")
  .fields(field => ({
    request: field.string.optional(),
    ack: field.boolean.required(false),
    ackId: field.string.required(""),
    response: field.string.optional(),
    error: field.string.optional(),
    sessionId: field.string.optional(),
    binding: field.string.optional(),
    providerBootstrap: field.string.optional(),
    providerRegistryShared: field.boolean.required(false),
    providerRef: field.string.optional(),
    providerRequest: field.string.optional(),
    providerAck: field.boolean.required(false),
    providerAckId: field.string.required(""),
    providerResponse: field.string.optional(),
    providerError: field.string.optional(),
    providerSessionId: field.string.optional(),
    providerOutcome: field.string.optional(),
    providerBindingDescriptor: field.string.optional(),
    feedbackRequest: field.string.optional(),
    feedbackAck: field.boolean.required(false),
    feedbackAckId: field.string.required(""),
    feedbackResponse: field.string.optional(),
    feedbackError: field.string.optional(),
    feedbackLastRequest: field.string.optional(),
  }))
  .superposition({
    idle: {"recording-feedback": {feedbackRequest: {null: false}}, sending: {request: {null: false}, ack: {eq: false}, providerRef: {null: false}}},
    sending: {answered: {ack: {eq: true}, error: {null: true}}, failed: {ack: {eq: true}, error: {null: false}}, "waiting-provider": {}},
    "waiting-provider": {"recording-feedback": {feedbackRequest: {null: false}}, receiving: {providerAck: {eq: true}}},
    receiving: {answered: {ack: {eq: true}, error: {null: true}}, failed: {ack: {eq: true}, error: {null: false}}},
    answered: {"recording-feedback": {feedbackRequest: {null: false}}, sending: {request: {null: false}, ack: {eq: false}, providerRef: {null: false}}},
    failed: {"recording-feedback": {feedbackRequest: {null: false}}, sending: {request: {null: false}, ack: {eq: false}, providerRef: {null: false}}},
    "recording-feedback": {
      "waiting-provider": {ack: {eq: false}, providerRequest: {null: false}},
      answered: {ack: {eq: true}, error: {null: true}},
      failed: {ack: {eq: true}, error: {null: false}},
      idle: {},
    },
  })
  .mass(mass => ({session: mass.json(), providerRegistry: mass.json()}))
  .energy()
  .processes(process => [
    process("sending", {env: ["server"]})
      .action(async ({value, mass, signal}): Promise<ChatActionResult> => {
        const action = await import("./send.ts")
        return action.default({request: value.request, binding: value.binding, providerRef: value.providerRef, mass, signal})
      })
      .success(({update, data}) => update({ack: data.ack, ackId: data.ackId, response: data.response, error: data.error, sessionId: data.sessionId,
        providerRequest: data.providerRequest, providerAck: data.providerAck, providerAckId: data.providerAckId,
        providerResponse: data.providerResponse, providerError: data.providerError, providerSessionId: data.providerSessionId,
        providerOutcome: data.providerOutcome, providerBindingDescriptor: data.providerBindingDescriptor}))
      .error(({update, error}) => update({ack: true, response: null, error: error.message})),
    process("receiving", {env: ["server"]})
      .action(async ({value, mass, signal}): Promise<ChatActionResult> => {
        const action = await import("./send.ts")
        return action.receive({request: value.request, binding: value.binding, providerRef: value.providerRef, mass, signal,
          providerAck: value.providerAck, providerAckId: value.providerAckId, providerResponse: value.providerResponse,
          providerError: value.providerError, providerSessionId: value.providerSessionId,
          providerOutcome: value.providerOutcome,
          providerBindingDescriptor: value.providerBindingDescriptor})
      })
      .success(({update, data}) => update({ack: data.ack, ackId: data.ackId, response: data.response, error: data.error, sessionId: data.sessionId,
        providerRequest: data.providerRequest, providerAck: data.providerAck, providerAckId: data.providerAckId,
        providerResponse: data.providerResponse, providerError: data.providerError, providerSessionId: data.providerSessionId,
        providerOutcome: data.providerOutcome, providerBindingDescriptor: data.providerBindingDescriptor}))
      .error(({update, error}) => update({ack: true, response: null, error: error.message})),
    process("recording-feedback", {env: ["server"]})
      .action(async ({value, mass, signal}) => {
        const action = await import("./send.ts")
        return action.feedback({request: value.feedbackRequest, mass, signal})
      })
      .success(({update, data}) => update({
        feedbackRequest: data.feedbackRequest, feedbackAck: data.feedbackAck, feedbackAckId: data.feedbackAckId,
        feedbackResponse: data.feedbackResponse, feedbackError: data.feedbackError, feedbackLastRequest: data.feedbackLastRequest,
      }))
      .error(({update, error}) => update({feedbackRequest: null, feedbackAck: true, feedbackResponse: null, feedbackError: error.message})),
  ])
  .reactions()
  .matter(({value, mass, html}) => html`
    <meta-for
      src="@metafor/provider"
      fields=${{
        registryMode: value.providerRegistryShared ? "executor" : "owner", binding: value.binding, bootstrap: value.providerBootstrap,
        request: value.providerRequest, ack: value.providerAck, ackId: value.providerAckId,
        response: value.providerResponse, error: value.providerError, sessionId: value.providerSessionId,
        outcome: value.providerOutcome, bindingDescriptor: value.providerBindingDescriptor, providerRef: value.providerRef,
      }}
      mass=${{registry: mass.providerRegistry}}
    />
  `)
  .bulk()
