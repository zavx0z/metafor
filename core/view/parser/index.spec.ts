import { describe, it, expect } from "bun:test"
import { parse } from "./index"

describe("parse", () => {
  it("парсит простой HTML с переменными", () => {
    const result = parse(
      ({ html, context }) => html`
        <div class="${context.userStatus}">
          <h1>Hello ${context.userName}!</h1>
          <p>You have ${context.messageCount} messages</p>
        </div>
      `
    )

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: "el",
      tag: "div",
    })

    const div = result[0] as any
    expect(div.child).toHaveLength(2)

    const h1 = div.child[0]
    expect(h1).toMatchObject({
      type: "el",
      tag: "h1",
    })

    const p = div.child[1]
    expect(p).toMatchObject({
      type: "el",
      tag: "p",
    })
  })

  it("парсит HTML с map операциями", () => {
    const result = parse(
      ({ html, context }) => html`
        <ul>
          ${context.usersList}
        </ul>
      `
    )

    expect(result).toHaveLength(1)
    const ul = result[0] as any
    expect(ul.type).toBe("el")
    expect(ul.tag).toBe("ul")

    const textNode = ul.child[0]
    expect(textNode).toMatchObject({
      type: "text",
      data: "/context/usersList",
    })
  })

  it("парсит HTML с условиями", () => {
    const result = parse(
      ({ html, context }) => html`
        <div>${context.isAdmin ? html` <button>Admin Panel</button> ` : html` <span>Access denied</span> `}</div>
      `
    )

    expect(result).toHaveLength(1)
    const div = result[0] as any
    expect(div.type).toBe("el")
    expect(div.tag).toBe("div")

    const conditionNode = div.child[0]
    expect(conditionNode).toMatchObject({
      type: "cond",
      data: "/context/isAdmin",
    })

    const trueBranch = conditionNode.true
    expect(trueBranch).toMatchObject({
      type: "el",
      tag: "button",
    })

    const falseBranch = conditionNode.false
    expect(falseBranch).toMatchObject({
      type: "el",
      tag: "span",
    })
    expect(falseBranch.child[0]).toMatchObject({
      type: "text",
      value: "Access denied",
    })
  })

  it("парсит HTML с событиями и динамическими атрибутами", () => {
    const result = parse(
      ({ html, context }) => html`
        <button class="${context.isActive ? "active" : ""}" disabled="${!context.canEdit}">
          ${context.buttonText}
        </button>
      `
    )

    expect(result).toHaveLength(1)
    const button = result[0] as any
    expect(button).toMatchObject({
      type: "el",
      tag: "button",
    })

    expect(button.string.class).toMatchObject({
      data: "/context/isActive",
      expr: '${0} ? "active" : ""',
    })

    expect(button.string.disabled).toMatchObject({
      data: "/context/canEdit",
      expr: "!${0}",
    })

    expect(button.child[0]).toMatchObject({
      type: "text",
      data: "/context/buttonText",
    })
  })

  it("парсит статический HTML без переменных", () => {
    const result = parse(
      ({ html }) => html`
        <div>
          <h1>Static Title</h1>
          <p>Static content</p>
        </div>
      `
    )

    expect(result).toHaveLength(1)
    const div = result[0] as any
    expect(div.type).toBe("el")
    expect(div.tag).toBe("div")
    expect(div.child).toHaveLength(2)

    const h1 = div.child[0]
    expect(h1).toMatchObject({
      type: "el",
      tag: "h1",
    })
    expect(h1.child[0]).toMatchObject({
      type: "text",
      value: "Static Title",
    })

    const p = div.child[1]
    expect(p).toMatchObject({
      type: "el",
      tag: "p",
    })
    expect(p.child[0]).toMatchObject({
      type: "text",
      value: "Static content",
    })
  })

  it("парсит вложенные map операции", () => {
    const result = parse(({ html, context }) => html` <div class="dashboard">${context.departmentsList}</div> `)

    expect(result).toHaveLength(1)
    const dashboard = result[0] as any
    expect(dashboard.type).toBe("el")
    expect(dashboard.tag).toBe("div")

    const textNode = dashboard.child[0]
    expect(textNode).toMatchObject({
      type: "text",
      data: "/context/departmentsList",
    })
  })
})
