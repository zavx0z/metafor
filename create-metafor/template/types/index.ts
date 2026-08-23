import type {Fields} from "@metafor/types/metafor/fields"
import type {MatterDefinitionParams} from "@metafor/types/metafor/matter"
import type {Energy, Mass} from "@metafor/types/metafor/schema"
import type { NodeType } from "./node/index.ts"

/**
 * Парсит HTML-шаблон и возвращает обогащенную иерархию с метаданными о путях к данным.
 *
 * @param template - Функция шаблонизатора; `mass` в её параметрах содержит
 * handles объявленных key-files, а не их JSON/binary содержимое
 * @returns Массив узлов с полной структурой и метаданными о путях к данным
 */
export declare function parse<
  ɸ extends Fields = Fields,
  m extends Mass = Mass,
  𝛴 extends string = string,
  e extends Energy = Energy,
>(
  template: (params: MatterDefinitionParams<ɸ, m, 𝛴, e>) => void,
): NodeType[]
