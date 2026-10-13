/** @jsxImportSource @metafor/dsl */
import type {AgentAtomReference, AgentFieldReference, AgentMassReference, AgentOracleReference} from "@metafor/types/metafor/agents"

type Context = Readonly<{
  atom: AgentAtomReference
  oracle: AgentOracleReference
  value: Readonly<{
    task: AgentFieldReference<string | null>
    answer: AgentFieldReference<string | null>
    status: AgentFieldReference<string | null>
    error: AgentFieldReference<string | null>
    providerBinding: AgentFieldReference<string | null>
    agentEnabled: AgentFieldReference<boolean | null>
  }>
  mass: Readonly<{providerRegistry: AgentMassReference}>
}>

export default ({atom, value, mass, oracle}: Context) => (
    <agent
      id="assistant"
      atom={atom}
      enabled={value.agentEnabled}
      task={value.task}
      answer={value.answer}
      status={value.status}
      error={value.error}
      providerBinding={value.providerBinding}
      providerRegistry={mass.providerRegistry}
      tools={[
        oracle.tool("bun.evaluate", {}, {meta: "@metafor/repl"}),
        oracle.tool("scenario.run", {scenario: "agent-system.integrity"}, {meta: "@metafor/scenario"}),
        oracle.tool("codespace.status", {}, {meta: "@metafor/codespace"}),
        oracle.tool("codespace.start", {}, {meta: "@metafor/codespace"}),
      ]}
    >
      <display id="providers" source={mass.providerRegistry} />
    </agent>

)
