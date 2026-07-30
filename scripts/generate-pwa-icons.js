import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const svgBuffer = fs.readFileSync(path.join(process.cwd(), 'public/icon.svg'));

async function generate() {
  // 512x512
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(process.cwd(), 'public/pwa-512x512.png'));

  // 192x192
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(process.cwd(), 'public/pwa-192x192.png'));

  // 180x180 Apple Touch Icon
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(process.cwd(), 'public/apple-touch-icon.png'));

  // Favicon PNG
  await sharp(svgBuffer)
    .resize(64, 64)
    .png()
    .toFile(path.join(process.cwd(), 'public/favicon.png'));

  // Maskable 512x512 (with padding)
  await sharp(svgBuffer)
    .resize(400, 400)
    .extend({
      top: 56,
      bottom: 56,
      left: 56,
      right: 56,
      background: '#0f172a'
    })
    .png()
    .toFile(path.join(process.cwd(), 'public/maskable-icon-512x512.png'));

  console.log('PWA icons generated successfully!');
}

generate().catch(err => {
  console.error(err);
  process.exit(1);
});
