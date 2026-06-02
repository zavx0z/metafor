import { describe, expect, test } from "bun:test";
import { parseWavPcm } from "./wav";

describe("WAV PCM parser", () => {
  test("extracts 16-bit mono PCM data", () => {
    const wav = new Uint8Array(44 + 4);
    const view = new DataView(wav.buffer);

    writeAscii(wav, 0, "RIFF");
    view.setUint32(4, 36 + 4, true);
    writeAscii(wav, 8, "WAVE");
    writeAscii(wav, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16_000, true);
    view.setUint32(28, 16_000 * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeAscii(wav, 36, "data");
    view.setUint32(40, 4, true);
    wav.set([1, 2, 3, 4], 44);

    const parsed = parseWavPcm(wav);

    expect(parsed.sampleRate).toBe(16_000);
    expect([...parsed.pcm]).toEqual([1, 2, 3, 4]);
  });
});

function writeAscii(bytes: Uint8Array, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    bytes[offset + index] = text.charCodeAt(index);
  }
}
