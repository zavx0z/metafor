import { describe, test, expect } from "bun:test"
import { createStaticViewFunction, createStaticViewFunctionWithReplacements } from "../index"

describe("создание статических view функций", () => {
  test("заменяет один динамический тег на статический", () => {
    const originalView = ({ context, html }: any) => html`
      <div>
        <h1>Родитель: ${context.message}</h1>
        <metafor-${"childTag"} context=${context}></metafor-${"childTag"}>
      </div>
    `

    const staticView = createStaticViewFunction(originalView, "child-123")

    // Проверяем, что функция создалась
    expect(staticView, "функция должна быть создана").toBeInstanceOf(Function)

    // Проверяем, что функция работает
    const mockContext = { message: "test" }
    const mockHtml = (strings: any, ...values: any[]) => ({ strings, values })

    const result = staticView({
      context: mockContext,
      html: mockHtml,
    })

    // Проверяем, что в результате нет динамических тегов
    const templateString = result.strings.join("")
    expect(templateString, "шаблон не должен содержать динамические теги").not.toContain("${childTag}")
    expect(templateString, "шаблон должен содержать статический тег").toContain("metafor-child-123")
  })

  test("заменяет несколько динамических тегов на статические", () => {
    const parentTag = "parent-456"
    const childTag = "child-789"
    const originalView = ({ context, html }: any) => html`
      <div>
        <metafor-${parentTag}>
          <h1>Родитель: ${context.message}</h1>
          <metafor-${childTag} context=${context}></metafor-${childTag}>
        </metafor-${parentTag}>
      </div>
    `

    const staticView = createStaticViewFunctionWithReplacements(originalView, {
      parentTag,
      childTag,
    })

    // Проверяем, что функция создалась
    expect(staticView, "функция должна быть создана").toBeInstanceOf(Function)

    // Проверяем, что функция работает
    const mockContext = { message: "test" }
    const mockHtml = (strings: any, ...values: any[]) => ({ strings, values })

    const result = staticView({
      context: mockContext,
      html: mockHtml,
    })

    // Проверяем, что в результате нет динамических тегов
    const templateString = result.strings.join("")
    expect(templateString, "шаблон не должен содержать динамические теги").not.toContain("${parentTag}")
    expect(templateString, "шаблон не должен содержать динамические теги").not.toContain("${childTag}")
    expect(templateString, "шаблон должен содержать статические теги").toContain("metafor-parent-456")
    expect(templateString, "шаблон должен содержать статические теги").toContain("metafor-child-789")
  })

  test("сохраняет остальные переменные в шаблоне", () => {
    const originalView = ({ context, html }: any) => html`
      <div>
        <h1>${context.title}</h1>
        <metafor-${"childTag"} context=${context}></metafor-${"childTag"}>
        <p>${context.description}</p>
      </div>
    `

    const staticView = createStaticViewFunction(originalView, "child-123")

    const mockContext = { title: "Test", description: "Description" }
    const mockHtml = (strings: any, ...values: any[]) => ({ strings, values })

    const result = staticView({
      context: mockContext,
      html: mockHtml,
    })

    // Проверяем, что остальные переменные остались
    expect(result.values, "должны сохраниться остальные значения").toContain("Test")
    expect(result.values, "должны сохраниться остальные значения").toContain("Description")
  })
})
