const targetId = Bun.argv[2]
const cdpPort = Number(Bun.env.METAFOR_DEV_CDP_PORT ?? 9222)

if (!targetId || !/^[0-9A-Fa-f]+$/.test(targetId))
  throw new Error("usage: bun arm-capture-drag.ts instrumented-target-id")
if (!Number.isInteger(cdpPort) || cdpPort <= 0)
  throw new Error(`Invalid CDP port ${cdpPort}`)

interface CdpTarget {
  id: string
  type: string
  webSocketDebuggerUrl?: string
}

interface CdpResponse {
  id?: number
  result?: unknown
  error?: {message?: string}
}

const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then(async (response) => {
  if (!response.ok) throw new Error(`CDP target list returned ${response.status}`)
  return await response.json() as CdpTarget[]
})
const target = targets.find((candidate) =>
  candidate.id === targetId && candidate.type === "page" && candidate.webSocketDebuggerUrl)
if (!target?.webSocketDebuggerUrl) throw new Error(`Page target is not present: ${targetId}`)

const socket = new WebSocket(target.webSocketDebuggerUrl)
const pending = new Map<number, {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}>()
let nextId = 1

socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data)) as CdpResponse
  if (message.id === undefined) return
  const request = pending.get(message.id)
  if (!request) return
  pending.delete(message.id)
  if (message.error) request.reject(new Error(message.error.message ?? "CDP command failed"))
  else request.resolve(message.result)
})

await new Promise<void>((resolve, reject) => {
  socket.addEventListener("open", () => resolve(), {once: true})
  socket.addEventListener("error", () => reject(new Error("CDP WebSocket failed to open")), {
    once: true,
  })
})

function command(method: string, params: Record<string, unknown>) {
  const id = nextId++
  return new Promise<unknown>((resolve, reject) => {
    pending.set(id, {resolve, reject})
    socket.send(JSON.stringify({id, method, params}))
  })
}

async function evaluate(expression: string) {
  const result = await command("Runtime.evaluate", {expression, returnByValue: true}) as {
    result?: {value?: unknown}
    exceptionDetails?: unknown
  }
  if (result.exceptionDetails) throw new Error(`Runtime evaluation failed: ${expression}`)
  return result.result?.value
}

async function dispatchMouse(
  type: "mousePressed" | "mouseMoved" | "mouseReleased",
  x: number,
  y: number,
  buttons: number,
) {
  await command("Input.dispatchMouseEvent", {
    type,
    x,
    y,
    button: "left",
    buttons,
    clickCount: 1,
  })
}

const ready = await evaluate(
  "Boolean(globalThis.webgpuInspector && document.querySelector('canvas'))",
)
if (ready !== true) throw new Error(`Target is not an instrumented canvas page: ${targetId}`)

const token = crypto.randomUUID()
await evaluate(`globalThis.__metaforCaptureTriggerToken=${JSON.stringify(token)};true`)
console.info(`armed capture trigger\ntarget: ${targetId}`)

try {
  for (let attempt = 1; attempt <= 250; attempt += 1) {
    const state = await evaluate(`JSON.stringify((()=>{
      const canvas=document.querySelector('canvas')
      const rect=canvas?.getBoundingClientRect()
      return {
        token:globalThis.__metaforCaptureTriggerToken,
        active:Boolean(globalThis.webgpuInspector?._localCaptureActive),
        points:rect?[[.39,.42],[.43,.445],[.47,.465],[.51,.485],[.55,.505]].map(
          ([px,py])=>({x:Math.round(rect.left+rect.width*px),y:Math.round(rect.top+rect.height*py)}),
        ):[],
      }
    })())`) as string
    const parsed = JSON.parse(state) as {
      token?: string
      active?: boolean
      points?: Array<{x: number; y: number}>
    }
    if (parsed.token !== token) process.exit(0)
    if (parsed.active) {
      const points = parsed.points ?? []
      if (points.length < 2) throw new Error("Instrumented canvas has no usable bounds")
      await dispatchMouse("mousePressed", points[0].x, points[0].y, 1)
      for (const point of points.slice(1))
        await dispatchMouse("mouseMoved", point.x, point.y, 1)
      const last = points.at(-1)!
      await dispatchMouse("mouseReleased", last.x, last.y, 0)
      await evaluate(`if(globalThis.__metaforCaptureTriggerToken===${JSON.stringify(token)})
        delete globalThis.__metaforCaptureTriggerToken;true`)
      console.info(`capture-triggered target=${targetId} attempt=${attempt}`)
      process.exit(0)
    }
    await Bun.sleep(40)
  }
  throw new Error("Capture was not armed within 10 seconds")
} finally {
  await evaluate(`if(globalThis.__metaforCaptureTriggerToken===${JSON.stringify(token)})
    delete globalThis.__metaforCaptureTriggerToken;true`).catch(() => {})
  socket.close()
}
