import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#1E1E22"/>
      <stop offset="100%" stop-color="#121214"/>
    </linearGradient>
    <linearGradient id="redGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FF2E44"/>
      <stop offset="100%" stop-color="#D90416"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="7" fill="url(#bg)"/>
  <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="6.25" fill="none" stroke="#D90416" stroke-opacity="0.35" stroke-width="1.5"/>
  <!-- Stylized AI Monogram for AI Print Studio -->
  <path d="M 6 23 L 11.5 9 L 15.5 9 L 21 23 L 17.2 23 L 15.8 19.5 L 11.2 19.5 L 9.8 23 Z M 12.1 16.5 L 14.9 16.5 L 13.5 12.8 Z" fill="url(#redGrad)"/>
  <rect x="23" y="9" width="3.5" height="14" rx="1.2" fill="#FFFFFF"/>
</svg>`;

async function main() {
  const root = process.cwd();
  const appDir = path.join(root, 'src', 'app');
  const publicDir = path.join(root, 'public');

  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // 1. Write src/app/icon.svg (App Router native favicon)
  const iconSvgPath = path.join(appDir, 'icon.svg');
  fs.writeFileSync(iconSvgPath, svgContent, 'utf8');
  console.log('✓ Created src/app/icon.svg');

  // 2. Also write public/favicon.svg
  const publicSvgPath = path.join(publicDir, 'favicon.svg');
  fs.writeFileSync(publicSvgPath, svgContent, 'utf8');
  console.log('✓ Created public/favicon.svg');

  // 3. Render high-res PNG and save as favicon.ico using sharp
  const pngBuffer = await sharp(Buffer.from(svgContent))
    .resize(64, 64)
    .png()
    .toBuffer();

  const icoHeader = Buffer.from([
    0x00, 0x00, // Reserved
    0x01, 0x00, // ICO type (1 = icon)
    0x01, 0x00, // 1 image
    // Directory entry (16 bytes):
    64,          // Width
    64,          // Height
    0x00,        // Color count (0 = >=8bpp)
    0x00,        // Reserved
    0x01, 0x00, // Color planes
    0x20, 0x00, // Bits per pixel (32)
    // Size of image data:
    pngBuffer.length & 0xFF,
    (pngBuffer.length >> 8) & 0xFF,
    (pngBuffer.length >> 16) & 0xFF,
    (pngBuffer.length >> 24) & 0xFF,
    // Offset of image data (6 header + 16 entry = 22 = 0x16):
    0x16, 0x00, 0x00, 0x00
  ]);

  const icoBuffer = Buffer.concat([icoHeader, pngBuffer]);
  fs.writeFileSync(path.join(appDir, 'favicon.ico'), icoBuffer);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);
  console.log('✓ Updated src/app/favicon.ico and public/favicon.ico with AI Print Studio brand icon');
}

main().catch(console.error);

