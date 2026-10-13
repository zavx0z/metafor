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
    browserAgentEnabled: AgentFieldReference<boolean | null>
    browserTask: AgentFieldReference<string | null>
    browserAnswer: AgentFieldReference<string | null>
    browserStatus: AgentFieldReference<string | null>
    browserError: AgentFieldReference<string | null>
    browserProviderBinding: AgentFieldReference<string | null>
    localBrowserAgentEnabled: AgentFieldReference<boolean | null>
  }>
  mass: Readonly<{providerRegistry: AgentMassReference}>
}>

export default ({atom, value, mass, oracle}: Context) => (
  <>
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
    <agent
      id="browser-assistant"
      atom={atom}
      enabled={value.browserAgentEnabled}
      task={value.browserTask}
      answer={value.browserAnswer}
      status={value.browserStatus}
      error={value.browserError}
      providerBinding={value.browserProviderBinding}
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
    <agent
      id="mac-browser"
      atom={atom}
      enabled={value.localBrowserAgentEnabled}
      task={null}
      answer={null}
      status="idle"
      error={null}
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
  </>
)
