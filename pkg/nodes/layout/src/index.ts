/**
 * Чистый TypeScript engine автоматической раскладки compound-графов.
 *
 * Package принимает только заранее измеренный {@link LayoutGraph} и владеет
 * координатами нод, уплотнением compound-контейнеров, generated gateways и
 * orthogonal routing.
 * UI documents, текст, Flex, renderer, DOM и Hamiltonian находятся за границей.
 * @packageDocumentation
 */

export * from "../types/index.ts"
export {layout} from "./layout.ts"
