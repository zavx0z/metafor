export type JsonReadResult<T> =
  | {ok: true; value: T}
  | {ok: false; error: string}

/** Читает JSON Dark ingress и превращает ошибку парсинга в обычный результат. */
export async function readJson<T>(request: Request): Promise<JsonReadResult<T>> {
  try {
    return {ok: true, value: await request.json() as T}
  } catch (error) {
    return {ok: false, error: error instanceof Error ? error.message : String(error)}
  }
}

/** Создаёт единообразный JSON-ответ серверного уровня. */
export function json(value: unknown, status = 200): Response {
  return Response.json(value, {status})
}
