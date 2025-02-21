import {AttributePart, ChildPart, html, noChange, nothing, render} from "../../html.js"
import {beforeEach, describe, expect, test} from "bun:test"
import {directive, Directive, PartType} from "../../directive.js"
import {until} from "../../directives/until.js"
import type {DirectiveParameters, PartInfo} from "../../types/directives.js"
import {repeat} from "../../directives/repeat.js"
import type {CompiledTemplateResult, RenderOptions, TemplateResult} from "../../types/html.js"
import type {Part} from "../../types/part.js"


describe("директивы", () => {
  let container: HTMLDivElement
  beforeEach(() => {
    container = document.createElement("div")
    container.id = "container"
  })
  const assertContent = (expected: string) => expect(container.innerHTML).toMatchStringHTMLStripComments(expected)
  const assertRender = (r: TemplateResult | CompiledTemplateResult, expected: string, options?: RenderOptions) => {
    const part = render(r, container, options)
    expect(container.innerHTML).toMatchStringHTMLStripComments(expected)
    return part
  }

  class FireEventDirective extends Directive {
    render() {
      return nothing
    }

    override update(part: AttributePart) {
      part.element.dispatchEvent(new CustomEvent("test-event", {bubbles: true, composed: true}))
      return nothing
    }
  }

  const fireEvent = directive(FireEventDirective)

  // A stateful directive
  class CountDirective extends Directive {
    count = 0

    render(id: string, log?: string[]) {
      const v = `${id}:${++this.count}`
      if (log !== undefined) {
        log.push(v)
      }
      return v
    }
  }

  const count = directive(CountDirective)

  test("отрисовка директив в ChildParts", () => {
    class TestDirective extends Directive {
      render(v: string) {
        return html`
          TEST:${v}
        `
      }
    }

    const testDirective = directive(TestDirective)

    render(
      html`
        <div>${testDirective("A")}</div>
      `,
      container
    )
    assertContent("<div>TEST:A</div>")
  })

  test("PartInfo включает метаданные для директивы в ChildPart", () => {
    let partInfo: PartInfo
    const testDirective = directive(
      class extends Directive {
        constructor(info: PartInfo) {
          super(info)
          partInfo = info
        }

        render(v: unknown) {
          return v
        }
      }
    )
    render(
      html`
        <div>${testDirective("test")}</div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div>test</div>")
    expect(partInfo!.type).toBe(PartType.CHILD)
  })

  describe("инварианты ChildPart для parentNode, startNode, endNode", () => {
    // Позволяет получить ссылку на экземпляр директивы
    let currentDirective: CheckNodePropertiesBehavior

    class CheckNodePropertiesBehavior extends Directive {
      part?: ChildPart

      render(_parentId?: string, _done?: (err?: unknown) => void) {
        return nothing
      }

      override update(part: ChildPart, [parentId, done]: DirectiveParameters<this>) {
        this.part = part
        // eslint-disable-next-line
        currentDirective = this
        try {
          const {parentNode, startNode, endNode} = part

          if (endNode !== null) {
            expect(startNode).not.toBeNull()
          }

          if (startNode === null) {
            // The part covers all children in `parentNode`.
            expect(parentNode.childNodes.length).toBe(0)
            expect(endNode).toBeNull()
          } else if (endNode === null) {
            // The part covers all siblings following `startNode`.
            expect(startNode.nextSibling).toBeNull()
          } else {
            // The part covers all siblings between `startNode` and `endNode`.
            expect(startNode.nextSibling).toBe(endNode)
          }

          if (parentId !== undefined) {
            expect((parentNode as HTMLElement).id).toBe(parentId)
          }
          done?.()
        } catch (e) {
          if (done === undefined) {
            throw e
          } else {
            done(e)
          }
        }

        return nothing
      }
    }

    const checkPart = directive(CheckNodePropertiesBehavior)

    test("когда директива является единственным дочерним элементом", () => {
      const makeTemplate = (content: unknown) => html`
        <div>${content}</div>
      `

      // Отрисовываем дважды, чтобы вызвать `update`
      render(makeTemplate(checkPart()), container)
      render(makeTemplate(checkPart()), container)
    })

    test("когда директива является последним дочерним элементом", () => {
      const makeTemplate = (content: unknown) =>
        html`
          <div>Earlier sibling. ${content}</div>
        `

      // Отрисовываем дважды, чтобы вызвать `update`
      render(makeTemplate(checkPart()), container)
      render(makeTemplate(checkPart()), container)
    })

    test("когда директива не является последним дочерним элементом", () => {
      const makeTemplate = (content: unknown) =>
        html`
          <div>Earlier sibling. ${content} Later sibling.</div>
        `

      // Отрисовываем дважды, чтобы вызвать `update`
      render(makeTemplate(checkPart()), container)
      render(makeTemplate(checkPart()), container)
    })

    test("parentNode части является логическим родителем в DOM", async () => {
      let resolve: () => void
      let reject: (e: unknown) => void
      // Этот Promise завершается, когда директива until() вызывает директиву
      // в asyncCheckDiv
      const asyncCheckDivRendered = new Promise<void>((res, rej) => {
        resolve = res
        reject = rej
      })
      const asyncCheckDiv = Promise.resolve(
        checkPart("div", (e?: unknown) => (e === undefined ? resolve() : reject(e)))
      )
      const makeTemplate = () =>
        html`
          ${checkPart("container")}
          <div id="div">
            ${checkPart("div")}
            ${html`
              x ${checkPart("div")} x
            `}
            ${html`
              x
              ${html`
                x ${checkPart("div")} x
              `}
              x
            `}
            ${html`
              x
              ${html`
                x ${[checkPart("div"), checkPart("div")]} x
              `}
              x
            `}
            ${html`
              x
              ${html`
                x ${[[checkPart("div"), checkPart("div")]]} x
              `}
              x
            `}
            ${html`
              x
              ${html`
                x ${[[repeat([checkPart("div"), checkPart("div")], v => v)]]} x
              `}
              x
            `}
            ${until(asyncCheckDiv)}
          </div>
        `

      render(makeTemplate(), container)
      await asyncCheckDivRendered
    })

    test("когда parentNode равен null", async () => {
      const template = () =>
        html`
          ${checkPart("container")}
        `

      // Отрисовываем шаблон для создания экземпляра директивы
      render(template(), container)

      // Вручную очищаем контейнер, чтобы отсоединить директиву
      container.innerHTML = ""

      // Проверяем, что мы можем получить доступ к parentNode
      expect(currentDirective.part!.parentNode).toBeNull()
    })

    test("parentNode части корректен при отрисовке во фрагменте документа", async () => {
      const fragment = document.createDocumentFragment()
      ;(fragment as unknown as { id: string }).id = "fragment"
      const makeTemplate = () =>
        html`
          ${checkPart("fragment")}
        `

      // Отрисовываем дважды, чтобы вызвать `update`
      render(makeTemplate(), fragment)
      render(makeTemplate(), fragment)
    })
  })

  test("директивы сохраняют состояние", () => {
    const go = (v: string) => {
      render(
        html`
          <div>${count(v)}</div>
        `,
        container
      )
    }
    go("A")
    assertContent("<div>A:1</div>")
    go("A")
    assertContent("<div>A:2</div>")
    go("B")
    assertContent("<div>B:3</div>")
  })

  test("директивы могут обновляться", () => {
    let receivedPart: ChildPart
    let receivedValue: unknown

    class TestUpdateDirective extends Directive {
      render(v: unknown) {
        return v
      }

      override update(part: ChildPart, [v]: Parameters<this["render"]>) {
        receivedPart = part
        receivedValue = v
        return this.render(v)
      }
    }

    const update = directive(TestUpdateDirective)
    const go = (v: boolean) => {
      render(
        html`
          <div>${update(v)}</div>
        `,
        container
      )
    }
    go(true)
    assertContent("<div>true</div>")
    expect(receivedPart!.type).toBe(PartType.CHILD)
    expect(receivedValue).toBe(true)
  })

  test("отрисовка директив в AttributeParts", () => {
    const go = () => html`
      <div foo=${count("A")}></div>
    `
    render(go(), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div foo="A:1"></div>')
    render(go(), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div foo="A:2"></div>')
  })

  test("отрисовка нескольких директив в AttributeParts", () => {
    const go = () => html`
      <div foo="a:${count("A")}:b:${count("B")}"></div>
    `
    render(go(), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div foo="a:A:1:b:B:1"></div>')
    render(go(), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div foo="a:A:2:b:B:2"></div>')
  })

  test("PartInfo включает метаданные для директивы в AttributeParts", () => {
    let partInfo: PartInfo
    const testDirective = directive(
      class extends Directive {
        constructor(info: PartInfo) {
          super(info)
          partInfo = info
        }

        render(v: unknown) {
          return v
        }
      }
    )
    render(
      html`
        <div title="a ${testDirective(1)} b"></div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div title="a 1 b"></div>')
    if (partInfo!.type !== PartType.ATTRIBUTE) {
      throw new Error("Expected attribute PartInfo")
    }
    expect(partInfo!.tagName).toBe("DIV")
    expect(partInfo!.name).toBe("title")
    expect(partInfo!.strings).toEqual(["a ", " b"])
  })

  test("отрисовка директив в PropertyParts", () => {
    render(
      html`
        <div .foo=${count("A")}></div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")
    expect((container.firstElementChild as any).foo).toBe("A:1")
  })

  test("PartInfo включает метаданные для директивы в PropertyParts", () => {
    let partInfo: PartInfo
    const testDirective = directive(
      class extends Directive {
        constructor(info: PartInfo) {
          super(info)
          partInfo = info
        }

        render(v: unknown) {
          return v
        }
      }
    )
    render(
      html`
        <div .title="a ${testDirective(1)} b"></div>
      `,
      container
    )
    expect(container.innerHTML).toMatchStringHTMLStripMarkers('<div title="a 1 b"></div>')
    if (partInfo!.type !== PartType.PROPERTY) {
      throw new Error("Expected property PartInfo")
    }
    expect(partInfo!.tagName).toBe("DIV")
    expect(partInfo!.name).toBe("title")
    expect(partInfo!.strings).toEqual(["a ", " b"])
  })

  test("отрисовка директив в EventParts", () => {
    const handle = directive(
      class extends Directive {
        count = 0

        render(value: string) {
          return (e: Event) => {
            ;(e.target as any).__clicked = `${value}:${++this.count}`
          }
        }
      }
    )
    const template = (value: string) =>
      html`
        <div @click=${handle(value)}></div>
      `
    render(template("A"), container)
    expect(container.innerHTML).toMatchStringHTMLStripMarkers("<div></div>")
    ;(container.firstElementChild as HTMLDivElement).click()
    expect((container.firstElementChild as any).__clicked).toBe("A:1")
    ;(container.firstElementChild as HTMLDivElement).click()
    expect((container.firstElementChild as any).__clicked).toBe("A:2")
    render(template("B"), container)
    ;(container.firstElementChild as HTMLDivElement).click()
    expect((container.firstElementChild as any).__clicked).toBe("B:3")
    ;(container.firstElementChild as HTMLDivElement).click()
    expect((container.firstElementChild as any).__clicked).toBe("B:4")
  })

  test("обработчики событий видят события, вызванные в атрибутах директив", () => {
    let event = undefined
    const listener = (e: Event) => {
      event = e
    }
    render(
      html`
        <div @test-event=${listener} b=${fireEvent()}></div>
      `,
      container
    )
    expect(event).toBeDefined()
  })

  test("обработчики событий видят события, вызванные в элементах директив", () => {
    let event = undefined
    const listener = (e: Event) => {
      event = e
    }
    debugger
    render(
      html`
        <div @test-event=${listener} ${fireEvent()}></div>
      `,
      container
    )
    expect(event).toBeDefined()
  })

  test("отрисовка директив в ElementParts", () => {
    const log: string[] = []
    assertRender(
      html`
        <div ${count("x", log)}></div>
      `,
      `<div></div>`
    )
    expect(log).toEqual(["x:1"])

    log.length = 0
    assertRender(
      // Намеренно добавляем слеш для самозакрывающегося тега
      html`
        <div a=${"a"} ${count("x", log)}/></div>`,
      `<div a="a"></div>`
    )
    expect(log).toEqual(["x:1"])

    log.length = 0
    assertRender(
      html`
        <div ${count("x", log)} a=${"a"}>${"A"}</div>
        ${"B"}
      `,
      `<div a="a">A</div>B`
    )
    expect(log).toEqual(["x:1"])

    log.length = 0
    assertRender(
      html`
        <div a=${"a"} ${count("x", log)} b=${"b"}></div>
      `,
      `<div a="a" b="b"></div>`
    )
    expect(log).toEqual(["x:1"])

    log.length = 0
    assertRender(
      html`
        <div ${count("x", log)} ${count("y", log)}></div>
      `,
      `<div></div>`
    )
    expect(log).toEqual(["x:1", "y:1"])

    log.length = 0
    const template = html`
      <div ${count("x", log)} a=${"a"} ${count("y", log)}></div>
    `
    assertRender(template, `<div a="a"></div>`)
    expect(log).toEqual(["x:1", "y:1"])
    log.length = 0
    assertRender(template, `<div a="a"></div>`)
    expect(log).toEqual(["x:2", "y:2"])
  })
  const DEV_MODE = render.setSanitizer != null
  if (DEV_MODE) {
    test("атрибуты EventPart должны состоять из одного значения без дополнительного текста", () => {
      const listener = () => {
      }

      render(
        html`
          <div @click=${listener}></div>
        `,
        container
      )
      render(
        html`
          <div @click="${listener}"></div>
        `,
        container
      )

      expect(() => {
        render(
          html`
            <div @click="EXTRA_TEXT${listener}"></div>
          `,
          container
        )
      }).toThrow()
      expect(() => {
        render(
          html`
            <div @click="${listener}EXTRA_TEXT"></div>
          `,
          container
        )
      }).toThrow()
      expect(() => {
        render(
          html`
            <div @click="${listener}${listener}"></div>
          `,
          container
        )
      }).toThrow()
      expect(() => {
        render(
          html`
            <div @click="${listener}EXTRA_TEXT${listener}"></div>
          `,
          container
        )
      }).toThrow()
    })

    test("выражения внутри шаблона вызывают ошибку в режиме разработки", () => {
      // top level
      expect(() => {
        render(
          html`
            <template>${"test"}</template>
          `,
          container
        )
      }).toThrow()

      // inside template result
      expect(() => {
        render(
          html`
            <div>
              <template>${"test"}</template>
            </div>
          `,
          container
        )
      }).toThrow()

      // child part deep inside
      expect(() => {
        render(
          html`
            <template>
              <div>
                <div>
                  <div>
                    <div>${"test"}</div>
                  </div>
                </div>
              </div>
            </template>
          `,
          container
        )
      }).toThrow()

      // attr part deep inside
      expect(() => {
        render(
          html`
            <template>
              <div>
                <div>
                  <div>
                    <div class="${"test"}"></div>
                  </div>
                </div>
              </div>
            </template>
          `,
          container
        )
      }).toThrow()

      // element part deep inside
      expect(() => {
        render(
          html`
            <template>
              <div>
                <div>
                  <div>
                    <div ${"test"}></div>
                  </div>
                </div>
              </div>
            </template>
          `,
          container
        )
      }).toThrow()

      // атрибут на элементе в порядке
      render(
        html`
          <template id=${"test"}>
            <div>Статическое содержимое допустимо</div>
          </template>
        `,
        container
      )
    })

    test("дублирующиеся атрибуты вызывают ошибку", () => {
      expect(() => {
        render(
          html`
            <input ?disabled=${true} ?disabled=${false} fooAttribute=${"potato"}/>
          `,
          container
        )
      }, `Detected duplicate attribute bindings. This occurs if your template has duplicate attributes on an element tag. For example "<input ?disabled=\${true} ?disabled=\${false}>" contains a duplicate "disabled" attribute. The error was detected in the following template: \n\`<input ?disabled=\${...} ?disabled=\${...} fooAttribute=\${...}>\``)
    })

    test("совпадающие привязки атрибутов в разных элементах не должны вызывать ошибку", () => {
      expect(() => {
        render(
          html`
            <input ?disabled=${true}/>
            <input ?disabled=${false}/>
          `,
          container
        )
      }).not.toThrow()
    })

    test("выражения внутри вложенных шаблонов вызывают ошибку в режиме разработки", () => {
      // top level
      expect(() => {
        render(
          html`
            <template>
              <template>${"test"}</template>
            </template>
          `,
          container
        )
      }).toThrow()

      // inside template result
      expect(() => {
        render(
          html`
            <template>
              <div>
                <template>${"test"}</template>
            </template></div>`,
          container
        )
      }).toThrow()

      // child part deep inside
      expect(() => {
        render(
          html`
            <template>
              <template>
                <div>
                  <div>
                    <div>
                      <div>${"test"}</div>
                    </div>
                  </div>
                </div>
              </template>
            </template>
          `,
          container
        )
      }).toThrow()

      // attr part deep inside
      expect(() => {
        render(
          html`
            <template>
              <template>
                <div>
                  <div>
                    <div>
                      <div class="${"test"}"></div>
                    </div>
                  </div>
                </div>
              </template>
            </template>
          `,
          container
        )
      }).toThrow()

      // attr part deep inside
      expect(() => {
        render(
          html`
            <template>
              <template>
                <div>
                  <div>
                    <div>
                      <div ${"test"}></div>
                    </div>
                  </div>
                </div>
              </template>
            </template>
          `,
          container
        )
      }).toThrow()

      // атрибут на элементе в порядке
      render(
        html`
          <template id=${"test"}>
            <template>
              <div>Статическое содержимое допустимо</div>
            </template>
          </template>
        `,
        container
      )
    })
  }

  test("директивы имеют доступ к renderOptions", () => {
    const hostEl = document.createElement("input")
    hostEl.value = "host"

    class HostDirective extends Directive {
      host?: HTMLInputElement

      render(v: string) {
        return `${(this.host as HTMLInputElement)?.value}:${v}`
      }

      override update(part: Part, props: [v: string]) {
        this.host ??= part.options!.host as HTMLInputElement
        return this.render(...props)
      }
    }

    const hostDirective = directive(HostDirective)

    render(
      html`
        <div attr=${hostDirective("attr")}>${hostDirective("node")}</div>
      `,
      container,
      {host: hostEl}
    )
    assertContent('<div attr="host:attr">host:node</div>')
  })

  describe("вложенные директивы", () => {
    const aNothingDirective = directive(
      class extends Directive {
        render(bool: boolean, v: unknown) {
          return bool ? v : nothing
        }
      }
    )

    let bDirectiveCount = 0
    const bDirective = directive(
      class extends Directive {
        count = 0

        constructor(part: PartInfo) {
          super(part)
          bDirectiveCount++
        }

        render(v: unknown) {
          return `[B:${this.count++}:${v}]`
        }
      }
    )

    test("вложенные директивы в ChildPart", () => {
      bDirectiveCount = 0
      const template = (bool: boolean, v: unknown) =>
        html`
          <div>${aNothingDirective(bool, bDirective(v))}</div>
        `
      assertRender(template(true, "X"), `<div>[B:0:X]</div>`)
      assertRender(template(true, "Y"), `<div>[B:1:Y]</div>`)
      assertRender(template(false, "X"), `<div></div>`)
      assertRender(template(true, "X"), `<div>[B:0:X]</div>`)
      expect(bDirectiveCount).toBe(2)
    })

    test("вложенные директивы в AttributePart", () => {
      bDirectiveCount = 0
      const template = (bool: boolean, v: unknown) =>
        html`
          <div a=${aNothingDirective(bool, bDirective(v))}></div>
        `
      assertRender(template(true, "X"), `<div a="[B:0:X]"></div>`)
      assertRender(template(true, "Y"), `<div a="[B:1:Y]"></div>`)
      assertRender(template(false, "X"), `<div></div>`)
      assertRender(template(true, "X"), `<div a="[B:0:X]"></div>`)
      expect(bDirectiveCount).toBe(2)
    })

    describe("вложенные директивы, родитель которых возвращает `noChange`", () => {
      const aNoChangeDirective = directive(
        class extends Directive {
          render(bool: boolean, v: unknown) {
            return bool ? v : noChange
          }
        }
      )

      test("вложенные директивы в ChildPart", () => {
        bDirectiveCount = 0
        const template = (bool: boolean, v: unknown) =>
          html`
            <div>${aNoChangeDirective(bool, bDirective(v))}</div>
          `
        assertRender(template(true, "X"), `<div>[B:0:X]</div>`)
        assertRender(template(true, "Y"), `<div>[B:1:Y]</div>`)
        assertRender(template(false, "X"), `<div>[B:1:Y]</div>`)
        assertRender(template(true, "X"), `<div>[B:2:X]</div>`)
        assertRender(template(false, "Y"), `<div>[B:2:X]</div>`)
        expect(bDirectiveCount).toBe(1)
      })

      test("вложенные директивы в AttributePart", () => {
        bDirectiveCount = 0
        const template = (bool: boolean, v: unknown) =>
          html`
            <div a=${aNoChangeDirective(bool, bDirective(v))}></div>
          `
        assertRender(template(true, "X"), `<div a="[B:0:X]"></div>`)
        assertRender(template(true, "Y"), `<div a="[B:1:Y]"></div>`)
        assertRender(template(false, "X"), `<div a="[B:1:Y]"></div>`)
        assertRender(template(true, "X"), `<div a="[B:2:X]"></div>`)
        assertRender(template(false, "Y"), `<div a="[B:2:X]"></div>`)
        expect(bDirectiveCount).toBe(1)
      })
    })
  })
})
