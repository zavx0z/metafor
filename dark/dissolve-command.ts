import {randomBytes, timingSafeEqual} from "node:crypto"
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync,
} from "node:fs"
import {dirname, join, resolve} from "node:path"
import {
  MF117_COMMAND_SCHEMA,
  MF117_STATE_DIRECTORY,
} from "../shared/mf117.ts"

export type MF117Command =
  | Readonly<{
    schema: typeof MF117_COMMAND_SCHEMA
    action: "preflight"
  }>
  | Readonly<{
    schema: typeof MF117_COMMAND_SCHEMA
    action: "activate"
    preflightReceiptId: string
  }>

const tokenPattern = /^[A-Za-z0-9_-]{43}$/
const digestPattern = /^[0-9a-f]{64}$/

const closed = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean =>
  JSON.stringify(Object.keys(value).toSorted()) ===
    JSON.stringify([...keys].toSorted())

/** Owner-only file capability for the one exact loopback MF-117 command. */
export class MF117OwnerCapability {
  readonly filename: string
  readonly #token: string

  constructor(
    filename = join(MF117_STATE_DIRECTORY, "owner-capability"),
  ) {
    this.filename = resolve(filename)
    mkdirSync(dirname(this.filename), {recursive: true, mode: 0o700})
    const directory = lstatSync(dirname(this.filename))
    if (
      !directory.isDirectory() ||
      directory.isSymbolicLink() ||
      directory.uid !== process.getuid?.() ||
      (directory.mode & 0o077) !== 0
    ) throw new Error("MF-117 owner capability directory is not private")
    if (!existsSync(this.filename)) {
      const token = randomBytes(32).toString("base64url")
      const descriptor = openSync(this.filename, "wx", 0o600)
      try {
        writeSync(descriptor, `${token}\n`, undefined, "utf8")
        fsyncSync(descriptor)
      } finally {
        closeSync(descriptor)
      }
      const parent = openSync(dirname(this.filename), "r")
      try {
        fsyncSync(parent)
      } finally {
        closeSync(parent)
      }
    }
    const stat = lstatSync(this.filename)
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid?.() ||
      (stat.mode & 0o077) !== 0
    ) throw new Error("MF-117 owner capability file is not private")
    const token = readFileSync(this.filename, "utf8").trim()
    if (!tokenPattern.test(token)) {
      throw new Error("MF-117 owner capability is invalid")
    }
    this.#token = token
  }

  authorize(header: string | null): boolean {
    if (!header?.startsWith("Bearer ")) return false
    const candidate = header.slice("Bearer ".length)
    if (!tokenPattern.test(candidate)) return false
    const actual = Buffer.from(candidate)
    const expected = Buffer.from(this.#token)
    return actual.byteLength === expected.byteLength &&
      timingSafeEqual(actual, expected)
  }
}

export const readMF117Command = (value: unknown): MF117Command => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("MF-117 command must be an object")
  }
  const input = value as Record<string, unknown>
  if (
    input.schema !== MF117_COMMAND_SCHEMA ||
    (input.action !== "preflight" && input.action !== "activate")
  ) throw new Error("MF-117 command envelope is invalid")
  if (input.action === "preflight") {
    if (!closed(input, ["schema", "action"])) {
      throw new Error("MF-117 preflight command is not closed")
    }
    return {schema: MF117_COMMAND_SCHEMA, action: "preflight"}
  }
  if (
    !closed(input, ["schema", "action", "preflightReceiptId"]) ||
    typeof input.preflightReceiptId !== "string" ||
    !digestPattern.test(input.preflightReceiptId)
  ) throw new Error("MF-117 activation command is invalid")
  return {
    schema: MF117_COMMAND_SCHEMA,
    action: "activate",
    preflightReceiptId: input.preflightReceiptId,
  }
}
