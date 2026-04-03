import { describe, expect, test } from "bun:test"
import { Fuzzy, Macho, Wimp } from "@dark/strong"

describe("Fuzzy", () => {
  test("по умолчанию стартует в пустом рабочем состоянии", () => {
    const fuzzy = new Fuzzy()

    expect(fuzzy.value, "Fuzzy по умолчанию не должен иметь активную ветвь").toBeNull()
    expect(fuzzy.branch, "Fuzzy по умолчанию должен иметь пустую таблицу ветвей").toEqual(new Map())
    expect(fuzzy.children, "Fuzzy по умолчанию должен иметь пустой набор дочерних частиц").toEqual(new Set())
    expect(fuzzy.parent, "Fuzzy по умолчанию должен иметь явный `null` в `parent`").toBeNull()
  })

  test("хранит таблицу ветвей и выбранное значение", () => {
    const first = new Wimp({ src: "zavx0z/git-start", parent: null })
    const second = new Wimp({ src: "zavx0z/git-work", parent: null })
    const fuzzy = new Fuzzy({
      branch: new Map([
        [first, first],
        [second, second],
      ]),
    })

    expect((fuzzy as any).basis, "Fuzzy не должен хранить шаблонный `basis`").toBeUndefined()
    expect((fuzzy as any).expr, "Fuzzy не должен хранить шаблонный `expr`").toBeUndefined()
    expect(fuzzy.value, "активная ветвь по умолчанию не выбрана").toBeNull()
    expect(fuzzy.branch, "Fuzzy должен хранить таблицу ветвей").toEqual(
      new Map([
        [first, first],
        [second, second],
      ]),
    )

    expect(fuzzy.switch(first), "`switch` должен возвращать первую ветвь").toBe(first)
    expect(fuzzy.value, "`switch` должен обновлять выбранное значение").toBe(first)
    expect(fuzzy.switch(second), "`switch` должен возвращать вторую ветвь").toBe(second)
    expect(fuzzy.value, "`switch` должен обновлять выбранное значение на вторую ветвь").toBe(second)
    expect(fuzzy.switch(null), "`switch(null)` должен сбрасывать выбранное значение").toBeUndefined()
    expect(fuzzy.value, "`switch(null)` должен переводить Fuzzy в пустое состояние").toBeNull()
  })

  test("может хранить составную ветвь через Macho", () => {
    const particle = new Macho()
    const fuzzy = new Fuzzy({
      branch: new Map([[particle, particle]]),
    })

    expect((particle as any).basis, "Macho не должен хранить шаблонный `basis`").toBeUndefined()
    expect(fuzzy.switch(particle), "`switch` должен возвращать ветвь Macho").toBe(particle)
    expect(fuzzy.branch.get(particle), "таблица ветвей должна хранить Macho как частицу ветви").toBe(particle)
  })
})
