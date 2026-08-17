import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const INPUT = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(desktopRoot, "branding/app-icon-source.png");
const OUTPUT = process.argv[3]
  ? path.resolve(process.argv[3])
  : INPUT;
const SIZE = 1024;
const PADDING = 0.03;

function sampleBackground(data, width, height, channels) {
  const points = [
    [2, 2],
    [width - 3, 2],
    [2, height - 3],
    [width - 3, height - 3],
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const [x, y] of points) {
    const i = (y * width + x) * channels;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  return { r: r / 4, g: g / 4, b: b / 4 };
}

function colorDistance(r1, g1, b1, r2, g2, b2) {
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

function matchesBackground(r, g, b, bg) {
  const bgDist = colorDistance(r, g, b, bg.r, bg.g, bg.b);
  if (bgDist < 52) return true;
  if (r >= 205 && g >= 200 && b >= 188 && bgDist < 78) return true;

  // Tan watercolor shadow connected to the paper background.
  if (
    r >= 175 &&
    r <= 215 &&
    g >= 150 &&
    g <= 195 &&
    b >= 120 &&
    b <= 170 &&
    r - b < 75
  ) {
    return true;
  }

  return false;
}

function removeEdgeBackground(data, width, height, channels, bg) {
  const visited = new Uint8Array(width * height);
  const queue = [];

  const pushIfBackground = (x, y) => {
    const idx = y * width + x;
    if (visited[idx]) return;
    const i = idx * channels;
    if (!matchesBackground(data[i], data[i + 1], data[i + 2], bg)) return;
    visited[idx] = 1;
    queue.push(idx);
  };

  for (let x = 0; x < width; x++) {
    pushIfBackground(x, 0);
    pushIfBackground(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    pushIfBackground(0, y);
    pushIfBackground(width - 1, y);
  }

  while (queue.length > 0) {
    const idx = queue.pop();
    const x = idx % width;
    const y = (idx - x) / width;
    const i = idx * channels;
    data[i + 3] = 0;

    if (x > 0) pushIfBackground(x - 1, y);
    if (x < width - 1) pushIfBackground(x + 1, y);
    if (y > 0) pushIfBackground(x, y - 1);
    if (y < height - 1) pushIfBackground(x, y + 1);
  }
}

function findBounds(data, width, height, channels) {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      if (data[i + 3] > 24) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

const RAW = process.argv.includes("--raw");

await sharp(INPUT).ensureAlpha().raw().toBuffer({ resolveWithObject: true }).then(async ({ data, info }) => {
  const { width, height, channels } = info;
  const bg = sampleBackground(data, width, height, channels);
  removeEdgeBackground(data, width, height, channels, bg);

  const bounds = findBounds(data, width, height, channels);
  if (bounds.width <= 0 || bounds.height <= 0) {
    throw new Error("No opaque pixels left after background removal");
  }

  if (RAW) {
    await sharp(data, { raw: { width, height, channels } })
      .extract(bounds)
      .png()
      .toFile(OUTPUT);
    console.log(`[logo] Wrote transparent cutout to ${OUTPUT}`);
    return;
  }

  const cropped = await sharp(data, { raw: { width, height, channels } })
    .extract(bounds)
    .png()
    .toBuffer();

  const inner = Math.round(SIZE * (1 - PADDING * 2));
  const resized = await sharp(cropped)
    .resize(inner, inner, { fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resized, gravity: "center" }])
    .png()
    .toFile(OUTPUT);

  console.log(`[logo] Wrote transparent logo to ${OUTPUT}`);
});
