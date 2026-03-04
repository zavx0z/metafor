export function commit(params: any) {
  return { committed: params?.value?.id, field: !!params?.field }
}
