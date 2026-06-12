import type {MetaDSL} from "../.."
import type {Wimp} from "@store/wimp/sqlite"
import type {ParsedProcess} from "../../process.t.ts"
import type {ParsedDestroy} from "../../finally.t.ts"
import {createProtocolChannel} from "../../protocol.ts"

const protocol = createProtocolChannel()

export async function fillProcesses(wimp: Wimp, dsl: MetaDSL): Promise<void> {
  for (const [key, raw] of Object.entries(dsl.processes ?? {})) {
    const proc = raw as ParsedProcess | ParsedDestroy
    const process = await wimp.processes.add({
      key,
      type: proc.type === "finally" ? "finally" : "action",
      label: proc.label ?? null,
      desc: proc.desc ?? null,
    })
    const processUuid = await process.uuid()
    protocol.postMessage({
      patches: [{part: "graviton", op: "add", path: processUuid, value: "process"}],
    })

    for (const env of proc.env ?? []) {
      await process.env.add(env)
      protocol.postMessage({
        patches: [{part: "graviton", op: "add", path: `${processUuid}/env/${env}`, value: "process_env"}],
      })
    }

    if (proc.type === "finally") {
      const destroy = proc as ParsedDestroy
      await process.finally.setBefore(destroy.before.src)
      protocol.postMessage({
        patches: [{part: "graviton", op: "add", path: `${processUuid}/finally`, value: "process_finally"}],
      })
      for (const fieldKey of destroy.before.read ?? []) {
        await process.finally.read.add(fieldKey)
        protocol.postMessage({
          patches: [
            {part: "graviton", op: "add", path: `${processUuid}/finally/read/${fieldKey}`, value: "process_finally_read"},
          ],
        })
      }
      continue
    }

    const action = proc as ParsedProcess
    await process.action.set({
      src: action.action.src,
      importSpecifier: action.action.importSpecifier ?? null,
      wrapperSrc: action.action.wrapperSrc ?? null,
      success: action.success?.src ?? null,
      error: action.error?.src ?? null,
    })
    protocol.postMessage({
      patches: [{part: "graviton", op: "add", path: `${processUuid}/action`, value: "process_action"}],
    })

    for (const fieldKey of action.action.read ?? []) {
      await process.action.read.add("action", fieldKey)
      protocol.postMessage({
        patches: [
          {part: "graviton", op: "add", path: `${processUuid}/action/read/action/${fieldKey}`, value: "process_action_read"},
        ],
      })
    }
    for (const fieldKey of action.success?.read ?? []) {
      await process.action.read.add("success", fieldKey)
      protocol.postMessage({
        patches: [
          {part: "graviton", op: "add", path: `${processUuid}/action/read/success/${fieldKey}`, value: "process_action_read"},
        ],
      })
    }
    for (const fieldKey of action.error?.read ?? []) {
      await process.action.read.add("error", fieldKey)
      protocol.postMessage({
        patches: [
          {part: "graviton", op: "add", path: `${processUuid}/action/read/error/${fieldKey}`, value: "process_action_read"},
        ],
      })
    }
    for (const fieldKey of action.success?.write ?? []) {
      await process.action.write.add("success", fieldKey)
      protocol.postMessage({
        patches: [
          {part: "graviton", op: "add", path: `${processUuid}/action/write/success/${fieldKey}`, value: "process_action_write"},
        ],
      })
    }
    for (const fieldKey of action.error?.write ?? []) {
      await process.action.write.add("error", fieldKey)
      protocol.postMessage({
        patches: [
          {part: "graviton", op: "add", path: `${processUuid}/action/write/error/${fieldKey}`, value: "process_action_write"},
        ],
      })
    }
  }
}
