import {promisify} from "node:util"
import {brotliCompress, constants} from "node:zlib"
import type {PackageBuildArtifact} from "../shared/contracts"

const compress = promisify(brotliCompress)
const compressedArtifacts = new Map<string, Promise<Uint8Array>>()

/** Отдаёт immutable identity как raw body либо negotiated Brotli transport. */
export async function artifactResponse(
  request: Request | undefined,
  artifact: PackageBuildArtifact,
  headers: Headers,
) {
  headers.set("Vary", appendVary(headers.get("Vary"), "Accept-Encoding"))
  if (!acceptsBrotli(request?.headers.get("Accept-Encoding")))
    return new Response(Bun.file(artifact.path), {headers})

  const body = await brotliArtifact(artifact)
  headers.set("Content-Encoding", "br")
  headers.set("Content-Length", String(body.byteLength))
  const payload = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer
  return new Response(payload, {headers})
}

/** Проверяет negotiated `br`, включая явный запрет через `q=0`. */
export function acceptsBrotli(value: string | null | undefined) {
  if (!value) return false
  let wildcard = 0
  for (const entry of value.split(",")) {
    const [coding = "", ...parameters] = entry.trim().toLowerCase().split(";")
    const quality = qualityValue(parameters)
    if (coding === "br") return quality > 0
    if (coding === "*") wildcard = quality
  }
  return wildcard > 0
}

async function brotliArtifact(artifact: PackageBuildArtifact) {
  const key = `${artifact.sha256}:${artifact.size}`
  let pending = compressedArtifacts.get(key)
  if (!pending) {
    pending = Bun.file(artifact.path).arrayBuffer().then(async (source) => {
      const encoded = await compress(new Uint8Array(source), {
        params: {
          [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
          [constants.BROTLI_PARAM_QUALITY]: 5,
        },
      })
      return new Uint8Array(encoded.buffer, encoded.byteOffset, encoded.byteLength)
    })
    compressedArtifacts.set(key, pending)
    void pending.catch(() => compressedArtifacts.delete(key))
  }
  return await pending
}

function qualityValue(parameters: string[]) {
  const parameter = parameters.find((item) => item.trim().startsWith("q="))
  if (!parameter) return 1
  const value = Number(parameter.trim().slice(2))
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0
}

function appendVary(current: string | null, value: string) {
  if (!current) return value
  const entries = current.split(",").map((entry) => entry.trim())
  return entries.some((entry) => entry.toLowerCase() === value.toLowerCase())
    ? current
    : `${current}, ${value}`
}
