import {afterEach, describe, expect, test} from "bun:test"
import {closeForceChannel, force} from "boundary/force"
import type { Particle } from "@metafor/types/force/particle"
import {createDarkElectromagnetismForce} from "./index"

afterEach(() => {
  closeForceChannel()
})

describe("dark/em Force helpers", () => {
  test("emitGluonReplace публикует actor ID и value.fields[fieldId] без /field path", () => {
    const parts: Particle[] = []
    const subscription = force.entropy((event) => {
      parts.push(...event.data.parts)
    })

    try {
      const em = createDarkElectromagnetismForce()
      em.emitGluonReplace(17, 2, "request failed")

      expect(parts).toEqual([{
        part: "gluon",
        op: "replace",
        path: 17,
        value: {fields: {"2": "request failed"}},
      }])
      expect(JSON.stringify(parts)).not.toContain("/field/")
    } finally {
      subscription.close()
    }
  })

  test("emitHiggsReplace поддерживает actor ID и WIMP SRC как scope", () => {
    const parts: Particle[] = []
    const subscription = force.entropy((event) => {
      parts.push(...event.data.parts)
    })

    try {
      const em = createDarkElectromagnetismForce()
      em.emitHiggsReplace(17, 5, "native")
      em.emitHiggsReplace("zavx0z/linux", 5, {key: "mode", type: "enum"})

      expect(parts).toEqual([
        {
          part: "higgs",
          op: "replace",
          path: 17,
          value: {fields: {"5": "native"}},
        },
        {
          part: "higgs",
          op: "replace",
          path: "zavx0z/linux",
          value: {fields: {"5": {key: "mode", type: "enum"}}},
        },
      ])
      expect(JSON.stringify(parts)).not.toContain("/field/")
    } finally {
      subscription.close()
    }
  })
})
