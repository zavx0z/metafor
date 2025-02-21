import "../../graph/components/quantum-graph.js"

/**
 * Создает и настраивает граф для атома
 * @template {import("../types/index.ts").ContextDefinition} C - контекст атома
 * @template {string} S - состояние атома
 * @template {Record<string, any>} I - ядро атома
 *
 * @param {import('../QuantumAtom.js').QuantumAtom<C, I, S>} atom - Экземпляр атома
 * @returns {Promise<QGraphAtom & HTMLElement>} Компонент графа
 */
export default async function (atom) {
  const quantumGraph = /** @type {QGraph} */ (document.querySelector("quantum-graph"))

  return quantumGraph.addAtom(atom.snapshot()).then(component => {
    // Добавляем обработчики обновлений
    atom.onCollapse((_, newState) => component.updateState(newState))
    const originalUpdate = atom.update.bind(atom)
    //@ts-ignore
    atom.update = context => {
      const updCtx = originalUpdate(context)
      component.updateContext(context)
    }
    return component
  })
}
