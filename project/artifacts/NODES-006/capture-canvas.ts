import {writeFileSync} from "node:fs"

const [targetId, output] = process.argv.slice(2)
if (targetId === undefined || output === undefined) {
  throw new Error("usage: bun capture-canvas.ts <targetId> <output.png>")
}

const response = await fetch("http://localhost:7880/eval", {
  method: "POST",
  headers: {"content-type": "application/json"},
  body: JSON.stringify({
    targetId,
    js: "return document.querySelector('canvas')?.toDataURL('image/png') ?? null",
  }),
})
if (!response.ok) throw new Error(`Chrome eval failed: ${response.status}`)
const payload = await response.json() as {result?: string; parsed?: string | null}
const dataUrl = typeof payload.parsed === "string" ? payload.parsed : payload.result
if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) {
  throw new Error("canvas data URL is unavailable")
}
writeFileSync(output, Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64"))
