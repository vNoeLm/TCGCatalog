/**
 * Compact, zero-dependency ISO/IEC 18004 QR Code matrix generator (Byte mode, EC Level L, Versions 1–5).
 * Used for instant tournament / meetup trade binder QR code sharing.
 */

interface QrVersionSpec {
  version: number;
  size: number;
  dataCodewords: number;
  ecCodewords: number;
  align: number[];
}

const VERSIONS: QrVersionSpec[] = [
  { version: 1, size: 21, dataCodewords: 19, ecCodewords: 7, align: [] },
  { version: 2, size: 25, dataCodewords: 34, ecCodewords: 10, align: [6, 18] },
  { version: 3, size: 29, dataCodewords: 55, ecCodewords: 15, align: [6, 22] },
  { version: 4, size: 33, dataCodewords: 80, ecCodewords: 20, align: [6, 26] },
  { version: 5, size: 37, dataCodewords: 108, ecCodewords: 26, align: [6, 30] },
];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function reedSolomonGenerator(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const root = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

function reedSolomonEncode(data: Uint8Array, ecLen: number): Uint8Array {
  const gen = reedSolomonGenerator(ecLen);
  const rem = new Uint8Array(ecLen);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecLen - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecLen; j++) {
        rem[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return rem;
}

export function encodeQrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  const spec = VERSIONS.find((v) => bytes.length + 2 <= v.dataCodewords) || VERSIONS[VERSIONS.length - 1];
  const payload = bytes.slice(0, spec.dataCodewords - 2);

  // Build bit stream: 4-bit mode (0100 = Byte), 8-bit length, payload, terminator, pad bytes
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  pushBits(0b0100, 4);
  pushBits(payload.length, 8);
  for (const b of payload) pushBits(b, 8);

  const maxBits = spec.dataCodewords * 8;
  const term = Math.min(4, maxBits - bits.length);
  pushBits(0, term);
  while (bits.length % 8 !== 0) bits.push(0);

  const data = new Uint8Array(spec.dataCodewords);
  for (let i = 0; i < bits.length / 8; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) byte = (byte << 1) | bits[i * 8 + b];
    data[i] = byte;
  }
  const pads = [0xec, 0x11];
  for (let i = bits.length / 8, p = 0; i < spec.dataCodewords; i++, p ^= 1) {
    data[i] = pads[p];
  }

  const ec = reedSolomonEncode(data, spec.ecCodewords);
  const allCodewords = new Uint8Array(data.length + ec.length);
  allCodewords.set(data, 0);
  allCodewords.set(ec, data.length);

  const N = spec.size;
  const modules: boolean[][] = Array.from({ length: N }, () => Array(N).fill(false));
  const reserved: boolean[][] = Array.from({ length: N }, () => Array(N).fill(false));

  const setModule = (r: number, c: number, dark: boolean) => {
    if (r >= 0 && r < N && c >= 0 && c < N) {
      modules[r][c] = dark;
      reserved[r][c] = true;
    }
  };

  // Finder patterns + separators
  const placeFinder = (top: number, left: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const inOuter = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const onBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const inInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setModule(top + r, left + c, inOuter && (onBorder || inInner));
      }
    }
  };
  placeFinder(0, 0);
  placeFinder(0, N - 7);
  placeFinder(N - 7, 0);

  // Timing patterns
  for (let i = 8; i < N - 8; i++) {
    setModule(6, i, i % 2 === 0);
    setModule(i, 6, i % 2 === 0);
  }

  // Alignment patterns
  for (const ar of spec.align) {
    for (const ac of spec.align) {
      if ((ar === 6 && ac === 6) || (ar === 6 && ac === N - 7) || (ar === N - 7 && ac === 6)) continue;
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const dark = Math.max(Math.abs(r), Math.abs(c)) !== 1;
          setModule(ar + r, ac + c, dark);
        }
      }
    }
  }

  // Reserve format info areas & dark module
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      reserved[8][i] = true;
      reserved[i][8] = true;
    }
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][N - 1 - i] = true;
    reserved[N - 1 - i][8] = true;
  }
  setModule(N - 8, 8, true);

  // Place data bits upward/downward in 2-column strips
  const fullBits: number[] = [];
  for (const cw of allCodewords) {
    for (let b = 7; b >= 0; b--) fullBits.push((cw >> b) & 1);
  }

  let bitIdx = 0;
  let upward = true;
  for (let col = N - 1; col >= 1; col -= 2) {
    if (col === 6) col = 5;
    for (let step = 0; step < N; step++) {
      const r = upward ? N - 1 - step : step;
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        if (!reserved[r][c]) {
          const bit = bitIdx < fullBits.length ? fullBits[bitIdx++] === 1 : false;
          // Mask pattern 0: (r + c) % 2 === 0
          const masked = (r + c) % 2 === 0 ? !bit : bit;
          modules[r][c] = masked;
        }
      }
    }
    upward = !upward;
  }

  // Format information for EC Level L (01) + Mask 0 (000) -> precomputed BCH & XOR 0x5412 = 0x77c4
  const formatBits = 0x77c4;
  for (let i = 0; i < 15; i++) {
    const bit = ((formatBits >> i) & 1) === 1;
    // Around top-left
    if (i < 6) modules[i][8] = bit;
    else if (i < 8) modules[i + 1][8] = bit;
    else if (i === 8) modules[8][7] = bit;
    else modules[8][14 - i] = bit;

    // Split across bottom-left and top-right
    if (i < 8) modules[8][N - 1 - i] = bit;
    else modules[N - 15 + i][8] = bit;
  }

  return modules;
}
