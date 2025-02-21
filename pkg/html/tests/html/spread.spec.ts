// import {render, html} from "../../html"
import {beforeEach, describe} from "bun:test"

describe.skip("spread", () => {
  let container: HTMLDivElement
  beforeEach(() => {
    container = document.createElement("div")
  })
  // test("renders a static attr result", () => {
  //   render(
  //     html`
  //       <div ${attr`foo=bar`} a="b"></div>
  //     `,
  //     container
  //   )
  //   expect(container.innerHTML).toMatchStringHTMLStripComments('<div a="b" foo="bar"></div>')
  // })
  //
  // test("renders a dynamic attr result", () => {
  //   render(
  //     html`
  //       <div ${attr`foo=${"bar"}`} a="b"></div>
  //     `,
  //     container
  //   )
  //   expect(container.innerHTML).toMatchStringHTMLStripComments('<div a="b" foo="bar"></div>')
  // })
  //
  // test("renders a property", () => {
  //   render(
  //     html`
  //       <div ${attr`.foo=${"bar"}`} a="b"></div>
  //     `,
  //     container
  //   )
  //   expect(container.innerHTML).toMatchStringHTMLStripComments('<div a="b"></div>')
  //   const div = container.querySelector("div")
  //   expect((div as any).foo).toBe("bar")
  // })
})
