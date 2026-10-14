import {expect, test} from "bun:test"
import {createDocument, createSpaceElementFactories, DisplayElement, MouseEvent, ViewPointElement} from "@zavx0z/immersive"
import {Matrix4, Quaternion, Vector3} from "@zavx0z/immersive/engine"
import {createOfficeDisplayView} from "./office-display-view"

test("тот же Office Display следует камере, doubleclick приближает и возвращает pose, resize обновляет fit", async () => {
  const document = createDocument({elementFactories: createSpaceElementFactories()})
  const space = document.createElement("space")
  const viewPoint = document.createElement("viewpoint")
  const display = document.createElement("display")
  if (!(viewPoint instanceof ViewPointElement) || !(display instanceof DisplayElement)) throw new Error("Public semantic factories missing")
  document.append(space)
  space.append(viewPoint, display)
  viewPoint.y = -3000
  viewPoint.z = 2000
  viewPoint.targetX = viewPoint.targetY = viewPoint.targetZ = 0
  const listeners = new Set<(frame: number) => void>()
  const viewport = {width: 1200, height: 800}
  let time = 0, invalidates = 0, authoredRotation = ""
  const binding = createOfficeDisplayView({now: () => time})
  const root = {document, viewPoint,
    canvas: {getBoundingClientRect() {return {x: 0, y: 0, left: 0, top: 0, right: viewport.width, bottom: viewport.height, ...viewport, toJSON() {return viewport}}}},
    subscribePresented(listener: (frame: number) => void) {listeners.add(listener); return () => {listeners.delete(listener)}},
    invalidate() {invalidates++},
  }
  const geometry = {position: {x: 200, y: 100, z: 1800}, width: 900, height: 600}
  const pose = () => [viewPoint.x, viewPoint.y, viewPoint.z, viewPoint.targetX, viewPoint.targetY, viewPoint.targetZ]
  const pulse = async (next: number) => {time = next; for (const listener of listeners) listener(next); await Promise.resolve()}
  const distance = () => Math.hypot(viewPoint.x - geometry.position.x, viewPoint.y - geometry.position.y, viewPoint.z - geometry.position.z)
  try {
    binding.bind("chat", display, geometry, value => {authoredRotation = value})
    binding.attach(root)
    expect(listeners.size).toBe(1)
    const initial = pose(), originalDistance = distance()
    const rotation = authoredRotation.split(/\s+/).map(value => parseFloat(value))
    const quaternion = new Quaternion().setFromAxisAngle(new Vector3(rotation[0]!, rotation[1]!, rotation[2]!), rotation[3]!)
    const normal = new Vector3(0, 0, 1).applyMatrix4(new Matrix4().makeRotationFromQuaternion(quaternion))
    const facing = new Vector3(viewPoint.x - geometry.position.x, viewPoint.y - geometry.position.y, viewPoint.z - geometry.position.z).normalize()
    expect(normal.dot(facing)).toBeCloseTo(1, 6)
    display.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, cancelable: true}))
    await pulse(240)
    expect(distance()).toBeLessThan(originalDistance)
    for (const [index, value] of [viewPoint.targetX, viewPoint.targetY, viewPoint.targetZ].entries()) expect(value).toBeCloseTo(Object.values(geometry.position)[index]!, 5)
    const focusedDistance = distance()
    viewport.width = 400
    await pulse(241)
    await pulse(481)
    expect(distance()).toBeGreaterThan(focusedDistance)
    display.dispatchEvent(new MouseEvent("dblclick", {bubbles: true, cancelable: true}))
    await pulse(721)
    expect(pose()).toEqual(initial)
    expect(display.ownerDocument).toBe(document)
    expect(document.querySelectorAll("display")).toHaveLength(1)
    expect(invalidates).toBeGreaterThan(0)
  } finally {binding.dispose()}
  expect(listeners.size).toBe(0)
  const previousRotation = authoredRotation
  viewPoint.x += 100
  await pulse(1000)
  expect(authoredRotation).toBe(previousRotation)
})
