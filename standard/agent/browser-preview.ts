import {CapsuleRtcViewer, type CapsuleRtcViewerSnapshot, type CapsuleRtcViewerOptions} from "@capsule/webrtc/viewer"
import type {CapsuleRtcMediaController, CapsuleRtcMediaSnapshot} from "@capsule/webrtc/media"
import {mapCapturedPointerCommand} from "@capsule/webrtc/preview"
import type {InputCommand} from "@capsule/input/protocol"
import type {BrowserPeerDescription} from "@zavx0z/provider-tech-peer/browser-types"
import type {AtomBrowserConnection} from "./atom"
import {CapsuleMicrophoneController, type CapsuleMicrophoneSnapshot, type CapsuleMicrophoneControllerOptions} from "@capsule/web/microphone"
import {createProviderScreenshot, type ProviderScreenshotVideo} from "./provider-screenshot"
import type {CapsuleBrowserScreenshotProviderSnapshot, CapsuleScreenshotCanvasLike} from "@capsule/screenshot/browser"

/** A live viewer observation belongs to the UI grant, not to Provider canonical registry or model authentication. */
export type ProviderBrowserPreviewSnapshot = Readonly<{
  description: BrowserPeerDescription
  viewer: CapsuleRtcViewerSnapshot | null
  media: CapsuleRtcMediaSnapshot
  error: string | null
  controlReady: boolean
  microphone: CapsuleMicrophoneSnapshot | null
  screenshot?: CapsuleBrowserScreenshotProviderSnapshot | null
}>

