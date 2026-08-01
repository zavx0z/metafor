import {describe, expect, test} from "bun:test"
import type {Part} from "shared/protocol/force/particle"
import {
  ForceStories,
  createForceStorySession,
  forceStoryModalText,
  formatForceStoryPatch,
} from "./ForceStories.ts"

const actualForceParts: readonly Part[] = [
  "inflaton",
  "graviton",
  "photon",
  "gluon",
  "higgs",
  "w+",
  "w-",
  "z",
]

describe("Force Stories catalog", () => {
  test("owns one separate card and prepared scene for every Force particle", () => {
    expect(ForceStories.map((story) => story.part)).toEqual([...actualForceParts])
    expect(new Set(ForceStories.map((story) => story.part)).size).toBe(
      actualForceParts.length,
    )
    expect(new Set(ForceStories.map((story) => story.preparedScene.id)).size).toBe(
      actualForceParts.length,
    )
    expect(new Set(ForceStories.map((story) => story.preparedScene.atomId)).size).toBe(
      actualForceParts.length,
    )
    for (const story of ForceStories) {
      expect(story.patch.part).toBe(story.part)
      expect(story.preparedScene.initialState).toBe("idle")
    }
  })

  test("keeps every modal concrete and card-specific", () => {
    const modalTexts = ForceStories.map(forceStoryModalText)
    expect(new Set(modalTexts).size).toBe(actualForceParts.length)
    for (const [index, story] of ForceStories.entries()) {
      const text = modalTexts[index]!
      expect(text).toContain(story.part)
      expect(text).toContain(formatForceStoryPatch(story))
      expect(text).toContain(String(story.preparedScene.atomId))
      expect(text).toContain(story.expectedVisualOutcome)
      expect(text).not.toContain("как пользоваться")
      expect(text).not.toContain("Storybook")
    }
  })

  test("applies the real Photon state change and restarts the exact prepared scene", () => {
    const photon = ForceStories.find((story) => story.part === "photon")!
    const session = createForceStorySession(photon)
    const prepared = session.snapshot()

    expect(prepared.phase).toBe("prepared")
    expect(prepared.currentState).toBe("idle")

    const applied = session.apply()
    expect(applied.phase).toBe("applied")
    expect(applied.change).toEqual({
      changed: true,
      affectedAtomIds: [photon.preparedScene.atomId],
      facet: "current-state",
      structural: false,
    })
    expect(applied.currentState).toBe("ready")

    const restarted = session.restart()
    expect(restarted.phase).toBe("prepared")
    expect(restarted.currentState).toBe("idle")
    expect(restarted.projection).toEqual(prepared.projection)
  })

  test("leaves all non-Photon outcomes as explicit templates", () => {
    const templates = ForceStories.filter((story) => story.part !== "photon")
    expect(templates).toHaveLength(actualForceParts.length - 1)
    for (const story of templates) {
      expect(story.status).toBe("template")
      expect(story.expectedVisualOutcome).toMatch(
        /не подтвержден|не проверен|требует отдельной подтверждённой fixture/,
      )
    }
  })

  test("contains no timeline player controls", async () => {
    const lab = await Bun.file(
      new URL("./ForceStoriesLab.ts", import.meta.url),
    ).text()
    for (const forbidden of [
      "Pause",
      "Timeline",
      "Queue",
      "Forward",
      "Back",
      "Replay",
      "Пауза",
      "Таймлайн",
      "Очередь",
    ]) {
      expect(lab).not.toContain(`>${forbidden}<`)
      expect(lab).not.toContain(`\"${forbidden}\"`)
    }
  })
})
