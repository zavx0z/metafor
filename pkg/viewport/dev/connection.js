document.addEventListener("DOMContentLoaded", () => {
  const viewport = /** @type {QViewport & HTMLElement} */ (document.querySelector("quantum-viewport"))
  if (!viewport) return
  const canvas = viewport.canvas
  if (!canvas) return
  const color = theme.rgba("--secondary-500")
  /** @type {NodeListOf<HTMLElement>} */
  const elements = viewport.querySelectorAll("[data-drag-selector]")

  const [el1, el2] = /** @type {[HTMLElement, HTMLElement]} */ (Array.from(elements))
  if (!el1 || !el2) return

  const source = viewport.getCanvasBB(el1)
  const target = viewport.getCanvasBB(el2)

  // Добавляем соединение
  canvas.applyPatch({
    op: "add",
    path: `${el1.id} > ${el2.id}`,
    value: {
      source: {
        x: source.x,
        y: source.y
      },
      target: {
        x: target.x,
        y: target.y
      },
      color,
      width: 2
    }
  })

  // Создаем observer для каждого элемента
  const observer = new MutationObserver(mutations => mutations.forEach(mutation => mutation.type === "attributes" && mutation.attributeName === "style" && updateConnection(el1, el2)))

  observer.observe(el1, {attributes: true, attributeFilter: ["style"]})
  observer.observe(el2, {attributes: true, attributeFilter: ["style"]})

  /**
   * Обновляем соединение при изменении положения элементов
   * @param {HTMLElement} el1
   * @param {HTMLElement} el2
   */
  function updateConnection(el1, el2) {
    const source = viewport.getCanvasBB(el1)
    const target = viewport.getCanvasBB(el2)
    canvas.applyPatch({
      op: "replace",
      path: `${el1.id} > ${el2.id}`,
      value: {
        source: {x: source.x, y: source.y},
        target: {x: target.x, y: target.y},
      }
    })
  }
})
