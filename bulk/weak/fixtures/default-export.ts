export default function action(params: any) {
  return { processed: true, data: params?.value?.name, field: !!params?.field }
}
