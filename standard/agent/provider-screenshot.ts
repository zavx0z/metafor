import {CapsuleBrowserScreenshotProvider, type CapsuleBrowserScreenshotProviderOptions, type CapsuleScreenshotVideoLike} from "@capsule/screenshot/browser"

/** Capture-only decoder того же RTC stream. Он не размещается в Document и не создаёт UI или дополнительный viewer. */
export interface ProviderScreenshotVideo extends CapsuleScreenshotVideoLike {
  srcObject: unknown
  autoplay: boolean
  muted: boolean
  playsInline: boolean
  play(): Promise<void>
  pause(): void
}

/** Public Capsule PNG provider живёт только в активном grant; socket назначает Provider, не URL caller. */
export function createProviderScreenshot(input: Readonly<{
  instanceId: string
  origin: string
  signal: AbortSignal
  socketFactory: NonNullable<CapsuleBrowserScreenshotProviderOptions["socketFactory"]>
  videoFactory?: (() => ProviderScreenshotVideo) | undefined
  canvasFactory?: CapsuleBrowserScreenshotProviderOptions["canvasFactory"]
  onState?: CapsuleBrowserScreenshotProviderOptions["onState"]
}>) {
  input.signal.throwIfAborted()
  const video = input.videoFactory?.() ?? globalThis.document.createElement("video")
  video.autoplay = true
  video.muted = true
  video.playsInline = true
  let closed = false
  const provider = new CapsuleBrowserScreenshotProvider({serverOrigin: input.origin, instanceId: input.instanceId, video,
    socketFactory: input.socketFactory, ...(input.canvasFactory ? {canvasFactory: input.canvasFactory} : {}),
    ...(input.onState ? {onState: input.onState} : {})})
  const close = () => {
    if (closed) return
    closed = true
    input.signal.removeEventListener("abort", close)
    provider.close()
    video.pause()
    video.srcObject = null
  }
  input.signal.addEventListener("abort", close, {once: true})
  try {provider.connect()} catch (error) {close(); throw error}
  return {snapshot: () => provider.snapshot(), close, async attach(stream: unknown) {
    if (closed) throw new Error("Provider screenshot grant is closed")
    input.signal.throwIfAborted()
    video.srcObject = stream as typeof video.srcObject
    await video.play()
    if (closed) {video.pause(); video.srcObject = null; throw new Error("Provider screenshot grant is closed")}
    input.signal.throwIfAborted()
  }}
}
