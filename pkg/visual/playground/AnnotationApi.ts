import {file} from "bun"
import {mkdir, readdir} from "node:fs/promises"
import {join} from "node:path"
import {
  parseVisualAnnotationDraft,
  type StoredVisualAnnotation,
} from "./Annotation.ts"

const MAX_REQUEST_BYTES = 16 * 1024 * 1024
const MAX_METADATA_BYTES = 4 * 1024 * 1024
const MAX_PNG_BYTES = 12 * 1024 * 1024
const ANNOTATION_ID = /^[a-z0-9-]+$/

const json = (value: unknown, status = 200): Response =>
  Response.json(value, {
    status,
    headers: {"cache-control": "no-store"},
  })

const annotationId = (): string =>
  `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`

const readStored = async (
  directory: string,
  name: string,
): Promise<StoredVisualAnnotation | null> => {
  const source = Bun.file(join(directory, `${name}.json`))
  if (!await source.exists()) return null
  try {
    return JSON.parse(await source.text()) as StoredVisualAnnotation
  } catch {
    return null
  }
}

const imageResponse = async (
  directory: string,
  name: string,
): Promise<Response> => {
  const image = file(join(directory, `${name}.png`))
  if (!await image.exists()) return json({error: "annotation_not_found"}, 404)
  return new Response(image, {
    headers: {
      "cache-control": "no-store",
      "content-type": "image/png",
    },
  })
}

export const createVisualAnnotationApi = (
  directory: string,
): ((request: Request) => Promise<Response | null>) =>
  async (request) => {
    const url = new URL(request.url)
    const path = url.pathname

    if (request.method === "POST" && path === "/api/annotations") {
      const contentLength = Number(request.headers.get("content-length") ?? 0)
      if (contentLength > MAX_REQUEST_BYTES) {
        return json({error: "payload_too_large"}, 413)
      }
      let form: FormData
      try {
        form = await request.formData()
      } catch {
        return json({error: "invalid_multipart"}, 400)
      }
      const metadataSource = form.get("metadata")
      const image = form.get("image")
      if (
        typeof metadataSource !== "string" ||
        new TextEncoder().encode(metadataSource).byteLength > MAX_METADATA_BYTES ||
        !(image instanceof Blob) ||
        image.type !== "image/png" ||
        image.size <= 0 ||
        image.size > MAX_PNG_BYTES
      ) {
        return json({error: "invalid_annotation_payload"}, 400)
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(metadataSource)
      } catch {
        return json({error: "invalid_annotation_json"}, 400)
      }
      const draft = parseVisualAnnotationDraft(parsed)
      if (draft === null) return json({error: "invalid_annotation_contract"}, 400)

      await mkdir(directory, {recursive: true})
      const id = annotationId()
      const stored: StoredVisualAnnotation = {
        ...draft,
        id,
        pngBytes: image.size,
        pngUrl: `/api/annotations/${id}.png`,
      }
      await Promise.all([
        Bun.write(join(directory, `${id}.json`), `${JSON.stringify(stored, null, 2)}\n`),
        Bun.write(join(directory, `${id}.png`), image),
        Bun.write(join(directory, "latest.json"), `${JSON.stringify(stored, null, 2)}\n`),
        Bun.write(join(directory, "latest.png"), image),
      ])
      return json(stored, 201)
    }

    if (request.method === "GET" && path === "/api/annotations") {
      await mkdir(directory, {recursive: true})
      const names = (await readdir(directory))
        .filter((name) => name.endsWith(".json") && name !== "latest.json")
        .map((name) => name.slice(0, -5))
        .filter((name) => ANNOTATION_ID.test(name))
        .sort()
        .reverse()
        .slice(0, 100)
      const records = (await Promise.all(names.map((name) => readStored(directory, name))))
        .filter((record): record is StoredVisualAnnotation => record !== null)
      return json(records)
    }

    if (
      request.method === "GET" &&
      (path === "/api/annotations/latest" || path === "/api/capture/latest.json")
    ) {
      const stored = await readStored(directory, "latest")
      return stored === null
        ? json({error: "annotation_not_found"}, 404)
        : json(stored)
    }
    if (
      request.method === "GET" &&
      (path === "/api/annotations/latest.png" || path === "/api/capture/latest")
    ) {
      return await imageResponse(directory, "latest")
    }

    const match = /^\/api\/annotations\/([a-z0-9-]+)(\.png)?$/.exec(path)
    if (request.method === "GET" && match) {
      const id = match[1]!
      if (!ANNOTATION_ID.test(id)) return json({error: "annotation_not_found"}, 404)
      if (match[2] === ".png") return await imageResponse(directory, id)
      const stored = await readStored(directory, id)
      return stored === null
        ? json({error: "annotation_not_found"}, 404)
        : json(stored)
    }

    return null
  }
