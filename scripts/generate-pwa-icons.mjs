/**
 * scripts/generate-pwa-icons.mjs
 *
 * Builds every installed-app icon from public/logo.png:
 *
 *   icons/icon-{192,512}.png      purpose "any"      — the mark with a small margin
 *   icons/maskable-{192,512}.png  purpose "maskable" — the mark inside the 80%
 *                                  safe zone, so Android's circle/squircle crop
 *                                  never cuts into it
 *   icons/apple-touch-icon.png    iOS home screen (opaque; iOS turns alpha black)
 *   icons/badge-96.png            Android status-bar badge — white silhouette on
 *                                  transparent, since Android uses only the alpha
 *
 * logo.png is the full lockup (mark + wordmark + tagline). The tagline is
 * unreadable at home-screen size, so only the "B + book" mark is used.
 *
 * Usage: node scripts/generate-pwa-icons.mjs
 */
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "public", "logo.png");
const out = (name) => path.join(root, "public", "icons", name);

/** The mark's square in logo.png (1254×1254). */
const MARK = { left: 264, top: 80, width: 740, height: 740 };
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

const mark = () => sharp(src).extract(MARK);

/** The mark scaled to `scale` of a `size` canvas, centred on white. */
async function onCanvas(size, scale, file) {
  const inner = Math.round(size * scale);
  const art = await mark().resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: WHITE } })
    .composite([{ input: art, gravity: "centre" }])
    .flatten({ background: WHITE })
    .png()
    .toFile(out(file));
}

async function badge(size, file) {
  const inner = Math.round(size * 0.86);
  // Dark (navy) pixels become opaque; the white background becomes transparent.
  // Two pipelines on purpose: sharp applies operations in its own fixed order,
  // so a single chain would pad before negating and turn the margin opaque.
  const silhouette = await mark()
    .resize(inner, inner)
    .flatten({ background: WHITE })
    .greyscale()
    .negate()
    .threshold(60)
    .png()
    .toBuffer();
  const alpha = await sharp(silhouette)
    .extend({
      top: Math.floor((size - inner) / 2),
      bottom: Math.ceil((size - inner) / 2),
      left: Math.floor((size - inner) / 2),
      right: Math.ceil((size - inner) / 2),
      background: { r: 0, g: 0, b: 0 },
    })
    .toColourspace("b-w")
    .raw()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 3, background: WHITE } })
    .joinChannel(alpha, { raw: { width: size, height: size, channels: 1 } })
    .png()
    .toFile(out(file));
}

await Promise.all([
  onCanvas(192, 0.84, "icon-192.png"),
  onCanvas(512, 0.84, "icon-512.png"),
  onCanvas(192, 0.62, "maskable-192.png"),
  onCanvas(512, 0.62, "maskable-512.png"),
  onCanvas(180, 0.78, "apple-touch-icon.png"),
  badge(96, "badge-96.png"),
]);
console.log("PWA icons written to public/icons/");
