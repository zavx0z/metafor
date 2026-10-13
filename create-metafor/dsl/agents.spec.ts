import {expect, test} from "bun:test"
import {MetaFor} from "./index.ts"
import {Fragment, jsx} from "./jsx-runtime.ts"
import {evaluateMetaSource} from "../../quantum/dark/load.ts"
import {validateMatterSchema} from "shared/metafor/matter"

const base = () => MetaFor("Agents")
  .fields(field => ({task: field.string.optional(), answer: field.string.optional(), status: field.string.optional(), error: field.string.optional(), count: field.number.required(0), connected: field.boolean.required(false)}))
  .superposition({idle: null})
  .mass(mass => ({session: mass.json()}))
  .energy()
  .processes()
  .reactions()
  .matter(({html}) => html`<meta-for src="@fixture/existing" />`)
  .bulk()

test("agent connection delegates the boolean input to a standard slot FSM", () => {
  const schema = base().agents(({value}) => jsx("agent", {id: "optional", enabled: value.connected,
    task: value.task, answer: value.answer, status: value.status, error: value.error}))
  const branch = schema.matter![1]
  expect(branch).toMatchObject({kind: "wimp", src: "@metafor/agent-slot"})
  if (branch?.kind !== "wimp" || typeof branch.fieldsBinding !== "object") throw new Error("Missing connection slot")
  const evaluate = new Function("_", `return (${branch.fieldsBinding.expr})`)
  expect(evaluate([null, null, null, null, false]).enabled).toBeFalse()
  expect(evaluate([null, null, null, null, true]).enabled).toBeTrue()
  expect(() => base().agents(({value}) => jsx("agent", {id: "bad", enabled: value.count,
    task: value.task, answer: value.answer, status: value.status, error: value.error}))).toThrow("boolean Field")
})

test("explicit provider assignment lowers to one public string Field without serializing network policy", () => {
  const schema = base().agents(({atom, value}) => jsx("agent", {id: "chatgpt-codespace", atom,
    task: value.task, answer: value.answer, status: value.status, error: value.error, providerBinding: "codespace-chatgpt"}))
  const particle = schema.matter![1]
  if (particle?.kind !== "wimp" || typeof particle.fieldsBinding !== "object") throw new Error("Missing Agent binding")
  const fields = new Function("_", `return (${particle.fieldsBinding.expr})`)([null, null, "idle", null])
  expect(fields.providerBinding).toBe("codespace-chatgpt")
  expect(JSON.stringify(schema)).not.toContain("tokenFile")
  expect(() => base().agents(({value}) => jsx("agent", {id: "bad", task: value.task, answer: value.answer, status: value.status, error: value.error, providerBinding: value.count}))).toThrow("string Field")
})

test("shared Provider registry lowers a direct JSON Mass alias, never content copy or a forged reference", () => {
  const schema = base().agents(({atom, value, mass}) => jsx("agent", {id: "shared", atom,
    task: value.task, answer: value.answer, status: value.status, error: value.error, providerRegistry: mass.session}))
  const child = schema.matter![1]
  if (child?.kind !== "wimp" || typeof child.fieldsBinding !== "object") throw new Error("Missing Agent")
  expect(child.massBinding).toEqual({data: "/mass/session", expr: "{ providerRegistry: _[0] }", directMass: {kind: "keys", entries: [{target: "providerRegistry", source: "session"}]}})
  expect(new Function("_", `return (${child.fieldsBinding.expr})`)([null, null, "idle", null]).providerRegistryShared).toBeTrue()
  expect(() => base().agents(({value}) => jsx("agent", {id: "forged", task: value.task, answer: value.answer, status: value.status, error: value.error, providerRegistry: {kind: "mass", key: "session"}}))).toThrow("context")
  expect(() => MetaFor("binary registry").fields(field => ({task: field.string.optional(), answer: field.string.optional(), status: field.string.optional(), error: field.string.optional()}))
    .superposition({idle: null}).mass(mass => ({data: mass.binary()})).energy().processes().reactions().matter().bulk()
    .agents(({value, mass}) => jsx("agent", {id: "bad", task: value.task, answer: value.answer, status: value.status, error: value.error, providerRegistry: mass.data}))).toThrow("JSON Mass")
})

