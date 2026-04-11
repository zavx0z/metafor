import { describe, expect, test } from "bun:test"
import {
  TEXT_COVER_FACE_STATE,
  TEXT_STENCIL_BACK_FACE_STATE,
  TEXT_STENCIL_FACE_STATE,
} from "./text-stencil"

describe("text stencil config", () => {
  test("text stencil сохраняет winding mask до cover-pass", () => {
    expect(TEXT_STENCIL_FACE_STATE.passOp).toBe("increment-wrap")
    expect(TEXT_STENCIL_BACK_FACE_STATE.passOp).toBe("decrement-wrap")
  })

  test("text cover очищает stencil после заливки glyph", () => {
    expect(TEXT_COVER_FACE_STATE.compare).toBe("not-equal")
    expect(TEXT_COVER_FACE_STATE.passOp).toBe("zero")
  })
})
