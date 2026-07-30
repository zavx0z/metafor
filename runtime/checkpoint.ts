import {resolve} from "node:path"
import "../metafor.ts"
import {captureOfflineCheckpoint} from "../dark/checkpoint/capture.ts"

const required = [
  "root",
  "history",
  "base-boundary",
  "boundary",
  "mass",
  "repository",
  "control-state",
  "captured-at",
] as const
const known = new Set<string>([...required, "confirm-contour-stopped"])

const readArguments = (): Record<string, string | true> => {
  const output: Record<string, string | true> = {}
  for (const argument of process.argv.slice(2)) {
    if (!argument.startsWith("--")) throw new Error(`Unknown checkpoint capture argument: ${argument}`)
    const separator = argument.indexOf("=")
    const name = argument.slice(2, separator === -1 ? undefined : separator)
    if (!known.has(name) || Object.hasOwn(output, name)) {
      throw new Error(`Unknown or duplicate checkpoint capture option: --${name}`)
    }
    if (name === "confirm-contour-stopped") {
      if (separator !== -1) throw new Error("--confirm-contour-stopped does not accept a value")
      output[name] = true
      continue
    }
    const value = separator === -1 ? "" : argument.slice(separator + 1)
    if (!value) throw new Error(`Checkpoint capture option --${name} requires a value`)
    output[name] = value
  }
  for (const name of required) {
    if (typeof output[name] !== "string") throw new Error(`Checkpoint capture option --${name} is required`)
  }
  if (output["confirm-contour-stopped"] !== true) {
    throw new Error("Checkpoint capture requires an external proof that the whole contour is stopped")
  }
  return output
}

const main = async (): Promise<void> => {
  const input = readArguments()
  const capturedAt = input["captured-at"] as string
  if (new Date(capturedAt).toISOString() !== capturedAt) {
    throw new Error("Checkpoint capture --captured-at must be a canonical ISO timestamp")
  }
  const result = await captureOfflineCheckpoint({
    root: input.root as string,
    historyDirectory: resolve(input.history as string),
    baseBoundary: resolve(input["base-boundary"] as string),
    currentBoundary: resolve(input.boundary as string),
    massDirectory: resolve(input.mass as string),
    repository: resolve(input.repository as string),
    controlState: resolve(input["control-state"] as string),
    capturedAt,
    trigger: "owner-bookmark",
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

if (import.meta.main) await main()
