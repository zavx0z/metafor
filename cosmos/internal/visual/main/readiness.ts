/** Stop the owned public root before propagating a failed first presentation. */
export async function awaitVisualReady<T>(root: {unmount(): void}, ready: () => Promise<T>): Promise<T> {
  try {return await ready()}
  catch (error) {
    try {root.unmount()}
    catch (cleanup) {throw new AggregateError([error, cleanup], "Visual startup and cleanup failed")}
    throw error
  }
}
