import {expect, test} from "bun:test"
import {createDocument, ViewPointElement} from "@zavx0z/immersive"
import {createClientDiagnostics} from "./client-diagnostics"
import {isClientDiagnostics} from "../../../release/shared/clients"

test("diagnostics reads one detached public camera snapshot without presenting or changing its depth range", async () => {
  const document = createDocument(), viewPoint = new ViewPointElement(document)
  Object.assign(viewPoint, {x: -12.5, y: 25, z: 6000, targetX: 400, targetY: -20, targetZ: 10, fov: .8, near: .001, far: 100000})
  let reads = 0
  const unexpected = () => {throw new Error("Diagnostics must not request a projection, subscription or frame for this snapshot")}
  const presentation = {document, get viewPoint() {reads++; return viewPoint}, disposed: false, presentedFrame: 0,
    getProjection: unexpected, subscribePresented: unexpected, captureLastPresentedFramePng: unexpected}
  const diagnostics = createClientDiagnostics(presentation, {performance: null, observerFactory: null, viewport: () => ({width: 1200, height: 800, devicePixelRatio: 1})})
  try {
    const result = await diagnostics.diagnostics({}, new AbortController().signal)
    expect(reads).toBe(1)
    expect(result.camera).toEqual({position: {x: -12.5, y: 25, z: 6000}, target: {x: 400, y: -20, z: 10}, fov: .8, near: .001, far: 100000})
    expect(isClientDiagnostics(result)).toBe(true)
    viewPoint.x = 90
    viewPoint.near = 10
    expect(result.camera?.position.x).toBe(-12.5)
    expect(result.camera?.near).toBe(.001)
    const next = await diagnostics.diagnostics({}, new AbortController().signal)
    expect(next.camera?.position.x).toBe(90)
    expect(next.camera?.near).toBe(10)
    const {camera: _camera, ...legacy} = result
    expect(isClientDiagnostics(legacy)).toBe(true)
    expect(isClientDiagnostics({...result, camera: null})).toBe(true)
    expect(isClientDiagnostics({...result, camera: {...result.camera, near: Number.NaN}})).toBe(false)
    expect(isClientDiagnostics({...result, camera: {...result.camera, extra: 1}})).toBe(false)
  } finally {diagnostics.dispose()}
})
