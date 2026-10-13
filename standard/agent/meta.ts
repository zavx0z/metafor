import type {AgentResult} from "./actions.ts"

/** Canonical Agent choreography; Chat and Scenario remain ordinary child Atoms. */
export default MetaFor("Агент")
  .fields(field => ({
    task: field.string.optional(),
    answer: field.string.optional(),
    status: field.string.required("idle"),
    error: field.string.optional(),
    configuration: field.string.required("{}"),
    providerBinding: field.string.optional(),
    providerBootstrap: field.string.optional(),
    providerRegistryShared: field.boolean.required(false),
    activeTaskId: field.string.optional(),
    chatRequest: field.string.optional(),
    chatAck: field.boolean.required(false),
    chatAckId: field.string.required(""),
    chatResponse: field.string.optional(),
    chatError: field.string.optional(),
    chatSessionId: field.string.optional(),
    toolRequest: field.string.optional(),
    toolAck: field.boolean.required(false),
    toolAckId: field.string.required(""),
    toolResponse: field.string.optional(),
    toolError: field.string.optional(),
    codespaceRequest: field.string.optional(),
    codespaceAck: field.boolean.required(false),
    codespaceAckId: field.string.required(""),
    codespaceResponse: field.string.optional(),
    codespaceError: field.string.optional(),
    replRequest: field.string.optional(),
    replAck: field.boolean.required(false),
    replAckId: field.string.required(""),
    replResponse: field.string.optional(),
    replError: field.string.optional(),
    feedbackRequest: field.string.optional(),
    feedbackAck: field.boolean.required(false),
    feedbackAckId: field.string.required(""),
    feedbackResponse: field.string.optional(),
    feedbackError: field.string.optional(),
    feedbackLastRequest: field.string.optional(),
  }))
  .superposition({
    idle: {planning: {task: {null: false}}},
    planning: {
      failed: {error: {null: false}},
      done: {status: {eq: "completed"}},
      "waiting-development-model": {status: {eq: "development-model"}},
      "waiting-development-tool": {status: {eq: "development-tool"}},
      "waiting-codespace": {codespaceRequest: {null: false}},
      "waiting-conversation": {status: {eq: "running"}},
      "waiting-plan": {},
    },
    "waiting-codespace": {failed: {codespaceError: {null: false}}, "completing-codespace": {codespaceAck: {eq: true}}},
    "completing-codespace": {failed: {error: {null: false}}, done: {}},
    "waiting-conversation": {
      failed: {chatError: {null: false}},
      replying: {chatAck: {eq: true}},
    },
    replying: {failed: {error: {null: false}}, done: {}},
    "waiting-plan": {
      failed: {chatError: {null: false}},
      deciding: {chatAck: {eq: true}},
    },
    deciding: {failed: {error: {null: false}}, "waiting-tool": {}},
    "waiting-tool": {
      failed: {toolError: {null: false}},
      composing: {toolAck: {eq: true}},
    },
    composing: {failed: {error: {null: false}}, "waiting-answer": {}},
    "waiting-answer": {
      failed: {chatError: {null: false}},
      completing: {chatAck: {eq: true}},
    },
    completing: {failed: {error: {null: false}}, done: {}},
    done: {planning: {task: {null: false}}},
    failed: {planning: {task: {null: false}}},
    "waiting-development-model": {failed: {chatError: {null: false}}, developing: {chatAck: {eq: true}}},
    developing: {failed: {error: {null: false}}, done: {status: {eq: "completed"}}, "waiting-development-tool": {}},
    "waiting-development-tool": {failed: {replError: {null: false}}, "collecting-development": {replAck: {eq: true}}},
    "collecting-development": {failed: {error: {null: false}}, "waiting-development-model": {}},
  })
  .mass(mass => ({task: mass.json(), providerRegistry: mass.json()}))
  .energy()
  .processes(process => [
    process("completing-codespace", {env: ["server"]})
      .action(async ({value, mass, signal}): Promise<AgentResult> => {
        const action = await import("./actions.ts")
        return action.completingCodespace({value, mass, signal})
      })
      .success(({update, data}) => update({
        task: data.task, answer: data.answer, status: data.status, error: data.error, activeTaskId: data.activeTaskId,
        chatRequest: data.chatRequest, chatAck: data.chatAck, chatAckId: data.chatAckId, chatResponse: data.chatResponse, chatError: data.chatError,
        toolRequest: data.toolRequest, toolAck: data.toolAck, toolAckId: data.toolAckId, toolResponse: data.toolResponse, toolError: data.toolError,
        replRequest: data.replRequest, replAck: data.replAck, replAckId: data.replAckId, replResponse: data.replResponse, replError: data.replError,
        codespaceRequest: data.codespaceRequest, codespaceAck: data.codespaceAck, codespaceAckId: data.codespaceAckId, codespaceResponse: data.codespaceResponse, codespaceError: data.codespaceError,
      }))
      .error(({update, error}) => update({task: null, answer: null, status: "failed", error: error.message})),
    process("replying", {env: ["server"]})
      .action(async ({value, mass, signal}): Promise<AgentResult> => {
        const action = await import("./actions.ts")
        return action.replying({value, mass, signal})
      })
      .success(({update, data}) => update({
        task: data.task, answer: data.answer, status: data.status, error: data.error, activeTaskId: data.activeTaskId,
        chatRequest: data.chatRequest, chatAck: data.chatAck, chatAckId: data.chatAckId, chatResponse: data.chatResponse, chatError: data.chatError,
        toolRequest: data.toolRequest, toolAck: data.toolAck, toolAckId: data.toolAckId, toolResponse: data.toolResponse, toolError: data.toolError,
        replRequest: data.replRequest, replAck: data.replAck, replAckId: data.replAckId, replResponse: data.replResponse, replError: data.replError,
        codespaceRequest: data.codespaceRequest, codespaceAck: data.codespaceAck, codespaceAckId: data.codespaceAckId, codespaceResponse: data.codespaceResponse, codespaceError: data.codespaceError,
      }))
      .error(({update, error}) => update({task: null, answer: null, status: "failed", error: error.message})),
    process("planning", {env: ["server"]})
      .action(async ({value, mass, environment, signal}): Promise<AgentResult> => {
        const action = await import("./actions.ts")
        return action.planning({value, mass, environment, signal})
      })
      .success(({update, data}) => update({
        task: data.task, answer: data.answer, status: data.status, error: data.error, activeTaskId: data.activeTaskId,
        chatRequest: data.chatRequest, chatAck: data.chatAck, chatAckId: data.chatAckId, chatResponse: data.chatResponse, chatError: data.chatError,
        toolRequest: data.toolRequest, toolAck: data.toolAck, toolAckId: data.toolAckId, toolResponse: data.toolResponse, toolError: data.toolError,
        replRequest: data.replRequest, replAck: data.replAck, replAckId: data.replAckId, replResponse: data.replResponse, replError: data.replError,
        codespaceRequest: data.codespaceRequest, codespaceAck: data.codespaceAck, codespaceAckId: data.codespaceAckId, codespaceResponse: data.codespaceResponse, codespaceError: data.codespaceError,
      }))
      .error(({update, error}) => update({task: null, answer: null, status: "failed", error: error.message})),
    process("deciding", {env: ["server"]})
      .action(async ({value, mass, signal}): Promise<AgentResult> => {
        const action = await import("./actions.ts")
        return action.deciding({value, mass, signal})
      })
      .success(({update, data}) => update({
        task: data.task, answer: data.answer, status: data.status, error: data.error, activeTaskId: data.activeTaskId,
        chatRequest: data.chatRequest, chatAck: data.chatAck, chatAckId: data.chatAckId, chatResponse: data.chatResponse, chatError: data.chatError,
        toolRequest: data.toolRequest, toolAck: data.toolAck, toolAckId: data.toolAckId, toolResponse: data.toolResponse, toolError: data.toolError,
        replRequest: data.replRequest, replAck: data.replAck, replAckId: data.replAckId, replResponse: data.replResponse, replError: data.replError,
        codespaceRequest: data.codespaceRequest, codespaceAck: data.codespaceAck, codespaceAckId: data.codespaceAckId, codespaceResponse: data.codespaceResponse, codespaceError: data.codespaceError,
      }))
      .error(({update, error}) => update({task: null, answer: null, status: "failed", error: error.message})),
    process("composing", {env: ["server"]})
      .action(async ({value, mass, signal}): Promise<AgentResult> => {
        const action = await import("./actions.ts")
        return action.composing({value, mass, signal})
      })
      .success(({update, data}) => update({
        task: data.task, answer: data.answer, status: data.status, error: data.error, activeTaskId: data.activeTaskId,
        chatRequest: data.chatRequest, chatAck: data.chatAck, chatAckId: data.chatAckId, chatResponse: data.chatResponse, chatError: data.chatError,
        toolRequest: data.toolRequest, toolAck: data.toolAck, toolAckId: data.toolAckId, toolResponse: data.toolResponse, toolError: data.toolError,
        replRequest: data.replRequest, replAck: data.replAck, replAckId: data.replAckId, replResponse: data.replResponse, replError: data.replError,
        codespaceRequest: data.codespaceRequest, codespaceAck: data.codespaceAck, codespaceAckId: data.codespaceAckId, codespaceResponse: data.codespaceResponse, codespaceError: data.codespaceError,
      }))
      .error(({update, error}) => update({task: null, answer: null, status: "failed", error: error.message})),
    process("completing", {env: ["server"]})
      .action(async ({value, mass, signal}): Promise<AgentResult> => {
        const action = await import("./actions.ts")
        return action.completing({value, mass, signal})
      })
      .success(({update, data}) => update({
        task: data.task, answer: data.answer, status: data.status, error: data.error, activeTaskId: data.activeTaskId,
        chatRequest: data.chatRequest, chatAck: data.chatAck, chatAckId: data.chatAckId, chatResponse: data.chatResponse, chatError: data.chatError,
        toolRequest: data.toolRequest, toolAck: data.toolAck, toolAckId: data.toolAckId, toolResponse: data.toolResponse, toolError: data.toolError,
        replRequest: data.replRequest, replAck: data.replAck, replAckId: data.replAckId, replResponse: data.replResponse, replError: data.replError,
        codespaceRequest: data.codespaceRequest, codespaceAck: data.codespaceAck, codespaceAckId: data.codespaceAckId, codespaceResponse: data.codespaceResponse, codespaceError: data.codespaceError,
      }))
      .error(({update, error}) => update({task: null, answer: null, status: "failed", error: error.message})),
    process("failed", {env: ["server"]})
      .action(async ({value, mass, signal}) => {
        const action = await import("./actions.ts")
        return action.failed({value, mass, signal})
      })
      .success(({update, data}) => update({task: data.task, status: data.status, error: data.error}))
      .error(({update}) => update({task: null, status: "failed", error: "Agent failure could not be persisted"})),
    process("developing", {env: ["server"]})
      .action(async ({value, mass, signal}): Promise<AgentResult> => {
        const action = await import("./actions.ts")
        return action.developing({value, mass, signal})
      })
      .success(({update, data}) => update({
        task: data.task, answer: data.answer, status: data.status, error: data.error, activeTaskId: data.activeTaskId,
        chatRequest: data.chatRequest, chatAck: data.chatAck, chatAckId: data.chatAckId, chatResponse: data.chatResponse, chatError: data.chatError,
        replRequest: data.replRequest, replAck: data.replAck, replAckId: data.replAckId, replResponse: data.replResponse, replError: data.replError,
      }))
      .error(({update, error}) => update({task: null, answer: null, status: "failed", error: error.message})),
    process("collecting-development", {env: ["server"]})
      .action(async ({value, mass, signal}): Promise<AgentResult> => {
        const action = await import("./actions.ts")
        return action.collectingDevelopment({value, mass, signal})
      })
      .success(({update, data}) => update({
        task: data.task, answer: data.answer, status: data.status, error: data.error, activeTaskId: data.activeTaskId,
        chatRequest: data.chatRequest, chatAck: data.chatAck, chatAckId: data.chatAckId, chatResponse: data.chatResponse, chatError: data.chatError,
        replRequest: data.replRequest, replAck: data.replAck, replAckId: data.replAckId, replResponse: data.replResponse, replError: data.replError,
      }))
      .error(({update, error}) => update({task: null, answer: null, status: "failed", error: error.message})),

  ])
  .reactions()
  .matter(({value, mass, html}) => html`
    <meta-for
      src="@metafor/chat"
      fields=${{
        request: value.chatRequest, ack: value.chatAck, ackId: value.chatAckId,
        response: value.chatResponse, error: value.chatError, sessionId: value.chatSessionId,
        feedbackRequest: value.feedbackRequest, feedbackAck: value.feedbackAck, feedbackAckId: value.feedbackAckId,
        feedbackResponse: value.feedbackResponse, feedbackError: value.feedbackError, feedbackLastRequest: value.feedbackLastRequest,
        binding: value.providerBinding,
        providerBootstrap: value.providerBootstrap,
        providerRegistryShared: value.providerRegistryShared,
      }}
      mass=${{providerRegistry: mass.providerRegistry}}
    />
    <meta-for
      src="@metafor/scenario"
      fields=${{
        request: value.toolRequest, ack: value.toolAck, ackId: value.toolAckId,
        response: value.toolResponse, error: value.toolError,
      }}
    />
    <meta-for
      src="@metafor/codespace"
      fields=${{
        request: value.codespaceRequest, ack: value.codespaceAck, ackId: value.codespaceAckId,
        response: value.codespaceResponse, error: value.codespaceError,
      }}
    />
    <meta-for
      src="@metafor/repl"
      fields=${{request: value.replRequest, ack: value.replAck, ackId: value.replAckId, response: value.replResponse, error: value.replError}}
    />
  `)
  .bulk()
