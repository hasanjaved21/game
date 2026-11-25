import { MAP_HEIGHT, MAP_WIDTH } from '../data/presets';

/**
 * Flood-fills from map edges across light pixels to classify Water (1) vs Land (0).
 * Black outline borders (luminance < 200) act as coastline boundaries.
 */
export function buildWaterMask(img: HTMLImageElement): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = MAP_WIDTH;
  canvas.height = MAP_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
  }

  ctx.drawImage(img, 0, 0, MAP_WIDTH, MAP_HEIGHT);
  const { data } = ctx.getImageData(0, 0, MAP_WIDTH, MAP_HEIGHT);

  const total = MAP_WIDTH * MAP_HEIGHT;
  const isBorder = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const off = i * 4;
    const lum = (data[off] + data[off + 1] + data[off + 2]) / 3;
    if (lum < 200) {
      isBorder[i] = 1;
    }
  }

  const isWater = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const seed = (x: number, y: number) => {
    const idx = y * MAP_WIDTH + x;
    if (!isBorder[idx] && !isWater[idx]) {
      isWater[idx] = 1;
      queue[tail++] = idx;
    }
  };

  seed(0, 0);
  seed(MAP_WIDTH - 1, 0);
  seed(0, MAP_HEIGHT - 1);
  seed(MAP_WIDTH - 1, MAP_HEIGHT - 1);

  while (head < tail) {
    const idx = queue[head++];
    const x = idx % MAP_WIDTH;
    const y = (idx / MAP_WIDTH) | 0;

    if (x > 0) {
      const n = idx - 1;
      if (!isBorder[n] && !isWater[n]) {
        isWater[n] = 1;
        queue[tail++] = n;
      }
    }
    if (x < MAP_WIDTH - 1) {
      const n = idx + 1;
      if (!isBorder[n] && !isWater[n]) {
        isWater[n] = 1;
        queue[tail++] = n;
      }
    }
    if (y > 0) {
      const n = idx - MAP_WIDTH;
      if (!isBorder[n] && !isWater[n]) {
        isWater[n] = 1;
        queue[tail++] = n;
      }
    }
    if (y < MAP_HEIGHT - 1) {
      const n = idx + MAP_WIDTH;
      if (!isBorder[n] && !isWater[n]) {
        isWater[n] = 1;
        queue[tail++] = n;
      }
    }
  }

  return isWater;
}

export function isWaterAt(mask: Uint8Array | null, x: number, y: number): boolean {
  if (!mask) return false;
  const px = Math.max(0, Math.min(MAP_WIDTH - 1, Math.round(x)));
  const py = Math.max(0, Math.min(MAP_HEIGHT - 1, Math.round(y)));
  return mask[py * MAP_WIDTH + px] === 1;
}

export function findNearestLand(
  mask: Uint8Array | null,
  x: number,
  y: number,
  maxRadius = 140
): { x: number; y: number } | null {
  if (!mask) return { x, y };
  if (!isWaterAt(mask, x, y)) return { x, y };

  for (let r = 3; r <= maxRadius; r += 3) {
    const steps = Math.max(12, Math.floor((Math.PI * 2 * r) / 4));
    for (let i = 0; i < steps; i++) {
      const ang = (Math.PI * 2 * i) / steps;
      const cx = Math.round(x + Math.cos(ang) * r);
      const cy = Math.round(y + Math.sin(ang) * r);
      if (cx >= 10 && cx < MAP_WIDTH - 10 && cy >= 10 && cy < MAP_HEIGHT - 10) {
        if (mask[cy * MAP_WIDTH + cx] === 0) {
          return { x: cx, y: cy };
        }
      }
    }
  }
  return null;
}

export function findNearestWater(
  mask: Uint8Array | null,
  x: number,
  y: number,
  maxRadius = 160
): { x: number; y: number } | null {
  if (!mask) return { x, y };
  if (isWaterAt(mask, x, y)) return { x, y };

  for (let r = 4; r <= maxRadius; r += 4) {
    const steps = Math.max(12, Math.floor((Math.PI * 2 * r) / 5));
    for (let i = 0; i < steps; i++) {
      const ang = (Math.PI * 2 * i) / steps;
      const cx = Math.round(x + Math.cos(ang) * r);
      const cy = Math.round(y + Math.sin(ang) * r);
      if (cx >= 12 && cx < MAP_WIDTH - 12 && cy >= 12 && cy < MAP_HEIGHT - 12) {
        if (mask[cy * MAP_WIDTH + cx] === 1) {
          return { x: cx, y: cy };
        }
      }
    }
  }
  return null;
}
