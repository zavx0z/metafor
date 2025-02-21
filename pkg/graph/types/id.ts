/**
 * Базовые параметры для портов
 * @interface BasePortParams
 * @property atom - Имя атома (например, "file")
 * @property state - Имя состояния атома (например, "IDLE", "PROCESSING")
 * @property param - Имя параметра контекста (например, "path", "content")
 */
export interface BasePortParams {
  atom: string;
  state: string;
  param: string;
}

/**
 * Направление порта контекста
 * @typedef ContextPortDirection
 */
export type ContextPortDirection = 'input' | 'output';

/**
 * Параметры порта контекста
 * @interface ContextPortParams
 * @extends BasePortParams
 * @property direction - Направление порта контекста:
 *   - input: входной порт для получения данных
 *   - output: выходной порт для отправки данных
 */
export interface ContextPortParams extends BasePortParams {
  direction: ContextPortDirection;
}

/** Направление порта триггера */
export type TriggerPortDirection = 'east' | 'west';

/**
 * Параметры порта триггера
 * @interface TriggerPortParams
 * @property atom - Имя атома (например, "file")
 * @property from - Состояние-источник триггера
 * @property to - Целевое состояние триггера
 * @property param - Имя параметра контекста (например, "path", "content")
 * @property direction - Направление порта триггера:
 *   - east: выходной порт (справа)
 *   - west: входной порт (слева)
 */
export interface TriggerPortParams {
  atom: string;
  from: string;
  to: string;
  param: string;
  direction: TriggerPortDirection;
}

/**
 * Параметры связи между портами
 * @interface EdgeParams
 * @property sourceId - ID порта-источника (откуда идет связь)
 * @property targetId - ID порта-назначения (куда идет связь)
 */
export interface EdgeParams {
  sourceId: string;
  targetId: string;
}

/**
 * Параметры состояния
 * @interface StateParams
 * @property atom - Имя атома (например, "file")
 * @property state - Имя состояния атома (например, "IDLE", "PROCESSING")
 */
export interface StateParams {
  atom: string;
  state: string;
}

/**
 * Параметры триггера
 * @interface TriggerParams
 * @property atom - Имя атома (например, "file")
 * @property state - Имя состояния атома
 * @property param - Имя параметра контекста (например, "path")
 */
export interface TriggerParams {
  atom: string;
  state: string;
  param: string;
}

/**
 * Параметры атома
 * @interface AtomParams
 * @property atom - Имя атома (например, "file")
 */
export interface AtomParams {
  atom: string;
}

/**
 * Параметры параметра триггера
 * @interface TriggerParameterParams
 * @property atom - Имя атома (например, "file")
 * @property from - Состояние-источник триггера
 * @property to - Целевое состояние триггера
 * @property param - Имя параметра контекста (например, "path", "content")
 */
export interface TriggerParameterParams {
  atom: string;
  from: string;
  to: string;
  param: string;
}
