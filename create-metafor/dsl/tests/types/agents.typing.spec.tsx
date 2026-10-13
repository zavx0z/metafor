/** @jsxImportSource @metafor/dsl */
import {expect, test} from "bun:test"
import {MetaFor} from "../../index.ts"
import type {AgentFieldReference} from "@metafor/types/metafor/agents"
import type {InferMetaMass, InferMetaValues} from "@metafor/types/metafor/schema"

const meta = MetaFor("Typed agents")
  .fields(field => ({task: field.string.optional(), answer: field.string.optional(), status: field.string.optional(), error: field.string.optional(), count: field.number.required(0)}))
  .superposition({idle: null})
  .mass(mass => ({session: mass.json()}))
  .energy()
  .processes()
  .reactions()
  .matter()
  .bulk()
  .agents(({atom, value, oracle, mass, graph}) => {
    const task: AgentFieldReference<string | null> = value.task
    const generic = oracle.tool("document.inspect", {query: "invoice"}, {meta: "@tools/document"})
    const genericName: "document.inspect" = generic.name
    const genericQuery: "invoice" = generic.input.query
    const rejects = () => {
      // @ts-expect-error Numeric Fields cannot bind the Agent's string task
      const badTask: AgentFieldReference<string | null> = value.count
      // @ts-expect-error No unannounced Mass key is present
      mass.missing
      // @ts-expect-error Tool definitions are JSON data, never executable callbacks
      oracle.tool("arbitrary.run", {execute: () => true})
      // @ts-expect-error Optional tool ownership is a public Meta name
      oracle.tool("scenario.run", {scenario: "missing"}, {meta: 42})
      // @ts-expect-error Agents JSX does not accept product DOM elements
      const badTag = <div />
      // @ts-expect-error Agent props reject arbitrary execution settings
      const badProps = <agent {...props} command="run" />
      // @ts-expect-error Display source is a declarative context reference
      const badDisplay = <display id="bad" source="graph" />
      void [badTask, badTag, badProps, badDisplay]
    }
    const props = {id: "assistant", task: value.task, answer: value.answer, status: value.status, error: value.error}
    void [task, rejects, genericName, genericQuery]
    return <agent
      {...props}
      atom={atom}
      tools={[oracle.tool("scenario.run", {scenario: "agent-system.integrity"})]}
    >
      <display
        id="session"
        source={mass.session}
      />
      <display
        id="world"
        source={graph}
      />
    </agent>
  })

type Values = InferMetaValues<typeof meta>
type Mass = InferMetaMass<typeof meta>
const values: Values["task"] = null
const massKey: keyof Mass = "session"
test("final agents retain the parent Meta type witness", () => {
  expect(values).toBeNull()
  expect(massKey).toBe("session")
})
