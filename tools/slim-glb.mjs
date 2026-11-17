// Shrinks a .glb by removing what the game no longer uses since the art pass:
//   - all textures and images (every material is replaced by procedural ones in src/art/)
//   - the COLOR_0 / COLOR_1 vertex color channels (not used by any material)
// Every object, name, Empty, transform and mesh shape is kept exactly as exported from Blender.
//
// Usage (from the project folder):
//   node tools/slim-glb.mjs public/models/bathtub.glb public/models/bathtub.glb
// Run it again after every Blender export.

import fs from 'fs';

const [input, output = input] = process.argv.slice(2);
if (!input) {
  console.error('Usage: node tools/slim-glb.mjs <in.glb> [out.glb]');
  process.exit(1);
}

const file = fs.readFileSync(input);
if (file.readUInt32LE(0) !== 0x46546c67) throw new Error(`${input} is not a .glb file`);
const jsonLength = file.readUInt32LE(12);
const gltf = JSON.parse(file.subarray(20, 20 + jsonLength).toString('utf8'));
const binStart = 20 + jsonLength + 8;
const binLength = file.readUInt32LE(20 + jsonLength);
const bin = file.subarray(binStart, binStart + binLength);

// 1. Drop vertex colors and texture references.
for (const mesh of gltf.meshes ?? []) {
  for (const primitive of mesh.primitives) {
    for (const name of Object.keys(primitive.attributes)) {
      if (name.startsWith('COLOR_')) delete primitive.attributes[name];
    }
  }
}
for (const material of gltf.materials ?? []) {
  delete material.normalTexture;
  delete material.occlusionTexture;
  delete material.emissiveTexture;
  if (material.pbrMetallicRoughness) {
    delete material.pbrMetallicRoughness.baseColorTexture;
    delete material.pbrMetallicRoughness.metallicRoughnessTexture;
  }
  if (material.extras) delete material.extras.luxcore;
}
delete gltf.images;
delete gltf.textures;
delete gltf.samplers;

// 2. Keep only the accessors still in use, and only the buffer bytes they point at.
const usedAccessors = new Set();
for (const mesh of gltf.meshes ?? []) {
  for (const primitive of mesh.primitives) {
    Object.values(primitive.attributes).forEach((i) => usedAccessors.add(i));
    if (primitive.indices !== undefined) usedAccessors.add(primitive.indices);
    for (const target of primitive.targets ?? []) Object.values(target).forEach((i) => usedAccessors.add(i));
  }
}
for (const skin of gltf.skins ?? []) if (skin.inverseBindMatrices !== undefined) usedAccessors.add(skin.inverseBindMatrices);
for (const animation of gltf.animations ?? []) {
  for (const sampler of animation.samplers) {
    usedAccessors.add(sampler.input);
    usedAccessors.add(sampler.output);
  }
}

const accessorMap = new Map();
const newAccessors = [];
gltf.accessors.forEach((accessor, i) => {
  if (!usedAccessors.has(i)) return;
  accessorMap.set(i, newAccessors.length);
  newAccessors.push(accessor);
});

const viewMap = new Map();
const newViews = [];
const chunks = [];
let offset = 0;
for (const accessor of newAccessors) {
  if (accessor.bufferView === undefined) continue;
  if (!viewMap.has(accessor.bufferView)) {
    const view = gltf.bufferViews[accessor.bufferView];
    const bytes = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const padding = (4 - (offset % 4)) % 4;
    if (padding) chunks.push(Buffer.alloc(padding));
    offset += padding;
    viewMap.set(accessor.bufferView, newViews.length);
    newViews.push({ ...view, buffer: 0, byteOffset: offset });
    chunks.push(bytes);
    offset += bytes.length;
  }
  accessor.bufferView = viewMap.get(accessor.bufferView);
}

const remap = (i) => accessorMap.get(i);
for (const mesh of gltf.meshes ?? []) {
  for (const primitive of mesh.primitives) {
    for (const name of Object.keys(primitive.attributes)) primitive.attributes[name] = remap(primitive.attributes[name]);
    if (primitive.indices !== undefined) primitive.indices = remap(primitive.indices);
    for (const target of primitive.targets ?? []) for (const name of Object.keys(target)) target[name] = remap(target[name]);
  }
}
for (const skin of gltf.skins ?? []) if (skin.inverseBindMatrices !== undefined) skin.inverseBindMatrices = remap(skin.inverseBindMatrices);
for (const animation of gltf.animations ?? []) {
  for (const sampler of animation.samplers) {
    sampler.input = remap(sampler.input);
    sampler.output = remap(sampler.output);
  }
}

gltf.accessors = newAccessors;
gltf.bufferViews = newViews;
const binOut = Buffer.concat(chunks);
const binPadded = Buffer.concat([binOut, Buffer.alloc((4 - (binOut.length % 4)) % 4)]);
gltf.buffers = [{ byteLength: binPadded.length }];

let json = Buffer.from(JSON.stringify(gltf), 'utf8');
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);

const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + binPadded.length, 8);
const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(json.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4);
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(binPadded.length, 0);
binHeader.writeUInt32LE(0x004e4942, 4);

fs.writeFileSync(output, Buffer.concat([header, jsonHeader, json, binHeader, binPadded]));
const mb = (n) => (n / 1024 / 1024).toFixed(2);
console.log(`${input}: ${mb(file.length)} MB -> ${output}: ${mb(fs.statSync(output).size)} MB`);
