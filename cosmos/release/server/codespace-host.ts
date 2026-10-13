/**
Native adapter for one host-assigned [Codespace Tool](../../../standard/codespace/README.md).
A private helper selects credentials. Only fixed GitHub API argv is emitted;
no shell, arbitrary gh, account fallback or resource creation is admitted.
[Tests](../spec/codespace-host.spec.ts) replace the process runner.
@packageDocumentation
*/
import {isAbsolute} from "node:path"
import {CODESPACE_START_METHOD, CODESPACE_STATUS_METHOD, type CodespaceOperation, type CodespaceResult} from "@metafor/types/metafor/codespace"

export interface CodespaceHostAssignment {
  readonly command: readonly [string, string]
  readonly account: string
  readonly target: string
}

/** Missing configuration disables the adapter; partial or malformed assignment fails closed. */
export function readCodespaceHostAssignment(environment: Readonly<Record<string, string | undefined>>): CodespaceHostAssignment | null {
  const command = environment.ORACLE_CODESPACE_HELPER_COMMAND
  const account = environment.ORACLE_CODESPACE_ACCOUNT
  const target = environment.ORACLE_CODESPACE_TARGET
  if (!command && !account && !target) return null
  let argv: unknown
  try { argv = JSON.parse(command ?? "null") } catch { throw new Error("Invalid Codespace host assignment") }
  if (!Array.isArray(argv) || argv.length !== 2 || !argv.every(part => typeof part === "string" && isAbsolute(part) && !part.includes("\0")) ||
      !account || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(account) ||
      !target || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,99}$/.test(target)) throw new Error("Invalid Codespace host assignment")
  return {command: [argv[0], argv[1]], account, target}
}

export interface CodespaceHostRunner {
  (argv: readonly string[], timeoutMs: number, signal?: AbortSignal): Promise<{exitCode: number; stdout: string}>
}

/** Runs an owned child with bounded output and deadline. External diagnostics stay private. */
export const runCodespaceHostCommand: CodespaceHostRunner = async (argv, timeoutMs, signal) => {
  signal?.throwIfAborted()
  const environment = {...Bun.env}
  for (const key of Object.keys(environment)) if (/^(GH_|GITHUB_|ORACLE_|COSMOS_|METAFOR_)/.test(key)) delete environment[key]
  const child = Bun.spawn([...argv], {stdin: "ignore", stdout: "pipe", stderr: "ignore", env: environment})
  const reader = child.stdout.getReader()
  let count = 0
  const chunks: Uint8Array[] = []
  let timedOut = false
  const timer = setTimeout(() => {timedOut = true; child.kill()}, timeoutMs)
  const abort = () => {child.kill()}
  signal?.addEventListener("abort", abort, {once: true})
  try {
    while (true) {
      const item = await reader.read()
      if (item.done) break
      count += item.value.byteLength
      if (count > 64 * 1024) {child.kill(); throw new Error("Codespace host output exceeded limit")}
      chunks.push(item.value)
    }
    const exitCode = await child.exited
    signal?.throwIfAborted()
    if (timedOut) throw new Error("Codespace host operation timed out; outcome may be uncertain")
    return {exitCode, stdout: new TextDecoder().decode(Buffer.concat(chunks))}
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", abort)
    reader.releaseLock()
  }
}

/** Fixed assignment is verified against GitHub identity before every status/start operation. */
export function createCodespaceHostAdapter(assignment: CodespaceHostAssignment, run: CodespaceHostRunner = runCodespaceHostCommand) {
  let busy = false
  let closed = false
  const controller = new AbortController()
  const command = async (arguments_: string[], deadline: number): Promise<string> => {
    const output = await run([...assignment.command, ...arguments_], deadline, controller.signal)
    controller.signal.throwIfAborted()
    if (output.exitCode !== 0) throw new Error("Assigned Codespace operation failed; inspect host diagnostics")
    return output.stdout.trim()
  }
  return {
    async execute(operation: CodespaceOperation): Promise<CodespaceResult> {
      if (closed) throw new Error("Assigned Codespace adapter is closed")
      if (busy) throw new Error("Assigned Codespace operation is busy")
      busy = true
      try {
        const identity = await command(["api", "/user", "--jq", ".login"], 15_000)
        if (identity !== assignment.account) throw new Error("Assigned Codespace account does not match host identity")
        const path = `/user/codespaces/${assignment.target}`
        const raw: unknown = JSON.parse(await command(["api", path, "--jq", "{name: .name, state: .state, owner: .owner.login}"], 20_000))
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid assigned Codespace status")
        const value = raw as Record<string, unknown>
        if (Object.keys(value).sort().join(",") !== "name,owner,state" || value.name !== assignment.target ||
            value.owner !== assignment.account || typeof value.state !== "string" || !/^[A-Za-z][A-Za-z0-9 ]{0,63}$/.test(value.state)) {
          throw new Error("Assigned Codespace identity or status does not match")
        }
        let outcome: CodespaceResult["outcome"] = "observed"
        if (operation === "start") {
          if (value.state === "Available") outcome = "already-running"
          else if (value.state === "Starting" || value.state === "Queued" || value.state === "Provisioning") outcome = "already-starting"
          else {
            await command(["api", "--method", "POST", `${path}/start`, "--silent"], 30_000)
            outcome = "start-accepted"
          }
        }
        return {schema: "metafor/codespace/v1", version: 1, operation,
          target: {name: assignment.target, account: assignment.account}, state: value.state, outcome}
      } finally { busy = false }
    },
    methods: [CODESPACE_STATUS_METHOD, CODESPACE_START_METHOD] as const,
    close() {closed = true; controller.abort(new Error("Assigned Codespace host closed; outcome may be uncertain"))},
  }
}
