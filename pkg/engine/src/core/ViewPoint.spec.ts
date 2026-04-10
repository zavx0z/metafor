import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { Vector3 } from "../math/Vector3"
import { ViewPoint } from "./ViewPoint"

type EventTargetStub = {
  addEventListener: () => void
  removeEventListener: () => void
}

const createEventTargetStub = (): EventTargetStub => ({
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
})

const createElementStub = (): HTMLElement => ({
  ...createEventTargetStub(),
  clientWidth: 1280,
  clientHeight: 720,
  style: {},
} as unknown as HTMLElement)

const getRadius = (viewPoint: ViewPoint): number =>
  new Vector3().subVectors(viewPoint.position, viewPoint.getTarget()).length()

describe("ViewPoint zoom", () => {
  const originalDocument = globalThis.document

  beforeEach(() => {
    ;(globalThis as { document?: Document }).document = createEventTargetStub() as unknown as Document
  })

  afterEach(() => {
    if (originalDocument === undefined) delete (globalThis as { document?: Document }).document
    else (globalThis as { document?: Document }).document = originalDocument
  })

  test("не вязнет на малой глубине при zoom-in", () => {
    const viewPoint = new ViewPoint({
      element: createElementStub(),
      near: 1,
      position: { x: 0.2, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 0 },
    })

    ;(viewPoint as unknown as { handleZoom(delta: number): void }).handleZoom(20)

    expect(getRadius(viewPoint)).toBeLessThan(0.18)
  })

  test("пускает камеру ближе старого жесткого минимума", () => {
    const viewPoint = new ViewPoint({
      element: createElementStub(),
      near: 1,
      position: { x: 0.2, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 0 },
    })

    ;(viewPoint as unknown as { handleZoom(delta: number): void }).handleZoom(100)

    expect(getRadius(viewPoint)).toBeLessThan(0.1)
  })

  test("выравнивает горизонт по мировой оси Z для программной навигации", () => {
    const viewPoint = new ViewPoint({
      element: createElementStub(),
      near: 1,
      position: { x: 0.2, y: -0.2, z: 0.2 },
      target: { x: 0, y: 0, z: 0 },
    })

    ;(viewPoint as unknown as { handleRotation(deltaX: number, deltaY: number): void }).handleRotation(0, 40)
    expect(viewPoint.getUp().z).toBeLessThan(0.999)

    viewPoint.alignUpToWorldZ()

    expect(viewPoint.getUp()).toEqual(new Vector3(0, 0, 1))
  })
})
