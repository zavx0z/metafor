import { describe, test, expect } from "bun:test"
import { View } from "../index.ts"

describe("динамические meta-теги в html-шаблонезаторе", () => {
  const hash = "child-243232"

  test("соответствие шаблонов (с контекстом)", () => {
    const parentMessage = "message"
    const parentCount = 0
    const view = new View()

    const template1 = view.html`<div>
      <h1>Родитель: ${parentMessage}</h1>
      <meta-${hash}
        context=${{
          message: parentMessage,
          count: parentCount,
        }}></meta-${hash}>
    </div>
    `

    // Хеш должен попасть в strings[2]
    expect(template1.strings[2]).toContain(`meta-${hash}`)
    // Два значения: текст в <h1> и объект контекста для атрибута
    expect(template1.values).toHaveLength(2)
  })

  test("соответствие шаблонов без контекста", () => {
    const parentMessage = "message"
    const view = new View()

    const template2 = view.html`<div>
      <h1>Родитель: ${parentMessage}</h1>
      <meta-${hash}></meta-${hash}>
    </div>`

    // Имя тега meta-<hash> должно быть слито с '>' без маркеров
    const hasCompactOpen = template2.strings.some((s) => s.includes(`meta-${hash}>`))
    expect(hasCompactOpen, "имя тега meta-<hash> должно быть слито с '>' без маркеров").toBe(true)
  })
})
