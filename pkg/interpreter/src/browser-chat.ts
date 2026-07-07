import {createBrowserAgentRuntime, type BrowserAgentJsonObject} from "@metafor/browser-agent"
import {serializeError} from "./errors.ts"
import type {JsonObject} from "./types.ts"
import {activateChromeDevtoolsTarget, evaluateChromeDevtoolsExpression, setChromeDevtoolsDeviceMetrics, setChromeDevtoolsFileInputFiles} from "./chrome-devtools.ts"

const browserAgent = createBrowserAgentRuntime({
  evaluateExpression: async (params) => {
    const evaluated = await evaluateChromeDevtoolsExpression(params as JsonObject)
    return {target: evaluated.target, result: evaluated.result as BrowserAgentJsonObject}
  },
  activateTarget: async (params) => await activateChromeDevtoolsTarget(params as JsonObject),
  setFileInputFiles: async (params) => {
    const uploaded = await setChromeDevtoolsFileInputFiles(params as JsonObject)
    return {target: uploaded.target, result: uploaded.result as BrowserAgentJsonObject}
  },
  setViewport: async (params) => {
    const repaired = await setChromeDevtoolsDeviceMetrics(params as JsonObject)
    return repaired.viewport
  },
  serializeError,
})

export async function runBrowserChatToolUse(name: string, params: JsonObject): Promise<JsonObject | null> {
  return await browserAgent.runToolUse(name, params) as JsonObject | null
}
