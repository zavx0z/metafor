/**
 * Создает и настраивает граф для частицы
 * @template {import("../types/index.ts").ContextDefinition} C - контекст частицы
 * @template {string} S - состояние частицы
 * @template {Record<string, any>} I - ядро частицы
 *
 * @param {import('../index.js').ClassMetaFor<C, I, S>} atom - Экземпляр частицы
 * @returns {Promise<MetaForGraph & HTMLElement>} Компонент графа
 */
export default async function (atom) {
  const quantumGraph = /** @type {MetaForGraph} */ (document.querySelector("metafor-graph"))

  return quantumGraph.addAtom(atom.snapshot()).then(component => {
    // Добавляем обработчики обновлений
    atom.onTransition((_, newState) => component.updateState(newState))
    const originalUpdate = atom.update.bind(atom)
    //@ts-ignore
    atom.update = context => {
      const updCtx = originalUpdate(context)
      component.updateContext(context)
    }
    return component
  })
}
