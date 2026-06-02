export type PcmAudio = {
  pcm: Uint8Array;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
};

export function parseWavPcm(bytes: Uint8Array): PcmAudio {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (readAscii(bytes, 0, 4) !== "RIFF" || readAscii(bytes, 8, 12) !== "WAVE") {
    throw new Error("Expected a RIFF/WAVE file");
  }

  let offset = 12;
  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataStart = -1;
  let dataLength = 0;

  while (offset + 8 <= bytes.byteLength) {
    const chunkId = readAscii(bytes, offset, offset + 4);
    const chunkLength = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    const nextOffset = chunkStart + chunkLength + (chunkLength % 2);

    if (chunkId === "fmt ") {
      audioFormat = view.getUint16(chunkStart, true);
      channels = view.getUint16(chunkStart + 2, true);
      sampleRate = view.getUint32(chunkStart + 4, true);
      bitsPerSample = view.getUint16(chunkStart + 14, true);
    }

    if (chunkId === "data") {
      dataStart = chunkStart;
      dataLength = chunkLength;
      break;
    }

    offset = nextOffset;
  }

  if (dataStart < 0) {
    throw new Error("WAV file has no data chunk");
  }

  if (audioFormat !== 1) {
    throw new Error(`Expected PCM WAV format 1, got ${audioFormat}`);
  }

  if (channels !== 1 || bitsPerSample !== 16) {
    throw new Error(`Expected 16-bit mono PCM, got ${channels} channel(s), ${bitsPerSample} bit(s)`);
  }

  return {
    pcm: bytes.subarray(dataStart, dataStart + dataLength),
    sampleRate,
    channels,
    bitsPerSample,
  };
}

function readAscii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}
