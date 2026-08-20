import {afterEach, describe, expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {startPlaygroundServer} from "./server.ts"

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, {recursive: true, force: true})))
})

describe("@ui/playground server", () => {
  test("serves a browser entry named client.ts through the public /entry.js route", async () => {
    const root = await mkdtemp(join(tmpdir(), "ui-playground-server-"))
    temporaryRoots.push(root)
    const entrypoint = join(root, "client.ts")
    const stylePath = join(root, "style.css")
    const fontPath = join(root, "font.ttf")
    await Promise.all([
      Bun.write(entrypoint, 'document.documentElement.dataset.sharedEntry = "ready"'),
      Bun.write(stylePath, "html { background: black }"),
      Bun.write(fontPath, new Uint8Array([0, 1, 2, 3])),
    ])
    const server = startPlaygroundServer({
      packageName: "@ui/playground",
      hostname: "127.0.0.1",
      port: 0,
      entrypoint,
      stylePath,
      fontPath,
    })

    try {
      const html = await fetch(server.url).then((response) => response.text())
      expect(html).toContain("<title>@ui/playground</title>")
      expect(html).not.toContain("fixture")
      const response = await fetch(new URL("/entry.js", server.url))
      const source = await response.text()
      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toContain("text/javascript")
      expect(source).toContain("sharedEntry")
      expect(source).not.toContain("entry.js was not emitted")
      expect(source).not.toContain("<!doctype html>")
    } finally {
      server.stop(true)
    }
  })
})
