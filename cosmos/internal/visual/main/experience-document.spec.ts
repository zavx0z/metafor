import {expect, test} from "bun:test"
import {createDocument} from "@zavx0z/dom"
import {createMainExperienceDocument} from "./experience-document.ts"

test("main plane and HUD overlay keep distinct roots in one Experience Document", () => {
  const experience = createMainExperienceDocument()
  const overlay = experience.document.createElement("aside")

  experience.mountOverlay(overlay)

  expect(experience.document.documentElement).toBe(experience.root)
  expect(experience.surface.ownerDocument).toBe(experience.document)
  expect(overlay.ownerDocument).toBe(experience.document)
  expect(experience.surface.parentNode).toBe(experience.root)
  expect(overlay.parentNode).toBe(experience.root)
  expect(experience.surface).not.toBe(overlay)

  const foreign = createDocument().createElement("aside")
  expect(() => experience.mountOverlay(foreign)).toThrow("another Document")
  expect(foreign.parentNode).toBeNull()
})
