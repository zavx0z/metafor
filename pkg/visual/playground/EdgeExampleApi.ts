import {mkdir, readdir} from "node:fs/promises"
import {join} from "node:path"
import {
  parseEdgeExampleDraft,
  type StoredEdgeExample,
} from "./EdgeExample.ts"

const MAX_REQUEST_BYTES = 64 * 1024
const EXAMPLE_ID = /^[a-z0-9-]+$/

const json = (value: unknown, status = 200): Response =>
  Response.json(value, {
    status,
    headers: {"cache-control": "no-store"},
  })

const exampleId = (): string =>
  `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`

const readStored = async (
  directory: string,
  id: string,
): Promise<StoredEdgeExample | null> => {
  const source = Bun.file(join(directory, `${id}.json`))
  if (!await source.exists()) return null
  try {
    return JSON.parse(await source.text()) as StoredEdgeExample
  } catch {
    return null
  }
}

export const createEdgeExampleApi = (
  directory: string,
): ((request: Request) => Promise<Response | null>) =>
  async (request) => {
    const path = new URL(request.url).pathname
    if (request.method === "POST" && path === "/api/edge-examples") {
      const contentLength = Number(request.headers.get("content-length") ?? 0)
      if (contentLength > MAX_REQUEST_BYTES) {
        return json({error: "payload_too_large"}, 413)
      }
      let parsed: unknown
      try {
        parsed = await request.json()
      } catch {
        return json({error: "invalid_example_json"}, 400)
      }
      const draft = parseEdgeExampleDraft(parsed)
      if (draft === null) {
        return json({error: "invalid_example_contract"}, 400)
      }
      await mkdir(directory, {recursive: true})
      const stored: StoredEdgeExample = {...draft, id: exampleId()}
      await Bun.write(
        join(directory, `${stored.id}.json`),
        `${JSON.stringify(stored, null, 2)}\n`,
      )
      return json(stored, 201)
    }

    if (request.method === "GET" && path === "/api/edge-examples") {
      await mkdir(directory, {recursive: true})
      const names = (await readdir(directory))
        .filter((name) => name.endsWith(".json"))
        .map((name) => name.slice(0, -5))
        .filter((name) => EXAMPLE_ID.test(name))
        .sort()
        .reverse()
        .slice(0, 100)
      const records = (
        await Promise.all(names.map((name) => readStored(directory, name)))
      ).filter((record): record is StoredEdgeExample => record !== null)
      return json(records)
    }

    const match = /^\/api\/edge-examples\/([a-z0-9-]+)$/.exec(path)
    if (request.method === "GET" && match) {
      const id = match[1]!
      if (!EXAMPLE_ID.test(id)) {
        return json({error: "edge_example_not_found"}, 404)
      }
      const stored = await readStored(directory, id)
      return stored === null
        ? json({error: "edge_example_not_found"}, 404)
        : json(stored)
    }

    return null
  }
