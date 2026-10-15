import {createHash} from "node:crypto"
import {lstat, readFile} from "node:fs/promises"
import {isAbsolute, join} from "node:path"

/** Закреплённая конфигурация одного installed contour; credentials остаются вне Git. */
export interface OperatorInstance {
  readonly version: 1
  readonly checkout: string
  readonly port: number
  readonly bunExecutable: string
  readonly environment: Readonly<Record<string, string>>
}

const ownedKey = /^(COSMOS_|METAFOR_|BOUNDARY_|DARK_|ORACLE_|FORCE_)/
const transientKey = /^(METAFOR_OPERATOR_|COSMOS_RELEASE_SELECTION$|COSMOS_RELEASE_INSPECT$)/

export function validateOperatorInstance(value: OperatorInstance): void {
  if (value.version !== 1 || !isAbsolute(value.checkout) || !isAbsolute(value.bunExecutable) ||
      !Number.isInteger(value.port) || value.port < 1 || value.port > 65535 || !value.environment || Array.isArray(value.environment))
    throw new Error("Invalid operator instance configuration")
  for (const [key, item] of Object.entries(value.environment)) {
    if (!ownedKey.test(key) || transientKey.test(key) || typeof item !== "string")
      throw new Error("Operator instance contains an unsupported environment key")
    if (/(?:_PATH|_ROOT|_FILE|_STORE)$/.test(key) && item && !isAbsolute(item))
      throw new Error("Operator instance paths must be absolute")
  }
  if (!value.environment.COSMOS_RELEASE_STORE || !value.environment.METAFOR_STATE_ROOT)
    throw new Error("Operator instance requires explicit installed store and state roots")
}

/** Загружает только закреплённую instance config, не .env или package.json checkout. */
export async function loadOperatorInstance(): Promise<OperatorInstance | undefined> {
  if (!process.env.METAFOR_OPERATOR_ROOT) return
  const path = process.env.METAFOR_OPERATOR_INSTANCE
  const expected = process.env.METAFOR_OPERATOR_INSTANCE_SHA256
  if (!path || !expected) throw new Error("Operator instance binding is missing")
  const status = await lstat(path)
  if (!status.isFile() || status.isSymbolicLink() || status.uid !== process.getuid?.() || (status.mode & 0o077))
    throw new Error("Operator instance must be a private owned file")
  const bytes = await readFile(path)
  if (createHash("sha256").update(bytes).digest("hex") !== expected) throw new Error("Operator instance binding changed")
  if ((await readFile(join(process.env.METAFOR_OPERATOR_ROOT, "INSTANCE.sha256"), "utf8")).trim() !== expected)
    throw new Error("Operator snapshot belongs to another instance")
  const value = JSON.parse(bytes.toString()) as OperatorInstance
  validateOperatorInstance(value)
  for (const key of Object.keys(process.env)) {
    if (ownedKey.test(key) && !key.startsWith("METAFOR_OPERATOR_") && key !== "COSMOS_RELEASE_SELECTION" && key !== "COSMOS_RELEASE_INSPECT") delete process.env[key]
  }
  Object.assign(process.env, value.environment, {PORT: String(value.port), BUN_PORT: String(value.port)})
  return value
}