test("bulk remains serializable and final agents append canonical Matter without callback or live handles", () => {
  const previous = base()
  const before = JSON.stringify(previous)
  expect(Object.keys(previous)).not.toContain("agents")
  expect(Object.getOwnPropertyDescriptor(previous, "agents")?.enumerable).toBe(false)
  let calls = 0
  const schema = previous.agents(({value, oracle, mass, graph, force}) => {
    calls++
    expect(Object.keys(mass.session)).toEqual(["kind", "key"])
    expect("read" in mass.session).toBeFalse()
    return jsx("agent", {id: "assistant", task: value.task, answer: value.answer, status: value.status, error: value.error,
      tools: [oracle.tool("scenario.run", {scenario: "agent-system.integrity"})],
      children: [jsx("display", {id: "world", source: graph}), jsx("display", {id: "activity", source: force}), jsx("display", {id: "session", source: mass.session})]})
  })
  expect(calls).toBe(1)
  expect("agents" in schema).toBeFalse()
  expect(JSON.stringify(previous)).toBe(before)
  expect(schema.matter?.[0]).toEqual(previous.matter?.[0])
  const wire = JSON.parse(JSON.stringify(schema))
  expect(wire.matter).toHaveLength(2)
  const particle = wire.matter[1]
  expect(particle.src).toBe("@metafor/agent")
  expect(particle.fieldsBinding.data).toEqual(["task", "answer", "status", "error"])
  const bound = new Function("_", `return (${particle.fieldsBinding.expr})`)(["task", "answer", "idle", null])
  expect(bound).toMatchObject({task: "task", answer: "answer", status: "idle", error: null})
  expect(JSON.parse(bound.configuration)).toEqual({id: "assistant", atom: {kind: "atom", scope: "owner"},
    presentation: {kind: "agent-inspector", defaultTab: "chat", tabs: ["chat", "provider", "tools", "context"]},
    tools: [{kind: "oracle-tool", name: "scenario.run", input: {scenario: "agent-system.integrity"}}],
    displays: [{id: "world", source: {kind: "graph"}}, {id: "activity", source: {kind: "force"}}, {id: "session", source: {kind: "mass", key: "session"}}]})
  expect(JSON.stringify(wire)).not.toContain("function")
  validateMatterSchema(wire.matter, Object.fromEntries(wire.fields.map((field: {key: string}) => [field.key, field])))
})

test("real TSX compiles through the Dark evaluator into JSON and existing Matter", async () => {
  const schema = await evaluateMetaSource(`
    export default MetaFor("TSX agents")
      .fields(field => ({task:field.string.optional(),answer:field.string.optional(),status:field.string.optional(),error:field.string.optional()}))
      .superposition({idle:null}).mass(()=>({})).energy().processes().reactions().matter().bulk()
      .agents(({value,oracle,graph,force}) => <>
        <agent id="assistant" task={value.task} answer={value.answer} status={value.status} error={value.error}
          tools={[oracle.tool("scenario.run",{scenario:"agent-system.integrity"})]}>
          <display id="world" source={graph}/>
          <display id="activity" source={force}/>
        </agent>
      </>)
  `)
  const wire = JSON.parse(JSON.stringify(schema))
  expect(wire.matter).toHaveLength(1)
  expect(wire.matter[0]).toMatchObject({kind: "wimp", src: "@metafor/agent", fieldsBinding: {data: ["task", "answer", "status", "error"]}})
  expect("agents" in schema).toBeFalse()
})

