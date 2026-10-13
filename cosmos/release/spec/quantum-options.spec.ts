import {expect, test} from "bun:test"
import {quantumRuntimeOptions} from "../server/quantum"

test("native provider configuration and peer grants are assigned only through the Energy environment", () => {
  const values = {
    COSMOS_QUANTUM: "1",
    ORACLE_AGENT_PROVIDER_CONFIG: "/fixture/private/provider-capabilities.json",
    ORACLE_ENVIRONMENT_PEER_SCOPES: "@internal/peer",
    ORACLE_ENVIRONMENT_PROVIDER_DISCOVERY_SCOPES: "@metafor/provider",
    ORACLE_ENVIRONMENT_REPL_SCOPES: "@metafor/repl",
    ORACLE_REPL_CONFIG: "/fixture/private/repl-capability.json",
  }
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, Bun.env[key]]))
  try {
    Object.assign(Bun.env, values)
    const options = quantumRuntimeOptions("/fixture/state")
    expect(options?.energyEnvironment).toMatchObject({
      ORACLE_AGENT_PROVIDER_CONFIG: values.ORACLE_AGENT_PROVIDER_CONFIG,
      ORACLE_ENVIRONMENT_PEER_SCOPES: values.ORACLE_ENVIRONMENT_PEER_SCOPES,
      ORACLE_ENVIRONMENT_PROVIDER_DISCOVERY_SCOPES: values.ORACLE_ENVIRONMENT_PROVIDER_DISCOVERY_SCOPES,
      ORACLE_ENVIRONMENT_REPL_SCOPES: values.ORACLE_ENVIRONMENT_REPL_SCOPES,
      ORACLE_REPL_CONFIG: values.ORACLE_REPL_CONFIG,
    })
    expect(options?.env).toBeUndefined()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete Bun.env[key]
      else Bun.env[key] = value
    }
  }
})
