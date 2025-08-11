import { describe, it, expect } from "bun:test"
import { View } from "../../index"

describe("Рендеринг массивов", () => {
  it("простой список", () => {
    const view = new View({
      render: ({ html }) =>
        html`<ul>
          <li>Item 1</li>
          <li>Item 2</li>
          <li>Item 3</li>
        </ul>`,
    })
    const container = document.createElement("div")

    view.render({
      state: "initial",
      context: {},
      core: {},
      update: (() => {}) as any,
      element: container,
    })

    const ul = container.querySelector("ul")
    const lis = ul?.querySelectorAll("li")

    expect(lis?.length, "должно быть 3 элемента списка").toBe(3)
    expect(lis?.[0]?.textContent, "первый элемент должен быть Item 1").toBe("Item 1")
    expect(lis?.[1]?.textContent, "второй элемент должен быть Item 2").toBe("Item 2")
    expect(lis?.[2]?.textContent, "третий элемент должен быть Item 3").toBe("Item 3")
  })

  it("список с атрибутами", () => {
    const view = new View({
      render: ({ html }) =>
        html`<div><button class="active">Button 1</button><button class="inactive">Button 2</button></div>`,
    })
    const container = document.createElement("div")

    view.render({
      state: "initial",
      context: {},
      core: {},
      update: (() => {}) as any,
      element: container,
    })

    const div = container.querySelector("div")
    const buttons = div?.querySelectorAll("button")

    expect(buttons?.length, "должно быть 2 кнопки").toBe(2)

    expect(buttons?.[0]?.getAttribute("class"), "первая кнопка должна быть active").toBe("active")
    expect(buttons?.[1]?.getAttribute("class"), "вторая кнопка должна быть inactive").toBe("inactive")
  })

  it("вложенные элементы", () => {
    const view = new View({
      render: ({ html }) => html`<div><span>Text 1</span><span>Text 2</span></div>`,
    })
    const container = document.createElement("div")

    view.render({
      state: "initial",
      context: {},
      core: {},
      update: (() => {}) as any,
      element: container,
    })

    const div = container.querySelector("div")
    const spans = div?.querySelectorAll("span")

    expect(spans?.length, "должно быть 2 элемента").toBe(2)
    expect(spans?.[0]?.textContent, "первый элемент должен быть Text 1").toBe("Text 1")
    expect(spans?.[1]?.textContent, "второй элемент должен быть Text 2").toBe("Text 2")
  })

  it("пустой контейнер", () => {
    const view = new View({
      render: ({ html }) => html`<ul></ul>`,
    })
    const container = document.createElement("div")

    view.render({
      state: "initial",
      context: {},
      core: {},
      update: (() => {}) as any,
      element: container,
    })

    const ul = container.querySelector("ul")
    const lis = ul?.querySelectorAll("li")

    expect(lis?.length, "не должно быть элементов списка").toBe(0)
  })
  it("массив с интерполяцией из ядра", () => {
    const view = new View({
      render: ({ html, core }) =>
        html`<ul>
          ${core.list.map((item: { id: number; name: string }) => html`<li data-id="${item.id}">${item.name}</li>`)}
        </ul>`,
    })
    const container = document.createElement("div")

    view.render({
      state: "initial",
      context: {},
      core: {
        list: [
          { id: 1, name: "Item 1" },
          { id: 2, name: "Item 2" },
          { id: 3, name: "Item 3" },
        ],
      },
      update: (() => {}) as any,
      element: container,
    })

    const ul = container.querySelector("ul")
    const lis = ul?.querySelectorAll("li")

    expect(lis?.length, "должно быть 3 элемента списка").toBe(3)
    expect(lis?.[0]?.getAttribute("data-id"), "первый элемент должен быть Item 1").toBe("1")
    expect(lis?.[1]?.getAttribute("data-id"), "второй элемент должен быть Item 2").toBe("2")
    expect(lis?.[2]?.getAttribute("data-id"), "третий элемент должен быть Item 3").toBe("3")
    expect(lis?.[0]?.textContent, "первый элемент должен быть Item 1").toBe("Item 1")
    expect(lis?.[1]?.textContent, "второй элемент должен быть Item 2").toBe("Item 2")
    expect(lis?.[2]?.textContent, "третий элемент должен быть Item 3").toBe("Item 3")
  })
  it("массив с интерполяцией из ядра с вложенными элементами", () => {
    const view = new View({
      render: ({ html, core }) =>
        html`<ul>
          ${core.list.map(
            (item: { id: number; name: string }) => html`<li>
              <div>${item.id}</div>
              <span>${item.name}</span>
            </li>`
          )}
        </ul>`,
    })
    const container = document.createElement("div")

    view.render({
      state: "initial",
      context: {},
      core: {
        list: [
          { id: 1, name: "Item 1" },
          { id: 2, name: "Item 2" },
          { id: 3, name: "Item 3" },
        ],
      },
      update: (() => {}) as any,
      element: container,
    })

    const ul = container.querySelector("ul")
    const lis = ul?.querySelectorAll("li")

    expect(lis?.length, "должно быть 3 элемента списка").toBe(3)
    expect(lis?.[0]?.querySelector("div")?.textContent, "первый элемент должен быть Item 1").toBe("1")
    expect(lis?.[1]?.querySelector("div")?.textContent, "второй элемент должен быть Item 2").toBe("2")
    expect(lis?.[2]?.querySelector("div")?.textContent, "третий элемент должен быть Item 3").toBe("3")
    expect(lis?.[0]?.querySelector("span")?.textContent, "первый элемент должен быть Item 1").toBe("Item 1")
    expect(lis?.[1]?.querySelector("span")?.textContent, "второй элемент должен быть Item 2").toBe("Item 2")
    expect(lis?.[2]?.querySelector("span")?.textContent, "третий элемент должен быть Item 3").toBe("Item 3")
  })
  it("массив вложенный в массив", () => {
    const view = new View({
      render: ({ html, core }) =>
        html`<ul>
          ${core.list.map(
            (item: { id: number; children: { name: string }[] }) => html`<li>
              <div>${item.id}</div>
              ${item.children.map((child: { name: string }) => html`<span>${child.name}</span>`)}
            </li>`
          )}
        </ul>`,
    })
    const container = document.createElement("div")

    view.render({
      state: "initial",
      context: {},
      core: {
        list: [
          {
            id: 1,
            children: [{ name: "Item 1" }, { name: "Item 2" }],
          },
          {
            id: 2,
            children: [{ name: "Item 3" }, { name: "Item 4" }],
          },
          {
            id: 3,
            children: [{ name: "Item 5" }, { name: "Item 6" }],
          },
        ],
      },
      update: (() => {}) as any,
      element: container,
    })
    const ul = container.querySelector("ul")
    const lis = ul?.querySelectorAll("li")
    console.log(view.schema)
    expect(lis?.length, "должно быть 3 элемента списка").toBe(3)
    const li0 = lis?.[0]
    const li1 = lis?.[1]
    const li2 = lis?.[2]
    expect(li0?.querySelector("div")?.textContent, "первый элемент должен быть Item 1").toBe("1")
    expect(li1?.querySelector("div")?.textContent, "второй элемент должен быть Item 2").toBe("2")
    expect(li2?.querySelector("div")?.textContent, "третий элемент должен быть Item 3").toBe("3")
    const child0 = li0?.querySelectorAll("span")
    const child1 = li1?.querySelectorAll("span")
    const child2 = li2?.querySelectorAll("span")
    expect(child0?.[0]?.textContent, "первый элемент должен быть Item 1").toBe("Item 1")
    expect(child0?.[1]?.textContent, "второй элемент должен быть Item 2").toBe("Item 2")
    expect(child1?.[0]?.textContent, "первый элемент должен быть Item 3").toBe("Item 3")
    expect(child1?.[1]?.textContent, "второй элемент должен быть Item 4").toBe("Item 4")
    expect(child2?.[0]?.textContent, "первый элемент должен быть Item 5").toBe("Item 5")
    expect(child2?.[1]?.textContent, "второй элемент должен быть Item 6").toBe("Item 6")
  })
})