test("fragments preserve declared agent order and literal-only bindings remain ordinary Matter", () => {
  const schema = base().agents(() => jsx(Fragment, {children: ["one", "two"].map(id => jsx("agent", {id, task: "hello", answer: null, status: "idle", error: null}))}))
  const additions = schema.matter!.slice(1)
  expect(additions.map(particle => {
    if (particle.kind !== "wimp" || typeof particle.fieldsBinding !== "object") throw new Error("Missing WIMP binding")
    const values = new Function("_", `return (${particle.fieldsBinding.expr})`)([])
    return JSON.parse(values.configuration).id
  })).toEqual(["one", "two"])
})

test("duplicate identities, foreign references and unsupported JSX cannot silently materialize", () => {
  const props = {id: "assistant", task: "task", answer: null, status: "idle", error: null}
  expect(() => base().agents(() => [jsx("agent", props), jsx("agent", props)])).toThrow("duplicate agent id")
  expect(() => jsx("div", {})).toThrow("only agent, display")
  expect(() => jsx(() => "imperative DOM", {})).toThrow("synchronous declarative children")
  expect(() => jsx("agent", props, "key")).toThrow("uses id")
  expect(() => base().agents(() => jsx("display", {id: "world", source: {kind: "graph"}}))).toThrow("only agent")
  expect(() => base().agents(() => jsx("agent", {...props, unknown: true}))).toThrow("props")
  expect(() => base().agents(() => jsx("agent", {...props, task: {kind: "field", key: "task"}}))).toThrow("parent string Field")
  expect(() => base().agents(({value}) => jsx("agent", {...props, task: value.count}))).toThrow("string Field")
  expect(() => base().agents(() => jsx("agent", {...props, tools: [{kind: "oracle-tool", name: "arbitrary"}]}))).toThrow("this Oracle context")
  expect(() => base().agents(({graph}) => jsx("agent", {...props, children: [jsx("display", {id: "world", source: graph}), jsx("display", {id: "world", source: graph})]}))).toThrow("duplicate display id")
  expect(() => base().agents(() => jsx("agent", {...props, children: jsx("display", {id: "world", source: {kind: "graph"}})}))).toThrow("this context")
  expect(() => base().agents(({oracle}) => {
    oracle.tool("scenario.run", {execute: () => true} as never)
    return null
  })).toThrow("JSON data")
})

test("tools and owning Atom presentation are generic inert declarations without implied grants", () => {
  let executions = 0
  const schema = base().agents(({atom, value, oracle}) => jsx("agent", {id: "assistant", atom, task: value.task, answer: value.answer, status: value.status, error: value.error,
    tools: [oracle.tool("document.inspect", {query: "invoice", variants: [null, true, 42]}, {meta: "@tools/document"})],
    children: jsx("display", {id: "owner", source: atom})}))
  const particle = schema.matter![1]
  if (particle?.kind !== "wimp" || typeof particle.fieldsBinding !== "object") throw new Error("Missing Agent")
  const configuration = JSON.parse(new Function("_", `return (${particle.fieldsBinding.expr})`)([null, null, "idle", null]).configuration)
  expect(configuration).toMatchObject({atom: {kind: "atom", scope: "owner"}, presentation: {defaultTab: "chat"},
    tools: [{kind: "oracle-tool", name: "document.inspect", input: {query: "invoice", variants: [null, true, 42]}, owner: {meta: "@tools/document"}}],
    displays: [{id: "owner", source: {kind: "atom", scope: "owner"}}]})
  expect(configuration.tools[0]).not.toHaveProperty("capability")
  expect(executions).toBe(0)
  expect(() => base().agents(({value, oracle}) => {
    oracle.tool("document.inspect", {get data() {executions++; return "read"}})
    return jsx("agent", {id: "assistant", atom: {kind: "atom", scope: "owner"}, task: value.task, answer: value.answer, status: value.status, error: value.error})
  })).toThrow("accessors")
  expect(executions).toBe(0)
  expect(() => base().agents(({value}) => jsx("agent", {id: "assistant", atom: {kind: "atom", scope: "owner"}, task: value.task, answer: value.answer, status: value.status, error: value.error}))).toThrow("owning Atom")
})
