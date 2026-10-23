import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import jsQR from "jsqr";
import QRCode from "qrcode";
import sharp from "sharp";

const WEBSITE_URL = "https://iso-ev-charging.iso-ev-charging.workers.dev/";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = dirname(SCRIPT_DIR);
const OUTPUT_DIR = join(PROJECT_DIR, "signage");
const SVG_PATH = join(OUTPUT_DIR, "iso-ne-ev-charging-qr-sign.svg");
const PNG_PATH = join(OUTPUT_DIR, "iso-ne-ev-charging-qr-sign.png");

const qr = QRCode.create(WEBSITE_URL, { errorCorrectionLevel: "H" });
const moduleCount = qr.modules.size;
if (!Number.isInteger(moduleCount) || moduleCount < 21) {
  throw new Error(`Unexpected QR module count: ${moduleCount}`);
}

const moduleScale = Math.floor(710 / (moduleCount + 8));
const qrSize = moduleCount * moduleScale;
const quietZone = moduleScale * 4;
const qrBoxSize = qrSize + quietZone * 2;
const qrBoxX = (900 - qrBoxSize) / 2;
const qrBoxY = 328;
const qrPath = [];
for (let y = 0; y < moduleCount; y += 1) {
  for (let x = 0; x < moduleCount; x += 1) {
    if (qr.modules.data[y * moduleCount + x]) qrPath.push(`M${x} ${y}h1v1h-1z`);
  }
}

// BatteryCharging icon path data adapted from Lucide (ISC License).
// See THIRD_PARTY_NOTICES.md for the copyright and license notice.
const batteryIcon = `
    <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m11 7-3 5h4l-3 5" />
      <path d="M14.856 6H16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.935" />
      <path d="M22 14v-4" />
      <path d="M5.14 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2.936" />
    </g>`;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="3in" height="4in" viewBox="0 0 900 1200">
  <rect width="900" height="1200" fill="#f8fafc" />
  <rect x="4" y="4" width="892" height="1192" rx="34" fill="none" stroke="#0f172a" stroke-width="8" />

  <g aria-label="Let us know when you're ready to move">
    <rect x="52" y="43" width="92" height="92" rx="24" fill="#0f172a" />
    <path d="M105 52 72 98h23l-5 31 34-49h-23z" fill="#facc15" />
    <text x="170" y="82" font-family="Arial, Helvetica, sans-serif" font-size="35" font-weight="750" fill="#0f172a">Let us know when</text>
    <text x="170" y="126" font-family="Arial, Helvetica, sans-serif" font-size="40" font-weight="850" fill="#0f172a">you're ready to move! :D</text>
    <text x="450" y="181" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="650" fill="#334155">Scan for live status &amp; charging handoffs</text>
  </g>

  <g transform="translate(58 208)">
    <rect width="374" height="92" rx="24" fill="#dcfce7" stroke="#86efac" stroke-width="3" />
    <g transform="translate(21 20) scale(2.15)" color="#15803d">${batteryIcon}</g>
    <g transform="translate(102 18)" fill="none" stroke="#15803d" stroke-width="5" stroke-linecap="round">
      <circle cx="27" cy="27" r="25" /><path d="M18 22h.01M36 22h.01" /><path d="M16 34c7 7 15 7 22 0" />
    </g>
    <text x="176" y="40" font-family="Arial, Helvetica, sans-serif" font-size="27" font-weight="800" fill="#166534">SLACK</text>
    <text x="176" y="69" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="600" fill="#166534">spots likely open</text>
  </g>

  <g transform="translate(468 208)">
    <rect width="374" height="92" rx="24" fill="#ffe4e6" stroke="#fda4af" stroke-width="3" />
    <g transform="translate(21 20) scale(2.15)" color="#be123c">${batteryIcon}</g>
    <g transform="translate(102 18)" fill="none" stroke="#be123c" stroke-width="5" stroke-linecap="round">
      <circle cx="27" cy="27" r="25" /><path d="M18 22h.01M36 22h.01" /><path d="M16 39c7-7 15-7 22 0" />
    </g>
    <text x="176" y="40" font-family="Arial, Helvetica, sans-serif" font-size="27" font-weight="800" fill="#9f1239">CONGESTED</text>
    <text x="176" y="69" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="600" fill="#9f1239">drivers need spots</text>
  </g>

  <rect x="${qrBoxX}" y="${qrBoxY}" width="${qrBoxSize}" height="${qrBoxSize}" rx="20" fill="#ffffff" stroke="#cbd5e1" stroke-width="3" />
  <g transform="translate(${qrBoxX + quietZone} ${qrBoxY + quietZone}) scale(${moduleScale})" fill="#020617" shape-rendering="crispEdges">
    <path d="${qrPath.join("")}" />
  </g>

  <text x="450" y="1059" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" fill="#475569">Or visit:</text>
  <text x="450" y="1104" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="31" font-weight="800" fill="#0f172a">https://iso-ev-charging.</text>
  <text x="450" y="1143" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="31" font-weight="800" fill="#0f172a">iso-ev-charging.workers.dev/</text>
  <text x="450" y="1175" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="600" fill="#64748b">Anonymous honor-system coordination tool</text>
</svg>
`;

mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(SVG_PATH, svg);
await sharp(Buffer.from(svg), { density: 300 })
  .resize(900, 1200)
  .withMetadata({ density: 300 })
  .png({ compressionLevel: 9 })
  .toFile(PNG_PATH);

const pngMetadata = await sharp(PNG_PATH).metadata();
if (pngMetadata.width !== 900 || pngMetadata.height !== 1200) {
  throw new Error(`Unexpected output dimensions: ${pngMetadata.width}x${pngMetadata.height}`);
}

const { data: pixels, info } = await sharp(PNG_PATH)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const decoded = jsQR(new Uint8ClampedArray(pixels), info.width, info.height, {
  inversionAttempts: "dontInvert",
});
if (decoded?.data !== WEBSITE_URL) {
  throw new Error(`QR verification failed; decoded ${JSON.stringify(decoded?.data || null)}`);
}

console.log(`Created ${SVG_PATH}`);
console.log(`Created ${PNG_PATH} (${pngMetadata.width}x${pngMetadata.height} at 300 DPI)`);
console.log(`QR modules: ${moduleCount}x${moduleCount}; printed QR area: ${qrBoxSize}px square`);
console.log(`Verified QR destination: ${decoded.data}`);
