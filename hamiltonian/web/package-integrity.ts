import type {BrowserPackageEnvironment} from "./package-environment"

/** Полная проверяемая identity одного browser artifact. */
export interface BrowserPackageIdentity {
  name: string
  env: BrowserPackageEnvironment
  version: string
  sha256: string
  size: number
}

/** Вычисляет SHA-256 и byte size точного body. */
export async function artifactIntegrity(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return {
    sha256: [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(""),
    size: bytes.byteLength,
  }
}

/** Проверяет identity headers и фактические bytes HTTP response. */
export async function verifyPackageResponse(
  response: Response,
  expected: BrowserPackageIdentity,
) {
  if (!response.ok) throw new Error(`${response.url || "Package"} returned ${response.status}`)
  if (response.headers.get("X-Package-Name") !== expected.name)
    throw new Error(`Ответ принадлежит другому пакету: ${expected.name}`)
  if (response.headers.get("X-Package-Env") !== expected.env)
    throw new Error(`Ответ принадлежит другой среде: ${expected.name}:${expected.env}`)
  if (response.headers.get("X-Package-Version") !== expected.version)
    throw new Error(`Ответ имеет другую версию: ${expected.name}@${expected.version}`)
  if (response.headers.get("X-Package-SHA256") !== expected.sha256)
    throw new Error(`Ответ имеет другой SHA-256: ${expected.name}@${expected.version}`)
  if (response.headers.get("X-Package-Size") !== String(expected.size))
    throw new Error(`Ответ имеет другой byte size: ${expected.name}@${expected.version}`)

  const actual = await artifactIntegrity(await response.clone().arrayBuffer())
  if (actual.sha256 !== expected.sha256 || actual.size !== expected.size)
    throw new Error(`Bytes не совпадают с identity: ${expected.name}@${expected.version}`)
  return response
}

/** Формирует точные HTTP identity headers одного browser artifact. */
export function packageIdentityHeaders(identity: BrowserPackageIdentity) {
  return {
    "X-Package-Name": identity.name,
    "X-Package-Env": identity.env,
    "X-Package-Version": identity.version,
    "X-Package-SHA256": identity.sha256,
    "X-Package-Size": String(identity.size),
  }
}

export function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value)
}
