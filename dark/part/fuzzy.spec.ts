import { describe, expect, test } from "bun:test"

import { Fuzzy, Macho, Wimp } from "@dark/part"

describe("Fuzzy", () => {
  test("хранит branch map и active value", () => {
    const first = new Wimp("zavx0z/git-start")
    const second = new Wimp("zavx0z/git-work")
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
    const particle = new Macho({ basis: "items" })
    const fuzzy = new Fuzzy({
      branch: new Map([[particle.id, particle]]),
    })

    expect(fuzzy.switch(particle.id), "switch должен возвращать Macho-ветвь").toBe(particle)
    expect(fuzzy.branch.get(particle.id), "branch должна хранить Macho как particle ветви").toBe(particle)
  })
})
