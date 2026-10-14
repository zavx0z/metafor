import type {DisplayElement, Presentation} from "@zavx0z/immersive"
import {Matrix4, Quaternion, Vector3, ViewPoint, type ViewPointPose} from "@zavx0z/immersive/engine"

/** Мировая позиция центра и физический размер уже существующего Display, мм. */
export type OfficeDisplayGeometry = Readonly<{position: Readonly<{x: number; y: number; z: number}>; width: number; height: number}>
type Root = Pick<Presentation, "document" | "viewPoint" | "subscribePresented" | "invalidate"> & {
  canvas: Pick<Presentation["canvas"], "getBoundingClientRect">
}
type ActivationEvent = Pick<Event, "preventDefault" | "stopPropagation">
type Binding = {element: DisplayElement; geometry: OfficeDisplayGeometry; rotation: string; onRotation(value: string): void; click(event: ActivationEvent): void}
type Focus = {key: string; previous: ViewPointPose; direction: {x: number; y: number; z: number}; fitted: string}
const poseKey = (pose: ViewPointPose) => JSON.stringify(pose)

/**
 * Billboard и focus принадлежат существующему Presentation. Binding сохраняет
 * тот же Display/Document; кадры и ввод заимствуются у Root. Двойной клик меняет
 * только pose, повторный возвращает её; URL, выбор Atom и экземпляр Chat не меняются.
 * @see ../README.md; office-display-view.spec.ts.
 */