/**
Uses the [assigned Provider browser grant](./README.md) and public Capsule Viewer.
The caller owns one MediaController for its retained semantic video Element.
This adapter owns only a viewer and the exclusive grant returned by connectBrowser;
closing either leaves native profiles, shared peer network and ACP untouched.
The actual Window origin is only a base for Viewer socket metadata. Socket and
ICE factories are injected, so no native HTTP endpoint or token is guessed or
requested. Signaling crosses Provider browser peer; media and input stay RTC.
[Checks](./test/browser-preview.test.ts) exercise real Viewer over injected transport.
*/
export async function connectProviderBrowserPreview(input: Readonly<{
  connection: AtomBrowserConnection
  media: CapsuleRtcMediaController
  origin: string
  signal: AbortSignal
  onState?(snapshot: ProviderBrowserPreviewSnapshot): void
  /** Public Viewer factory permits deterministic transport tests without native browser/model launch. */
  viewerFactory?(options: CapsuleRtcViewerOptions): CapsuleRtcViewer
  microphoneFactory?(options: CapsuleMicrophoneControllerOptions): CapsuleMicrophoneController
  screenshotVideoFactory?(): ProviderScreenshotVideo
  screenshotCanvasFactory?(): CapsuleScreenshotCanvasLike
}>) {
  if (input.signal.aborted) {
    await input.connection.client.close()
    input.signal.throwIfAborted()
  }
  const {client, binding} = input.connection
  const selection = {peerId: binding.remotePeerId, executorId: binding.executorId, signal: input.signal}
  let closed = false
  let viewer: CapsuleRtcViewer | undefined
  let viewerState: CapsuleRtcViewerSnapshot | null = null
  let microphone: CapsuleMicrophoneController | undefined
  let microphoneState: CapsuleMicrophoneSnapshot | null = null
  let description: BrowserPeerDescription | undefined
  let error: string | null = null
  let controlReady = false
  let screen: {width: number; height: number} | undefined
  let screenshot: ReturnType<typeof createProviderScreenshot> | undefined
  let screenshotState: CapsuleBrowserScreenshotProviderSnapshot | null = null
  let closing: Promise<void> | undefined
  const emit = () => {
    if (!closed && description) input.onState?.({description, viewer: viewerState, media: input.media.snapshot(), error, controlReady, microphone: microphoneState, screenshot: screenshotState})
  }
  const close = (): Promise<void> => {
    if (closing) return closing
    closed = true
    input.signal.removeEventListener("abort", abort)
    viewer?.close()
    screenshot?.close()
    input.media.clear()
    closing = Promise.allSettled([microphone?.close(), client.close()]).then(results => {
      const failure = results.find(result => result.status === "rejected")
      if (failure?.status === "rejected") throw failure.reason
    })
    return closing
  }
  const abort = () => {void close().catch(() => {})}
  input.signal.addEventListener("abort", abort, {once: true})
  try {
    description = await client.describe(selection)
    input.signal.throwIfAborted()
    if (!description.instanceId || !description.profile || typeof description.controlEnabled !== "boolean") throw new Error("Provider browser identity is unavailable")
    const current = description
    if (client.screenshotProvider) {
      const transport = client.screenshotProvider.bind(client)
      screenshot = createProviderScreenshot({instanceId: current.instanceId, origin: input.origin, signal: input.signal,
        socketFactory: () => transport({...selection, instanceId: current.instanceId, profile: current.profile}),
        ...(input.screenshotVideoFactory ? {videoFactory: input.screenshotVideoFactory} : {}),
        ...(input.screenshotCanvasFactory ? {canvasFactory: input.screenshotCanvasFactory} : {}),
        onState: state => {screenshotState = state; emit()},
      })
    }
    if (current.media?.microphoneTransport) {
      microphone = (input.microphoneFactory ?? (options => new CapsuleMicrophoneController(options)))({
        transport: current.media.microphoneTransport,
        audioEnabled: current.media.audio,
        onState: state => {
          microphoneState = state
          emit()
        },
      })
    }
    const iceServers = input.connection.iceServers.map(server => ({...server, urls: Array.isArray(server.urls) ? [...server.urls] : server.urls}))
    viewer = (input.viewerFactory ?? microphone?.createViewer ?? (options => new CapsuleRtcViewer(options)))({
      serverOrigin: input.origin,
      instanceId: current.instanceId,
      controlEnabled: current.controlEnabled,
      iceServers,
      preparePeer: async peer => {
        if (!microphone && current.media?.audio) peer.addTransceiver("audio", {direction: "recvonly"})
      },
      socketFactory: url => {
        const metadata = new URL(url)
        const viewerPeerId = metadata.searchParams.get("peer")
        if (metadata.searchParams.get("profile") !== current.instanceId || !viewerPeerId) throw new Error("Provider viewer identity mismatch")
        return client.socket({...selection, instanceId: current.instanceId, viewerPeerId})
      },
      onState: state => {
        viewerState = state
        if (state.controlStatus !== "open") controlReady = false
        emit()
      },
      onControlMessage: message => {
        if (message && typeof message === "object") {
          const value = message as Record<string, unknown>
          if (value.type === "controlStatus") controlReady = value.status === "open"
          if (value.type === "inputState" && value.status === "ready" && Number.isInteger(value.width) && Number.isInteger(value.height)
            && Number(value.width) > 0 && Number(value.height) > 0 && Number(value.width) <= 32768 && Number(value.height) <= 32768) {
            screen = {width: Number(value.width), height: Number(value.height)}
          }
        }
        emit()
      },
      onStream: stream => {
        if (closed) return
        void screenshot?.attach(stream).catch(failure => {
          if (closed) return
          error = failure instanceof Error ? failure.message : "Screenshot media attachment failed"
          emit()
        })
        void input.media.attach(stream as Parameters<CapsuleRtcMediaController["attach"]>[0]).then(emit, failure => {
          if (closed) return
          error = failure instanceof Error ? failure.message : "Remote media playback failed"
          emit()
        })
      },
    })
    viewer.connect()
    emit()
    return {
      snapshot: (): ProviderBrowserPreviewSnapshot => ({description: current, viewer: viewerState, media: input.media.snapshot(), error, controlReady, microphone: microphoneState, screenshot: screenshotState}),
      async toggleMicrophone(): Promise<void> {
        if (closed || !microphone) throw new Error("Provider microphone is unavailable")
        input.signal.throwIfAborted()
        await microphone.toggle()
      },
      sendTransient(command: InputCommand): boolean {
        if (closed || !current.controlEnabled || !controlReady || !viewer) return false
        const media = input.media.snapshot()
        return viewer.sendControl(screen ? mapCapturedPointerCommand(command, media.videoWidth, media.videoHeight, screen) : command)
      },
      async send(command: InputCommand): Promise<void> {
        if (closed || !current.controlEnabled || !controlReady) throw new Error("Provider browser control is unavailable")
        input.signal.throwIfAborted()
        const media = input.media.snapshot()
        await viewer!.sendControlAndWait(screen ? mapCapturedPointerCommand(command, media.videoWidth, media.videoHeight, screen) : command)
      },
      close,
    }
  } catch (failure) {
    await close().catch(() => {})
    throw failure
  }
}

export type ProviderBrowserPreview = Awaited<ReturnType<typeof connectProviderBrowserPreview>>
