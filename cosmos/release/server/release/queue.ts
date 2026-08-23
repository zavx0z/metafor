let publication = Promise.resolve()

/** Ждёт завершения package publication перед чтением доказанного release state. */
export async function waitForPublication() {
  await publication
}

/** Выполняет publication строго после всех ранее принятых publication. */
export function serializePublication<T>(publish: () => Promise<T>) {
  const current = publication.then(publish)
  publication = current.then(() => undefined, () => undefined)
  return current
}
