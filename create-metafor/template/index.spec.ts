import { describe, it, expect } from "bun:test"
import { parse } from "./index.ts"

describe("parse", () => {
  it("параметры", () => {
    type state = "offline" | "online"
    // #region params
    const result = parse<
      { attempt: { type: "number"; default: 0; required: true } },
      { ice: { url: { type: "string" } }[] },
      state
    >(
      ({ html, value, update, mass, state }) => html`
        <h1>Config</h1>
        <ul>
          ${mass.ice.map((server) => html`<li>Url: ${server.url}</li>`)}
        </ul>
        <h1>State</h1>
        <p>${state}</p>
        ${state === "offline" &&
        html` <button onclick=${() => update({ attempt: value.attempt + 1 })}>Connect</button>`}
      `,
    )
    // #endregion params
    expect(result).toBeDefined()
  })
  it("парсит простой HTML с переменными", () => {
    const result = parse(
      ({ html, value }) => html`
        <div class="${value.userStatus}">
          <h1>Hello ${value.userName}!</h1>
          <p>You have ${value.messageCount} messages</p>
        </div>
      `,
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
      ({ html, value }) => html`
        <ul>
          ${value.usersList}
        </ul>
      `,
    )

    expect(result).toHaveLength(1)
    const ul = result[0] as any
    expect(ul.type).toBe("el")
    expect(ul.tag).toBe("ul")

    const textNode = ul.child[0]
    expect(textNode).toMatchObject({
      type: "text",
      data: "/value/usersList",
    })
  })

  it("парсит HTML с условиями", () => {
    const result = parse(
      ({ html, value }) => html`
        <div>${value.isAdmin ? html` <button>Admin Panel</button> ` : html` <span>Access denied</span> `}</div>
      `,
    )

    expect(result).toHaveLength(1)
    const div = result[0] as any
    expect(div.type).toBe("el")
    expect(div.tag).toBe("div")

    const conditionNode = div.child[0]
    expect(conditionNode).toMatchObject({
      type: "cond",
      data: "/value/isAdmin",
    })

    const trueBranch = conditionNode.child[0]
    expect(trueBranch).toMatchObject({
      type: "el",
      tag: "button",
    })

    const falseBranch = conditionNode.child[1]
    expect(falseBranch).toMatchObject({
      type: "el",
      tag: "span",
    })
    expect(falseBranch.child[0]).toMatchObject({
      type: "text",
      value: "Access denied",
    })
  })

  it("сохраняет границу многосоставных ветвей условия", () => {
    const result = parse<{}, {}, "idle" | "ready">(
      ({html, state}) => html`${state === "ready"
        ? html`<meta-for src="demo/one" /><meta-for src="demo/two" />`
        : html`<meta-for src="demo/three" /><meta-for src="demo/four" />`}`,
    )

    expect(result).toEqual([{
      type: "cond",
      data: "/state",
      expr: "_[0] === \"ready\"",
      elseIndex: 2,
      child: [
        {tag: "meta-for", type: "meta", src: "demo/one"},
        {tag: "meta-for", type: "meta", src: "demo/two"},
        {tag: "meta-for", type: "meta", src: "demo/three"},
        {tag: "meta-for", type: "meta", src: "demo/four"},
      ],
    }])
  })

  it("парсит HTML с событиями и динамическими атрибутами", () => {
    const result = parse(
      ({ html, value }) => html`
        <button class="${value.isActive ? "active" : ""}" disabled="${!value.canEdit}">${value.buttonText}</button>
      `,
    )

    expect(result).toHaveLength(1)
    const button = result[0] as any
    expect(button).toMatchObject({
      type: "el",
      tag: "button",
    })

    expect(button.string.class).toMatchObject({
      data: "/value/isActive",
      expr: '${_[0] ? "active" : ""}',
    })

    expect(button.string.disabled).toMatchObject({
      data: "/value/canEdit",
      expr: "${!_[0]}",
    })

    expect(button.child[0]).toMatchObject({
      type: "text",
      data: "/value/buttonText",
    })
  })

  it("парсит статический HTML без переменных", () => {
    const result = parse(
      ({ html }) => html`
        <div>
          <h1>Static Title</h1>
          <p>Static content</p>
        </div>
      `,
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
    const result = parse(({ html, value }) => html` <div class="dashboard">${value.departmentsList}</div> `)

    expect(result).toHaveLength(1)
    const dashboard = result[0] as any
    expect(dashboard.type).toBe("el")
    expect(dashboard.tag).toBe("div")

    const textNode = dashboard.child[0]
    expect(textNode).toMatchObject({
      type: "text",
      data: "/value/departmentsList",
    })
  })
})
