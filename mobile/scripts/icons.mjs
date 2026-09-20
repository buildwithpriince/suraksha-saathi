// Builds the app icons, splash and dashboard favicon from assets/logo-source.png (the brand sheet).
//   node scripts/icons.mjs
// Only the shield mark is used: the wordmark is unreadable at icon size. The shield is cut out of
// the sheet by flood-filling the background from the border, so its interior keeps every colour.
// Everything lands inside the central 66% of the canvas, the part Android's round mask keeps.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE = join(HERE, '..');
const DASHBOARD = join(MOBILE, '..', 'dashboard');
const SOURCE = join(MOBILE, 'assets', 'logo-source.png');

/** The largest shield on the sheet (the bottom lockup), with room around it for the flood fill. */
const SHIELD_WINDOW = { left: 80, top: 320, width: 220, height: 210 };

/** Android keeps the central 66% of an adaptive icon; the mark never goes outside it. */
const SAFE = 0.66;
const NAVY = { r: 0x1f, g: 0x38, b: 0x64, alpha: 1 };
const WHITE = { r: 0xff, g: 0xff, b: 0xff, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

/**
 * Background to transparent: flood fill from the border over pixels close to the corner colour, so
 * only the connected outside is removed and shapes inside the shield keep their own colours.
 */
function cutOut({ data, info }, tolerance = 60) {
  const { width, height, channels } = info;
  const at = (x, y) => (y * width + x) * channels;
  const corner = [data[0], data[1], data[2]];
  const close = (i) => {
    const dr = data[i] - corner[0];
    const dg = data[i + 1] - corner[1];
    const db = data[i + 2] - corner[2];
    return Math.sqrt(dr * dr + dg * dg + db * db) <= tolerance;
  };

  const outside = new Uint8Array(width * height);
  const queue = [];
  for (let x = 0; x < width; x++) {
    queue.push([x, 0], [x, height - 1]);
  }
  for (let y = 0; y < height; y++) {
    queue.push([0, y], [width - 1, y]);
  }
  while (queue.length > 0) {
    const [x, y] = queue.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const p = y * width + x;
    if (outside[p] === 1) continue;
    if (!close(at(x, y))) continue;
    outside[p] = 1;
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  // Cut the outside, and feather the anti-aliased rim so no white halo is left behind
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const i = at(x, y);
      if (outside[p] === 1) {
        data[i + 3] = 0;
        continue;
      }
      const touchesOutside =
        (x > 0 && outside[p - 1]) || (x < width - 1 && outside[p + 1]) || (y > 0 && outside[p - width]) || (y < height - 1 && outside[p + width]);
      if (!touchesOutside) continue;
      const dr = data[i] - corner[0];
      const dg = data[i + 1] - corner[1];
      const db = data[i + 2] - corner[2];
      const distance = Math.sqrt(dr * dr + dg * dg + db * db);
      if (distance < tolerance * 1.6) data[i + 3] = Math.round((distance / (tolerance * 1.6)) * 255);
    }
  }
  return sharp(data, { raw: { width, height, channels } }).png();
}

/** The shield alone, trimmed to its own edges, on transparency. */
async function shieldMark() {
  const cut = cutOut(
    await sharp(SOURCE).extract(SHIELD_WINDOW).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  );
  return sharp(await cut.trim({ threshold: 1 }).toBuffer());
}

/** The mark centred on `size`, filling `fraction` of it, over `background`. */
async function compose(mark, size, fraction, background, out) {
  const box = Math.round(size * fraction);
  const scaled = await mark
    .clone()
    .resize(box, box, { fit: 'inside', kernel: 'lanczos3', background: CLEAR })
    .toBuffer({ resolveWithObject: true });
  const left = Math.round((size - scaled.info.width) / 2);
  const top = Math.round((size - scaled.info.height) / 2);
  await sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: scaled.data, left, top }])
    .png()
    .toFile(out);
  return { width: scaled.info.width, height: scaled.info.height };
}

/** Android's monochrome layer: the silhouette in black, which the launcher tints. */
async function monochrome(mark, size, fraction, out) {
  const box = Math.round(size * fraction);
  const scaled = await mark.clone().resize(box, box, { fit: 'inside', kernel: 'lanczos3', background: CLEAR }).toBuffer({ resolveWithObject: true });
  const { data, info } = await sharp(scaled.data).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    data[i] = 0;
    data[i + 1] = 0;
    data[i + 2] = 0;
  }
  const left = Math.round((size - info.width) / 2);
  const top = Math.round((size - info.height) / 2);
  await sharp({ create: { width: size, height: size, channels: 4, background: CLEAR } })
    .composite([{ input: await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer(), left, top }])
    .png()
    .toFile(out);
}

const mark = await shieldMark();
const size = await mark.clone().metadata();
console.log(`shield cut from the sheet: ${size.width}x${size.height}`);

mkdirSync(join(DASHBOARD, 'public'), { recursive: true });
const asset = (...p) => join(MOBILE, 'assets', ...p);

// The mark keeps its own colours, so every background is white; the shield's navy carries the contrast
const placed = await compose(mark, 1024, SAFE, WHITE, asset('icon.png'));
console.log(`icon.png 1024x1024, mark ${placed.width}x${placed.height} (${Math.round((placed.width / 1024) * 100)}% of the canvas)`);
await compose(mark, 1024, SAFE, CLEAR, asset('adaptive-icon-foreground.png'));
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: WHITE } }).png().toFile(asset('adaptive-icon-background.png'));
await monochrome(mark, 1024, SAFE, asset('adaptive-icon-monochrome.png'));
// The splash image is sized by `imageWidth` in app.json, so it carries no padding of its own
await compose(mark, 1024, 1, CLEAR, asset('splash.png'));

// Dashboard: a favicon on a navy plate reads on light and dark tab bars; the lockup mark is bare
await compose(mark, 180, 0.8, WHITE, join(DASHBOARD, 'public', 'favicon.png'));
await compose(mark, 512, 1, CLEAR, join(DASHBOARD, 'public', 'logo-mark.png'));
console.log('wrote mobile/assets/{icon,adaptive-icon-foreground,adaptive-icon-background,adaptive-icon-monochrome,splash}.png');
console.log('wrote dashboard/public/{favicon.png,logo-mark.png}');
console.log(`navy reference ${NAVY.r},${NAVY.g},${NAVY.b} (unused when the mark keeps its own colours)`);
