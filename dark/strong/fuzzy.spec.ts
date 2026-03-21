import { describe, expect, test } from "bun:test"
import { Fuzzy, Macho, Wimp } from "@dark/strong"

describe("Fuzzy", () => {
  test("по умолчанию стартует в пустом runtime состоянии", () => {
    const fuzzy = new Fuzzy()

    expect(fuzzy.value, "Fuzzy по умолчанию не должен иметь активную ветвь").toBeNull()
    expect(fuzzy.branch, "Fuzzy по умолчанию должен иметь пустой branch registry").toEqual(new Map())
    expect(fuzzy.children, "Fuzzy по умолчанию должен иметь пустой children set").toEqual(new Set())
    expect(fuzzy.parent, "Fuzzy по умолчанию должен иметь явный null parent").toBeNull()
  })

  test("хранит branch map и active value", () => {
    const first = new Wimp({ src: "zavx0z/git-start", parent: null })
    const second = new Wimp({ src: "zavx0z/git-work", parent: null })
    const fuzzy = new Fuzzy({
      branch: new Map([
        [first.id, first],
        [second.id, second],
      ]),
    })

    expect((fuzzy as any).basis, "Fuzzy не должен хранить template basis").toBeUndefined()
    expect((fuzzy as any).expr, "Fuzzy не должен хранить template expr").toBeUndefined()
    expect(fuzzy.value, "активная ветвь по умолчанию не выбрана").toBeNull()
    expect(fuzzy.branch, "Fuzzy должен хранить branch map").toEqual(
      new Map([
        [first.id, first],
        [second.id, second],
      ]),
    )

    expect(fuzzy.switch(first.id), "switch должен возвращать первую ветвь").toBe(first)
    expect(fuzzy.value, "switch должен обновлять active value").toBe(first.id)
    expect(fuzzy.switch(second.id), "switch должен возвращать вторую ветвь").toBe(second)
    expect(fuzzy.value, "switch должен обновлять active value на вторую ветвь").toBe(second.id)
    expect(fuzzy.switch(null), "switch(null) должен сбрасывать active value").toBeUndefined()
    expect(fuzzy.value, "switch(null) должен переводить Fuzzy в пустое состояние").toBeNull()
  })

  test("может хранить составную ветвь через Macho", () => {
    const particle = new Macho()
    const fuzzy = new Fuzzy({
      branch: new Map([[particle.id, particle]]),
    })

    expect((particle as any).basis, "Macho runtime contract не должен хранить template basis").toBeUndefined()
    expect(fuzzy.switch(particle.id), "switch должен возвращать Macho-ветвь").toBe(particle)
    expect(fuzzy.branch.get(particle.id), "branch должна хранить Macho как particle ветви").toBe(particle)
  })
})
