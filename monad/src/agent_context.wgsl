struct HeapView {
  data: array<u32>,
}

struct AgentDescriptors {
  data: array<u32>,
}

struct MetaInfo {
  type_id: u32,
  size_words: u32,
  offset_words: u32,
}

const TYPE_U32: u32 = 0u;
const TYPE_F32: u32 = 1u;
const TYPE_STRING_PTR: u32 = 2u;

fn unpack_meta(meta: u32) -> MetaInfo {
  let type_id = meta & 0xFFu;
  let size_words = (meta >> 8u) & 0xFFu;
  let offset_words = meta >> 16u;
  return MetaInfo(type_id, size_words, offset_words);
}

fn get_field_value(
  agent_id: u32,
  target_field_id: u32,
  descriptors: AgentDescriptors,
  heap: HeapView,
) -> u32 {
  let block_ptr = descriptors.data[agent_id];
  let local_field_count = heap.data[block_ptr + 0u];
  let header_base = block_ptr + 2u;

  var i: u32 = 0u;
  loop {
    if (i >= local_field_count) {
      break;
    }
    let field_id = heap.data[header_base + i * 2u];
    let meta = heap.data[header_base + i * 2u + 1u];
    if (field_id == target_field_id) {
      let info = unpack_meta(meta);
      let value_ptr = block_ptr + info.offset_words;
      if (info.type_id == TYPE_F32) {
        return heap.data[value_ptr];
      }
      return heap.data[value_ptr];
    }
    i = i + 1u;
  }
  return 0u;
}

fn get_shared_field_value(
  agent_id: u32,
  shared_index: u32,
  target_field_id: u32,
  descriptors: AgentDescriptors,
  heap: HeapView,
) -> u32 {
  let block_ptr = descriptors.data[agent_id];
  let local_field_count = heap.data[block_ptr + 0u];
  let shared_count = heap.data[block_ptr + 1u];
  if (shared_index >= shared_count) {
    return 0u;
  }
  let shared_ptr = heap.data[block_ptr + 2u + local_field_count * 2u + shared_index];
  let shared_local_count = heap.data[shared_ptr + 0u];
  let shared_header_base = shared_ptr + 2u;

  var i: u32 = 0u;
  loop {
    if (i >= shared_local_count) {
      break;
    }
    let field_id = heap.data[shared_header_base + i * 2u];
    let meta = heap.data[shared_header_base + i * 2u + 1u];
    if (field_id == target_field_id) {
      let info = unpack_meta(meta);
      let value_ptr = shared_ptr + info.offset_words;
      return heap.data[value_ptr];
    }
    i = i + 1u;
  }
  return 0u;
}
