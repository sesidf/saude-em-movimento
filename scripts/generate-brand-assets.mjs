#!/usr/bin/env node

import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const root = process.cwd();
const logoPath = resolve(root, 'public/logo.svg');
const faviconSvgPath = resolve(root, 'public/favicon.svg');
const faviconIcoPath = resolve(root, 'public/favicon.ico');
const appleTouchPngPath = resolve(root, 'public/apple-touch-icon.png');

const createPng = async (size) => {
  const svg = await readFile(logoPath);
  return sharp(svg)
    .resize(size, size, { fit: 'cover' })
    .png({ quality: 100, compressionLevel: 9 })
    .toBuffer();
};

const run = async () => {
  await copyFile(logoPath, faviconSvgPath);

  const [png16, png32, png48, png180] = await Promise.all([
    createPng(16),
    createPng(32),
    createPng(48),
    createPng(180),
  ]);

  const icoBuffer = await pngToIco([png16, png32, png48]);

  await writeFile(faviconIcoPath, icoBuffer);
  await writeFile(appleTouchPngPath, png180);

  console.log('Brand assets generated successfully:');
  console.log('- public/favicon.svg');
  console.log('- public/favicon.ico');
  console.log('- public/apple-touch-icon.png');
};

run().catch((error) => {
  console.error('Failed to generate brand assets:', error);
  process.exit(1);
});
