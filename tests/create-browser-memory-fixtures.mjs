import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const runId = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const fixtureDir = join(process.cwd(), '.tmp', 'browser-memory-fixtures');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  const result = Buffer.alloc(4);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return result;
}

function pngChunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, name, data, crc32(Buffer.concat([name, data]))]);
}

function randomPng() {
  const width = 320;
  const height = 180;
  const pixels = randomBytes(width * height * 3);
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(Buffer.concat([Buffer.from([0]), pixels.subarray(y * width * 3, (y + 1) * width * 3)]));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function randomWav() {
  const sampleRate = 8000;
  const sampleCount = sampleRate * 2;
  const random = randomBytes(sampleCount);
  const data = Buffer.alloc(sampleCount * 2);
  for (let index = 0; index < sampleCount; index += 1) {
    data.writeInt16LE((random[index] - 128) * 48, index * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

await mkdir(fixtureDir, { recursive: true });
const imagePath = join(fixtureDir, `random-image-${runId}.png`);
const audioPath = join(fixtureDir, `random-audio-${runId}.wav`);
await Promise.all([writeFile(imagePath, randomPng()), writeFile(audioPath, randomWav())]);
console.log(JSON.stringify({ imagePath, audioPath }));
