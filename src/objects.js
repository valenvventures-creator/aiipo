// Storage for encrypted data-room objects: Netlify Blobs on Netlify (as the other Thought Authorities sites
// use), a local folder in development and tests. Only ciphertext is ever stored.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

let blobStore = null;
async function blobs() {
  if (!blobStore) {
    const { getStore } = await import('@netlify/blobs');
    blobStore = getStore({ name: 'ta-ipo-dataroom', consistency: 'strong' });
  }
  return blobStore;
}
const local = (name) => path.join(config.uploadDir, path.basename(name));

export async function putObject(name, buf) {
  if (config.useBlobs) return (await blobs()).set(name, buf);
  fs.mkdirSync(config.uploadDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(local(name), buf, { mode: 0o600 });
}

export async function getObject(name) {
  if (config.useBlobs) {
    const ab = await (await blobs()).get(name, { type: 'arrayBuffer' });
    if (!ab) throw new Error('Object not found');
    return Buffer.from(ab);
  }
  return fs.readFileSync(local(name));
}

export async function deleteObject(name) {
  if (config.useBlobs) return (await blobs()).delete(name);
  fs.rmSync(local(name), { force: true });
}
