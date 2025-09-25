/**
 * Web-реализация MetaFor фреймворка
 *
 * Этот модуль экспортирует MetaFor для использования в браузере.
 * Компоненты автоматически регистрируются с тегами вида `meta-<hash>`.
 *
 * @example
 * ```typescript
 * import { MetaFor } from "./web/metafor.ts"
 *
 * const hash = MetaFor("my-component")
 *   .context(...)
 *   .states(...)
 *   .core(...)
 *   .processes(...)
 *   .reactions(...)
 *   .view(...)
 *
 * // Создание элемента
 * document.body.innerHTML = `<meta-${hash}></meta-${hash}>`
 * ```
 */
import { Store } from "./store"
import { MetaForFabric } from "../core"

const workerCode = `//# sourceURL=WORKER
const Store = ${Store.toString()};
let workerStore = null;
new BroadcastChannel("channel").onmessage = (({data})=>{
  console.log(data)
})
self.onmessage = async function(e) {
  const { type, dbName, storeName, moduleId, requestId } = e.data;
  
  if (type === "init") {
    // Создаем собственный экземпляр store в worker
    workerStore = await Store(dbName, storeName);
    self.postMessage({ type: "ready" });
  } else if (type === "import") {
    try {
      const module = await workerStore.import(moduleId, false);
      self.postMessage({ 
        type: "import-result", 
        moduleId, 
        requestId,
        module 
      });
    } catch (error) {
      self.postMessage({ 
        type: "import-error", 
        moduleId, 
        requestId,
        error: error.message 
      });
    }
  }
};
`
const worker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: "application/javascript" })), {
  type: "module",
})
worker.onmessage = (e) => {
  const { type, moduleId, requestId, module, error } = e.data

  if (type === "ready") {
    console.log("Worker store initialized")
  } else if (type === "import-result") {
    console.log(`Module ${moduleId} imported successfully in worker`, module)
  } else if (type === "import-error") {
    console.error(`Failed to import ${moduleId} in worker:`, error)
  }
}
worker.postMessage({ type: "init", dbName: "meta", storeName: "modules" })

const store = await Store()

MetaForFabric({ store })
export type { Message } from "../core/message/index"
