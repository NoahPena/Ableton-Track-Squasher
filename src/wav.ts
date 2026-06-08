
import { TextDecoder, TextEncoder } from "util";

interface WavHeader {
    numChannels: number;
    sampleRate: number;
    bitDepth: number;
    dataOffset: number;
    dataSize: number;
}

export function parseWavHeader(buffer: ArrayBuffer): WavHeader {

    const view = new DataView(buffer);
    const decoder = new TextDecoder("ascii");

    const readTag = (offset: number) =>
        decoder.decode(new Uint8Array(buffer, offset, 4));

    if (readTag(0) !== "RIFF") {
        throw new Error("Not a RIFF file.");
    }

    if (readTag(8) !== "WAVE") {
        throw new Error("Not a WAVE file.");
    }

    let offset = 12; // skip "RIFF", file size, "WAVE"
    let numChannels = 0;
    let sampleRate = 0;
    let bitDepth = 0;
    let dataOffset = -1;
    let dataSize = 0;

    while (offset < buffer.byteLength - 8) {
        const chunkId = readTag(offset);
        const chunkSize = view.getUint32(offset + 4, true);

        if (chunkId === "fmt ") {
            // audioFormat at offset+8 (1 = PCM — we only support PCM)
            const audioFormat = view.getUint16(offset + 8, true);
            if (audioFormat !== 1) {
                throw new Error(`Unsupported WAV audio format: ${audioFormat} (only PCM=1 is supported).`);
            }

            numChannels = view.getUint16(offset + 10, true);
            sampleRate = view.getUint32(offset + 12, true);
            bitDepth = view.getUint16(offset + 22, true);
        } else if (chunkId === "data") {
            dataOffset = offset + 8;
            dataSize = chunkSize;
            break; // data chunk is always last — we're done
        }

        offset += 8 + chunkSize;

        // Chunks are word-aligned (padded to even byte boundary)
        if (chunkSize % 2 !== 0) {
            offset += 1;
        }
    }

    if (dataOffset === -1) throw new Error("No 'data' chunk found in WAV file.");

    return { numChannels, sampleRate, bitDepth, dataOffset, dataSize };
}

export function readSample(view: DataView, byteOffset: number, bitsPerSample: number): number {
    switch (bitsPerSample) {
        case 16:
            return view.getInt16(byteOffset, true);
        case 24: {
            // No native 24-bit type — read as 3 bytes, little-endian, sign-extend
            const lo = view.getUint8(byteOffset);
            const mi = view.getUint8(byteOffset + 1);
            const hi = view.getUint8(byteOffset + 2);
            const raw = lo | (mi << 8) | (hi << 16);
            // Sign-extend from 24-bit
            return raw & 0x800000 ? raw | 0xFF000000 : raw;
        }
        case 32:
            return view.getInt32(byteOffset, true);
        default:
            throw new Error(`Unsupported bit depth: ${bitsPerSample}`);
    }
}

export function writeSample(view: DataView, byteOffset: number, sample: number, bitsPerSample: number): void {
    switch (bitsPerSample) {
        case 16:
            view.setInt16(byteOffset, sample, true);
            break;
        case 24: {
            view.setUint8(byteOffset,     sample & 0xFF);
            view.setUint8(byteOffset + 1, (sample >> 8) & 0xFF);
            view.setUint8(byteOffset + 2, (sample >> 16) & 0xFF);
            break;
        }
        case 32:
            view.setInt32(byteOffset, sample, true);
            break;
        default:
            throw new Error(`Unsupported bit depth: ${bitsPerSample}`);
    }
}

export function writeWavHeader(view: DataView, opts: { numChannels: number; sampleRate: number; bitsPerSample: number; dataSize: number}) {

    const { numChannels, sampleRate, bitsPerSample, dataSize } = opts;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const encoder = new TextEncoder();

    const write = (offset: number, str: string) =>
    encoder.encode(str).forEach((b, i) => view.setUint8(offset + i, b));

    write(0,  "RIFF");
    view.setUint32(4,  36 + dataSize, true);   // file size - 8
    write(8,  "WAVE");
    write(12, "fmt ");
    view.setUint32(16, 16, true);              // PCM fmt chunk size
    view.setUint16(20, 1, true);               // PCM audio format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    write(36, "data");
    view.setUint32(40, dataSize, true);
}
