import { describe, test, expect } from "bun:test"
import { View } from "../index.ts"
import { restoreViewFunction } from "../index.ts"

describe("View сериализация и восстановление", () => {
  test("полный цикл: сериализация и восстановление простой render-функции", () => {
    const originalView = new View({
      render: ({ context, html }) => html`
        <div>
          <h1>Title: ${context.title}</h1>
          <p>Description: ${context.description}</p>
        </div>
      `,
    })

    // Сериализуем
    const serialized = originalView.snapshot.render
    expect(serialized).toBeTruthy()
    expect(serialized).toContain("Title: ${context.title}")
    expect(serialized).toContain("Description: ${context.description}")

    // Восстанавливаем
    const restoredRenderFn = restoreViewFunction(serialized || "")
    const restoredView = new View({ render: restoredRenderFn })

    // Проверяем, что snapshot'ы совпадают
    expect(restoredView.snapshot.render).toBe(originalView.snapshot.render!)
  })

  test("полный цикл: сериализация и восстановление с динамическими meta-тегами", () => {
    // Имитируем ситуацию с внешними переменными
    const childHash = "child-abc123"
    const parentHash = "parent-def456"

    const originalView = new View({
      render: ({ context, html }) => html`
        <div>
          <h1>Parent Component</h1>
          <meta-${childHash}
            context=${{
              message: context.parentMessage,
              count: context.parentCount,
            }}></meta-${childHash}>
          <meta-${parentHash}
            context=${{ data: context.sharedData }}
          ></meta-${parentHash}>
        </div>
      `,
    })

    // Сериализуем
    const serialized = originalView.snapshot.render
    expect(serialized).toBeTruthy()
    expect(serialized).toContain("meta-child-abc123")
    expect(serialized).toContain("meta-parent-def456")
    expect(serialized).not.toContain("${childHash}")
    expect(serialized).not.toContain("${parentHash}")
    expect(serialized).not.toContain('${"child-abc123"}')
    expect(serialized).not.toContain('${"parent-def456"}')

    // Восстанавливаем
    const restoredRenderFn = restoreViewFunction(serialized || "")
    const restoredView = new View({ render: restoredRenderFn })

    // Проверяем, что восстановленная функция работает корректно
    expect(restoredView.snapshot.render).toBe(originalView.snapshot.render!)

    // Проверяем, что восстановленная функция работает корректно
    // Просто проверяем, что функции существуют и работают
    expect(typeof originalView.render).toBe("function")
    expect(typeof restoredView.render).toBe("function")
  })

  test("множественные динамические теги - полный цикл", () => {
    const tag1 = "component-111"
    const tag2 = "component-222"
    const tag3 = "component-333"

    const originalView = new View({
      render: ({ html }) => html`
        <section>
          <meta-${tag1} context=${{ id: 1 }}></meta-${tag1}>
          <div>
            <meta-${tag2} context=${{ id: 2 }}></meta-${tag2}>
            <meta-${tag3} context=${{ id: 3 }}></meta-${tag3}>
          </div>
        </section>
      `,
    })

    // Сериализуем
    const serialized = originalView.snapshot.render
    expect(serialized).toBeTruthy()
    expect(serialized).toContain("meta-component-111")
    expect(serialized).toContain("meta-component-222")
    expect(serialized).toContain("meta-component-333")

    // Проверяем, что все переменные заменены
    expect(serialized).not.toContain("${tag1}")
    expect(serialized).not.toContain("${tag2}")
    expect(serialized).not.toContain("${tag3}")

    // Восстанавливаем и проверяем
    const restoredRenderFn = restoreViewFunction(serialized || "")
    const restoredView = new View({ render: restoredRenderFn })
    expect(restoredView.snapshot.render).toBe(originalView.snapshot.render!)
  })

  test("сериализация без render-функции", () => {
    const view = new View({
      // Только style, без render
      style: ({ css }) => css`
        div {
          color: red;
        }
      `,
    })

    const serialized = view.snapshot.render
    expect(serialized).toBeUndefined()
  })

  test("комплексные выражения с динамическими тегами - полный цикл", () => {
    const componentId = "complex-component-xyz"

    const originalView = new View({
      render: ({ context, html }) => html`
        <div class="wrapper">
          <meta-${componentId}
            context=${{
              user: context.currentUser,
              settings: {
                theme: context.theme,
                lang: context.language,
              },
            }}
            data-id="${context.instanceId}"
            ?active=${context.isActive}
          ></meta-${componentId}>
          
          <p>Status: ${context.status}</p>
          <button @click=${context.onClick}>
            ${context.buttonText}
          </button>
        </div>
      `,
    })

    // Сериализуем
    const serialized = originalView.snapshot.render
    expect(serialized).toBeTruthy()
    expect(serialized).toContain("meta-complex-component-xyz")
    expect(serialized).not.toContain("${componentId}")
    expect(serialized).toContain("context.currentUser")
    expect(serialized).toContain("context.theme")
    expect(serialized).toContain("context.instanceId")
    expect(serialized).toContain("context.isActive")
    expect(serialized).toContain("context.status")
    expect(serialized).toContain("context.onClick")
    expect(serialized).toContain("context.buttonText")

    // Восстанавливаем и проверяем
    const restoredRenderFn = restoreViewFunction(serialized || "")
    const restoredView = new View({ render: restoredRenderFn })
    expect(restoredView.snapshot.render).toBe(originalView.snapshot.render!)
  })

  test("сравнение snapshot и serialize", () => {
    const childTag = "snapshot-child-999"

    const view = new View({
      render: ({ context, html }) => html`
        <div>
          <meta-${childTag} context=${{ value: context.data }}></meta-${childTag}>
        </div>
      `,
      style: ({ css }) => css`
        div {
          padding: 10px;
        }
      `,
    })

    const snapshot = view.snapshot

    expect(snapshot.render).toBeTruthy()
    expect(snapshot.style).toBeTruthy()

    // Snapshot содержит обработанные теги (теперь сериализация в snapshot)
    expect(snapshot.render).toContain("meta-snapshot-child-999")
    expect(snapshot.render).not.toContain("${childTag}")
  })
})