export function createOfficeDisplayView(options: Readonly<{now?: () => number; durationMs?: number; onFocusChange?: (key: string | null) => void}> = {}) {
  const now = options.now ?? (() => performance.now())
  const duration = options.durationMs ?? 240
  if (!Number.isFinite(duration) || duration < 0) throw new RangeError("Office focus duration must be non-negative")
  const bindings = new Map<string, Binding>()
  let root: Root | null = null, disposed = false
  let unsubscribeCamera = () => {}, unsubscribeFrame = () => {}
  let focus: Focus | null = null
  let motion: {from: ViewPointPose; to: ViewPointPose; started: number; written: string} | null = null
  let viewport = ""
  const pose = (): ViewPointPose => ({position: {x: root!.viewPoint.x, y: root!.viewPoint.y, z: root!.viewPoint.z},
    target: {x: root!.viewPoint.targetX, y: root!.viewPoint.targetY, z: root!.viewPoint.targetZ}})
  const basis = (geometry: OfficeDisplayGeometry, direction?: Focus["direction"]) => {
    const p = geometry.position
    const eye = direction ? new Vector3(p.x + direction.x, p.y + direction.y, p.z + direction.z)
      : new Vector3(root!.viewPoint.x, root!.viewPoint.y, root!.viewPoint.z)
    return new Matrix4().makeLookAt(eye, new Vector3(p.x, p.y, p.z)).invert()
  }
  const billboard = () => {
    if (!root || disposed) return
    root.document.transaction(() => {
      for (const binding of bindings.values()) {
        const p = binding.geometry.position, vp = root!.viewPoint
        if (Math.hypot(vp.x - p.x, vp.y - p.y, vp.z - p.z) < 1e-8) continue
        const quaternion = new Quaternion().setFromRotationMatrix(basis(binding.geometry))
        const angle = 2 * Math.acos(Math.max(-1, Math.min(1, quaternion.w)))
        const length = Math.hypot(quaternion.x, quaternion.y, quaternion.z)
        const rotation = length < 1e-8 ? "0 0 1 0rad" : `${quaternion.x / length} ${quaternion.y / length} ${quaternion.z / length} ${angle}rad`
        if (binding.rotation === rotation) continue
        binding.rotation = rotation
        binding.onRotation(rotation)
      }
    })
  }
  const write = (value: ViewPointPose) => {
    root!.document.transaction(() => {
      const vp = root!.viewPoint
      vp.x = value.position.x
      vp.y = value.position.y
      vp.z = value.position.z
      vp.targetX = value.target.x
      vp.targetY = value.target.y
      vp.targetZ = value.target.z
    })
    billboard()
    root!.invalidate()
  }
  const move = (to: ViewPointPose) => {
    if (!root) return
    motion = {from: pose(), to, started: now(), written: poseKey(pose())}
    if (duration === 0) {
      write(to)
      motion = null
      if (focus) focus.fitted = poseKey(pose())
    }
    root.invalidate()
  }
  const fittedPose = (binding: Binding, direction: Focus["direction"]) => {
    const {width, height} = root!.canvas.getBoundingClientRect()
    if (width <= 0 || height <= 0) return null
    const matrix = basis(binding.geometry, direction).elements, p = binding.geometry.position
    const corners = [-1, 1].flatMap(x => [-1, 1].map(y => ({
      x: p.x + matrix[0]! * x * binding.geometry.width / 2 + matrix[4]! * y * binding.geometry.height / 2,
      y: p.y + matrix[1]! * x * binding.geometry.width / 2 + matrix[5]! * y * binding.geometry.height / 2,
      z: p.z + matrix[2]! * x * binding.geometry.width / 2 + matrix[6]! * y * binding.geometry.height / 2,
    })))
    return ViewPoint.fitPoseForPoints(corners, direction, {fov: root!.viewPoint.fov, aspect: width / height})
  }
  const activate = (key: string, event?: ActivationEvent) => {
    const binding = bindings.get(key)
    if (!root || !binding || disposed) return
    event?.preventDefault()
    event?.stopPropagation()
    if (focus?.key === key) {
      const previous = focus.previous
      focus = null
      options.onFocusChange?.(null)
      move(previous)
    } else {
      const p = binding.geometry.position, current = pose()
      const direction = {x: current.position.x - p.x, y: current.position.y - p.y, z: current.position.z - p.z}
      if (Math.hypot(direction.x, direction.y, direction.z) < 1e-8) return
      const to = fittedPose(binding, direction)
      if (!to) return
      focus = {key, previous: current, direction, fitted: ""}
      options.onFocusChange?.(key)
      move(to)
    }
  }
  const frame = () => {
    if (!root || disposed) return
    if (motion) {
      if (poseKey(pose()) !== motion.written) {
        motion = null
        if (focus) focus.fitted = ""
      }
      else {
        const current = motion
        const elapsed = duration === 0 ? 1 : Math.min(1, Math.max(0, (now() - current.started) / duration))
        const amount = elapsed * elapsed * (3 - 2 * elapsed)
        const lerp = (a: ViewPointPose["position"], b: ViewPointPose["position"]) => ({x: a.x + (b.x - a.x) * amount,
          y: a.y + (b.y - a.y) * amount, z: a.z + (b.z - a.z) * amount})
        write(elapsed === 1 ? current.to : {position: lerp(current.from.position, current.to.position), target: lerp(current.from.target, current.to.target)})
        current.written = poseKey(pose())
        if (elapsed === 1) {
          motion = null
          if (focus) focus.fitted = current.written
        }
      }
    }
    const size = root.canvas.getBoundingClientRect(), nextViewport = `${size.width}:${size.height}`
    if (viewport && viewport !== nextViewport && focus?.fitted === poseKey(pose())) {
      const binding = bindings.get(focus.key), to = binding && fittedPose(binding, focus.direction)
      if (to) move(to)
    }
    viewport = nextViewport
    billboard()
  }
  return {
    attach(value: Root) {
      if (disposed) throw new Error("Office Display binding is disposed")
      if (root === value) return
      if (root) throw new Error("Office Displays already belong to a Presentation")
      if ([...bindings.values()].some(binding => binding.element.ownerDocument !== value.document)) throw new Error("Office Display belongs to another Document")
      root = value
      unsubscribeCamera = value.document.subscribeMutations(batch => {
        if (batch.records.some(record => record.target === value.viewPoint)) billboard()
      })
      unsubscribeFrame = value.subscribePresented(frame)
      frame()
    },
    focus(key: string) {if (focus?.key !== key) activate(key)},
    back(restore = true) {
      if (!focus) return
      const previous = focus.previous
      focus = null
      motion = null
      options.onFocusChange?.(null)
      if (restore && root && !disposed) move(previous)
    },
    bind(key: string, element: DisplayElement | null, geometry: OfficeDisplayGeometry, onRotation: (value: string) => void) {
      if (disposed) return
      if (element && (!key || ![geometry.width, geometry.height].every(value => Number.isFinite(value) && value > 0) ||
          !Object.values(geometry.position).every(Number.isFinite) || typeof onRotation !== "function")) throw new Error("Invalid Office Display geometry")
      if (element && root && element.ownerDocument !== root.document) throw new Error("Office Display belongs to another Document")
      const previous = bindings.get(key)
      if (previous?.element === element) {
        const changed = previous.geometry.width !== geometry.width || previous.geometry.height !== geometry.height ||
          previous.geometry.position.x !== geometry.position.x || previous.geometry.position.y !== geometry.position.y || previous.geometry.position.z !== geometry.position.z
        previous.geometry = geometry
        previous.onRotation = onRotation
        if (changed && root && focus?.key === key && focus.fitted === poseKey(pose())) {
          const to = fittedPose(previous, focus.direction)
          if (to) move(to)
        }
        billboard()
        return
      }
      if (previous) {
        previous.element.removeEventListener("dblclick", previous.click)
        bindings.delete(key)
      }
      if (!element) {
        if (focus?.key === key) {focus = null; motion = null; options.onFocusChange?.(null)}
        return
      }
      const binding: Binding = {element, geometry, rotation: "", onRotation, click: event => activate(key, event)}
      bindings.set(key, binding)
      element.addEventListener("dblclick", binding.click)
      billboard()
    },
    dispose() {
      if (disposed) return
      disposed = true
      unsubscribeCamera()
      unsubscribeFrame()
      for (const binding of bindings.values()) {
        binding.element.removeEventListener("dblclick", binding.click)
      }
      bindings.clear()
      motion = null
      focus = null
      root = null
    },
  }
}
