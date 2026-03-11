export function commit(params: any) {
  return { committed: params?.value?.count, field: !!params?.field }
}
