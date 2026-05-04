#!/usr/bin/env bun

import {loadConfig} from "../../pkg/debug/src/config.ts"
import {runAgent} from "../../pkg/debug/src/agent.ts"

const dumpPath = Bun.env.AGENT_DUMP_PATH ?? "dark/debug/.agent-state.json"
const debugDir = "dark/debug"

await runAgent(loadConfig({
  ...Bun.env,
  BUN_INSPECTOR_URL: Bun.env.BUN_INSPECTOR_URL ?? "ws://127.0.0.1:6499/dark",
  AGENT_DUMP_PATH: dumpPath,
  AGENT_EVENT_LOG_PATH: Bun.env.AGENT_EVENT_LOG_PATH ?? `${debugDir}/.agent-events.log`,
  AGENT_CONSOLE_LOG_PATH: Bun.env.AGENT_CONSOLE_LOG_PATH ?? `${debugDir}/.agent-console.log`,
  AGENT_COMMAND_PATH: Bun.env.AGENT_COMMAND_PATH ?? `${debugDir}/.agent-commands.ndjson`,
  AGENT_RESPONSE_PATH: Bun.env.AGENT_RESPONSE_PATH ?? `${debugDir}/.agent-responses.ndjson`,
}))
