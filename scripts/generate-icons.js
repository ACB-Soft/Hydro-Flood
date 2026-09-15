import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

async function generate() {
  const publicDir = path.resolve('public');
  const iconSvgPath = path.join(publicDir, 'icon.svg');
  const iconMaskableSvgPath = path.join(publicDir, 'icon-maskable.svg');

  const iconSvg = fs.readFileSync(iconSvgPath);
  const maskableSvg = fs.readFileSync(iconMaskableSvgPath);

  console.log('Generating PWA icons with sharp...');

  await sharp(iconSvg)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'pwa-192x192.png'));
  console.log('Created pwa-192x192.png');

  await sharp(iconSvg)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-512x512.png'));
  console.log('Created pwa-512x512.png');

  await sharp(maskableSvg)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-maskable-512x512.png'));
  console.log('Created pwa-maskable-512x512.png');

  await sharp(iconSvg)
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('Created apple-touch-icon.png');

  console.log('All icons generated successfully!');
}

generate().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
