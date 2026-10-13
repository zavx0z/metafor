import {PointerEvent, WheelEvent, KeyboardEvent, InputEvent, CompositionEvent} from "@zavx0z/immersive"
import {CapsuleRtcInputController, type CapsuleRtcInputSurface} from "@capsule/webrtc/input"
import type {InputCommand} from "@capsule/input/protocol"

/**
Binds the public Capsule input controller to the caller's semantic video and
borrowed authored sink in the same [Agent Display](./README.md). No event is
redispatched, no native global Document is used and no extra Element is created.
Space already supplies document-local pointer coordinates; the public local
layout rectangle maps those coordinates into the captured video. Remote native
input remains behind the granted RTC DataChannel. [Checks](./test/browser-input.test.ts).
*/
export function bindProviderBrowserInput(input: Readonly<{
  video: HTMLVideoElement
  sink: HTMLTextAreaElement
  send(command: InputCommand): boolean
}>) {
  const video = input.video
  const surface: CapsuleRtcInputSurface = {
    get videoWidth() {return video.videoWidth},
    get videoHeight() {return video.videoHeight},
    focus: options => video.focus(options),
    getBoundingClientRect: () => {
      const method: unknown = Reflect.get(video, "getLayoutRect")
      const local: DOMRect | null = typeof method === "function" ? Reflect.apply(method, video, []) : null
      return local ?? video.getBoundingClientRect()
    },
    addEventListener: (type, listener, options) => video.addEventListener(type, listener, options),
    removeEventListener: (type, listener, options) => video.removeEventListener(type, listener, options),
    setPointerCapture: pointer => video.setPointerCapture(pointer),
    releasePointerCapture: pointer => video.releasePointerCapture(pointer),
  }
  return new CapsuleRtcInputController({surface, send: input.send,
    context: {document: null, window: null, keyboardSink: input.sink, keyboardTarget: input.sink},
    eventConstructors: {PointerEvent, WheelEvent, KeyboardEvent, InputEvent, CompositionEvent},
  })
}
