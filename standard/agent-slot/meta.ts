/** Connection is an ordinary FSM; only its State controls Agent materialization. */
export default MetaFor("Подключение агента")
  .fields(field => ({
    enabled: field.boolean.required(false),
    task: field.string.optional(),
    answer: field.string.optional(),
    status: field.string.required("idle"),
    error: field.string.optional(),
    configuration: field.string.required("{}"),
    providerBinding: field.string.optional(),
    providerBootstrap: field.string.optional(),
    providerRegistryShared: field.boolean.required(false),
  }))
  .superposition({disconnected: {connected: {enabled: {eq: true}}}, connected: {disconnected: {enabled: {eq: false}}}})
  .mass(mass => ({providerRegistry: mass.json()}))
  .energy()
  .processes()
  .reactions()
  .matter(({state, value, mass, html}) => html`
    ${state === "connected" ? html`
      <meta-for src="@metafor/agent" fields=${{
        task: value.task, answer: value.answer, status: value.status, error: value.error,
        configuration: value.configuration, providerBinding: value.providerBinding,
        providerBootstrap: value.providerBootstrap, providerRegistryShared: value.providerRegistryShared,
      }} mass=${{providerRegistry: mass.providerRegistry}} />
    ` : null}
  `)
  .bulk()
