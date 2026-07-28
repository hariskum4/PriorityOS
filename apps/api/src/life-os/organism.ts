/**
 * The Organism — one life, grown rather than drawn.
 *
 * Four published algorithms composed over the data the engines already hold.
 * None of them are decoration; each one is load-bearing:
 *
 *   space colonization  Runions, Fuhrer, Lane & Prusinkiewicz (2005). Branches
 *                       grow toward unclaimed attractor points. The attractors
 *                       here ARE the acts — every call, mission, memory — so a
 *                       limb's shape is the trace of reaching for real things.
 *
 *   Murray's law        r_parent^3 = sum(r_child^3), the rule vasculature and
 *                       tree limbs obey. Because it is a conservation law, the
 *                       trunk is the honest sum of everything downstream: no
 *                       limb can be inflated without it showing at the centre.
 *
 *   golden angle        Vogel (1979). Acts are placed at successive 137.507°
 *                       turns, so a domain holds four of them or four hundred
 *                       without ever colliding or falling into rows.
 *
 *   Gray-Scott          Turing (1952). The field the branches grow through,
 *                       fed per-direction by the LifeGraph's own signed
 *                       influence. Regions the graph is draining lose their
 *                       pattern; regions being fed hold it.
 *
 * Rendered to a plain SVG string so the client draws one image instead of
 * thousands of nodes.
 */

/** Hand-placed angles, matching the Today constellation. A life is not a clock. */
const ANGLE: Record<string, number> = {
  partner: 84, family: 108, children: 133, friends: 159,
  finance: 182, career: 206, impact: 233, reflection: 258,
  purpose: 286, health: 318, experiences: 38, growth: 62,
};

const BRASS = '#C08A3E';
const GOLDEN = (137.507764 * Math.PI) / 180;

const W = 1400;
const CX = 700;
const CY = 700;
const R_MAX = 590;
const R_CORE = 46;

const D_STEP = 7;
const R_INFLUENCE = 130;
const R_KILL = 15;
const MAX_ITERS = 420;
const CELL = 20;

export interface OrganismDomain {
  domainType: string;
  importance: number;
  attention: number;
  acts: number;
  /** Net signed influence arriving from the LifeGraph. Feeds the Turing field. */
  net: number;
  color: string;
}

export interface OrganismOptions {
  seed?: number;
  /** The Turing field costs ~1s of CPU. Off for previews, on for the Record. */
  field?: boolean;
  fieldSize?: number;
  fieldSteps?: number;
  /** The sky it is drawn on. Matches the app's two, so it never looks pasted in. */
  ground?: string;
  /** Dust is stars at night and nothing at all on parchment. */
  dust?: string | null;
  /** Ink darkens on parchment; limbs need the extra weight to read. */
  inkWeight?: number;
  /** How present the Turing field is. Parchment swallows it, so it lifts. */
  fieldGain?: number;
}

/** Mulberry32 — small, fast, and identical run to run, which the cache needs. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pt = [number, number];

function attractors(
  rand: () => number, angleDeg: number, halfWidth: number,
  rFrom: number, rTo: number, n: number,
): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const u = rand() * 0.9 + t * 0.1;
    const r = Math.sqrt(rFrom * rFrom + (rTo * rTo - rFrom * rFrom) * u);
    const spread = halfWidth * (0.35 + (0.65 * (r - rFrom)) / Math.max(1, rTo - rFrom));
    const off = (((i * GOLDEN) % (2 * Math.PI)) / Math.PI) - 1;
    const a = ((angleDeg + off * spread + (rand() - 0.5) * 0.7 * spread) * Math.PI) / 180;
    pts.push([CX + r * Math.cos(a), CY - r * Math.sin(a)]);
  }
  return pts;
}

/** One tree, rooted at the nucleus, reaching only for its own domain's acts. */
function grow(rand: () => number, angleDeg: number, cloud: Pt[]) {
  const a0 = (angleDeg * Math.PI) / 180;
  const pos: Pt[] = [[CX + 14 * Math.cos(a0), CY - 14 * Math.sin(a0)]];
  const parent: number[] = [-1];
  let live = cloud.slice();

  const grid = new Map<string, number[]>();
  const put = (i: number) => {
    const k = `${Math.floor(pos[i][0] / CELL)},${Math.floor(pos[i][1] / CELL)}`;
    const bucket = grid.get(k);
    if (bucket) bucket.push(i);
    else grid.set(k, [i]);
  };
  put(0);
  const rings = Math.ceil(R_INFLUENCE / CELL) + 2;

  const nearest = (ax: number, ay: number): [number, number] => {
    const gx = Math.floor(ax / CELL);
    const gy = Math.floor(ay / CELL);
    let best = -1;
    let bd = Infinity;
    for (let ring = 0; ring < rings; ring++) {
      let found = false;
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dy = -ring; dy <= ring; dy++) {
          if (ring && Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const bucket = grid.get(`${gx + dx},${gy + dy}`);
          if (!bucket) continue;
          for (const i of bucket) {
            const d = (ax - pos[i][0]) ** 2 + (ay - pos[i][1]) ** 2;
            if (d < bd) { bd = d; best = i; }
            found = true;
          }
        }
      }
      if (found && best >= 0 && Math.sqrt(bd) <= ring * CELL) break;
    }
    if (best < 0) {
      // Early on the crown is far from the nucleus and the local rings come
      // back empty. The tree is tiny then, so a full scan is cheap.
      for (let i = 0; i < pos.length; i++) {
        const d = (ax - pos[i][0]) ** 2 + (ay - pos[i][1]) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
    }
    return [best, Math.sqrt(bd)];
  };

  for (let iter = 0; iter < MAX_ITERS && live.length; iter++) {
    const pull = new Map<number, Pt[]>();
    const keep: Pt[] = [];
    for (const a of live) {
      const [i, d] = nearest(a[0], a[1]);
      if (i < 0) { keep.push(a); continue; }
      if (d < R_KILL) continue;
      keep.push(a);
      if (d < R_INFLUENCE) {
        const bucket = pull.get(i);
        if (bucket) bucket.push(a);
        else pull.set(i, [a]);
      }
    }
    live = keep;

    if (!pull.size) {
      // Nothing in range: extend the closest node toward the cloud. This is
      // what draws a trunk out of the nucleus before the crown branches.
      let bestPair: [number, number, number] | null = null;
      let bd = Infinity;
      for (const a of live) {
        const [i, d] = nearest(a[0], a[1]);
        if (i >= 0 && d < bd) { bd = d; bestPair = [i, a[0], a[1]]; }
      }
      if (!bestPair) break;
      const [i, ax, ay] = bestPair;
      const [nx, ny] = pos[i];
      const m = Math.hypot(ax - nx, ay - ny) || 1;
      pos.push([nx + ((ax - nx) / m) * D_STEP, ny + ((ay - ny) / m) * D_STEP]);
      parent.push(i);
      put(pos.length - 1);
      continue;
    }

    for (const [i, pts] of pull) {
      const [nx, ny] = pos[i];
      let vx = 0;
      let vy = 0;
      for (const [ax, ay] of pts) {
        const m = Math.hypot(ax - nx, ay - ny) || 1;
        vx += (ax - nx) / m;
        vy += (ay - ny) / m;
      }
      const m = Math.hypot(vx, vy) || 1;
      vx /= m; vy /= m;
      const j = (rand() - 0.5) * 0.36;
      const cs = Math.cos(j);
      const sn = Math.sin(j);
      const rx = vx * cs - vy * sn;
      const ry = vx * sn + vy * cs;
      const px = nx + rx * D_STEP;
      const py = ny + ry * D_STEP;
      if (Math.hypot(px - CX, py - CY) > R_MAX) continue;
      pos.push([px, py]);
      parent.push(i);
      put(pos.length - 1);
    }
  }
  return { pos, parent };
}

/** r_parent^3 = sum(r_child^3). */
function murray(pos: Pt[], parent: number[], leaf = 0.85) {
  const kids: number[][] = pos.map(() => []);
  parent.forEach((p, i) => { if (p >= 0) kids[p].push(i); });
  const t = new Array(pos.length).fill(0);
  for (let i = pos.length - 1; i >= 0; i--) {
    t[i] = kids[i].length
      ? Math.cbrt(kids[i].reduce((s, k) => s + t[k] ** 3, 0))
      : leaf;
  }
  return { t, kids };
}

/** Fork-to-fork runs: thickness only changes at a fork, so each run is one path. */
function chains(pos: Pt[], parent: number[], kids: number[][], t: number[]) {
  const out: Array<{ run: Pt[]; th: number }> = [];
  for (let s = 0; s < pos.length; s++) {
    if (!(parent[s] < 0 || kids[parent[s]].length > 1)) continue;
    const run: Pt[] = parent[s] < 0 ? [pos[s]] : [pos[parent[s]], pos[s]];
    let cur = s;
    while (kids[cur].length === 1) {
      cur = kids[cur][0];
      run.push(pos[cur]);
    }
    if (run.length > 1) out.push({ run, th: t[s] });
  }
  return out;
}

function catmullClosed(pts: Pt[]): string {
  const n = pts.length;
  const d = [`M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d.push(`C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} `
      + `${p2[0].toFixed(1)},${p2[1].toFixed(1)}`);
  }
  return `${d.join(' ')} Z`;
}

/* ── the Turing field ──────────────────────────────────────────────────── */

function hexRgb(h: string): [number, number, number] {
  return [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
}

/** Circular linear interpolation of a per-domain quantity over every angle. */
function overAngle(angles: number[], vals: number[], deg: number): number {
  const order = angles.map((a, i) => i).sort((x, y) => angles[x] - angles[y]);
  const A = order.map((i) => angles[i]);
  const V = order.map((i) => vals[i]);
  A.push(A[0] + 360);
  V.push(V[0]);
  let a = deg;
  if (a < A[0]) a += 360;
  let i = 0;
  while (i < A.length - 2 && A[i + 1] <= a) i++;
  const t = (a - A[i]) / (A[i + 1] - A[i]);
  return V[i] * (1 - t) + V[i + 1] * t;
}

const DU = 0.16;
const DV = 0.08;
const F_LOW = 0.026;
const F_HIGH = 0.05;
const K_LOW = 0.0625;
const K_HIGH = 0.0605;

/**
 * Gray-Scott over a square grid, with the feed rate read per-direction from
 * the influence field. Returns a data: URI so the SVG stays self-contained.
 */
function turingField(
  rand: () => number,
  domains: OrganismDomain[],
  reachFrac: Record<string, number>,
  n: number,
  steps: number,
  gain: number,
): string | null {
  const angles = domains.map((d) => ANGLE[d.domainType] ?? 0);
  const nets = domains.map((d) => d.net);
  const lo = Math.min(...nets);
  const span = (Math.max(...nets) - lo) || 1;

  const size = n * n;
  const u = new Float64Array(size).fill(1);
  const v = new Float64Array(size);
  const feed = new Float64Array(size);
  const kill = new Float64Array(size);
  const edge = new Float64Array(size);
  const rgb = new Uint8Array(size * 3);

  const c = (n - 1) / 2;
  const reaches = domains.map((d) => reachFrac[d.domainType] ?? 0.6);
  const reds = domains.map((d) => hexRgb(d.color)[0]);
  const greens = domains.map((d) => hexRgb(d.color)[1]);
  const blues = domains.map((d) => hexRgb(d.color)[2]);

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const dx = x - c;
      const dy = c - y;
      const rad = Math.hypot(dx, dy) / (n / 2);
      const deg = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
      const s = Math.max(0, Math.min(1, (overAngle(angles, nets, deg) - lo) / span));
      feed[i] = F_LOW + (F_HIGH - F_LOW) * s;
      kill[i] = K_LOW + (K_HIGH - K_LOW) * s;
      const limit = overAngle(angles, reaches, deg);
      const e = Math.max(0, Math.min(1, (limit - rad) / (0.2 * Math.max(limit, 1e-6))));
      edge[i] = e * e;
      rgb[i * 3] = overAngle(angles, reds, deg);
      rgb[i * 3 + 1] = overAngle(angles, greens, deg);
      rgb[i * 3 + 2] = overAngle(angles, blues, deg);
    }
  }

  // Seed along each limb, strength from attention: the reaction starts where
  // the life actually put itself.
  for (const d of domains) {
    const angle = ANGLE[d.domainType] ?? 0;
    const half = 6 + 9 * (d.importance / 100);
    const blobs = 3 + Math.floor((6 * d.attention) / 100);
    for (let b = 0; b < blobs; b++) {
      const rr = (0.18 + rand() * 0.74) * (reachFrac[d.domainType] ?? 0.6);
      const aa = ((angle + (rand() - 0.5) * 2 * half) * Math.PI) / 180;
      const px = c + rr * (n / 2) * Math.cos(aa);
      const py = c - rr * (n / 2) * Math.sin(aa);
      const rad = n * 0.022;
      for (let y = Math.max(0, Math.floor(py - rad)); y < Math.min(n, py + rad); y++) {
        for (let x = Math.max(0, Math.floor(px - rad)); x < Math.min(n, px + rad); x++) {
          if ((x - px) ** 2 + (y - py) ** 2 > rad * rad) continue;
          const i = y * n + x;
          v[i] = 0.5;
          u[i] = 0.25;
        }
      }
    }
  }

  const un = new Float64Array(size);
  const vn = new Float64Array(size);
  for (let step = 0; step < steps; step++) {
    for (let y = 0; y < n; y++) {
      const up = ((y - 1 + n) % n) * n;
      const dn = ((y + 1) % n) * n;
      const row = y * n;
      for (let x = 0; x < n; x++) {
        const i = row + x;
        const lf = row + ((x - 1 + n) % n);
        const rt = row + ((x + 1) % n);
        const lapU = u[up + x] + u[dn + x] + u[lf] + u[rt] - 4 * u[i];
        const lapV = v[up + x] + v[dn + x] + v[lf] + v[rt] - 4 * v[i];
        const uvv = u[i] * v[i] * v[i];
        let nu = u[i] + DU * lapU - uvv + feed[i] * (1 - u[i]);
        let nv = v[i] + DV * lapV + uvv - (feed[i] + kill[i]) * v[i];
        nu = nu < 0 ? 0 : nu > 1 ? 1 : nu;
        nv = nv < 0 ? 0 : nv > 1 ? 1 : nv;
        un[i] = nu;
        vn[i] = nv;
      }
    }
    u.set(un);
    v.set(vn);
  }

  let peak = 0;
  for (let i = 0; i < size; i++) {
    const a = v[i] * edge[i];
    if (a > peak) peak = a;
  }
  if (peak <= 1e-6) return null;

  const rgba = Buffer.alloc(size * 4);
  for (let i = 0; i < size; i++) {
    const a = (v[i] * edge[i]) / peak;
    rgba[i * 4] = rgb[i * 3];
    rgba[i * 4 + 1] = rgb[i * 3 + 1];
    rgba[i * 4 + 2] = rgb[i * 3 + 2];
    rgba[i * 4 + 3] = Math.round(Math.pow(a, 0.85) * 255 * gain);
  }
  return pngDataUri(rgba, n);
}

/** Minimal RGBA PNG writer — avoids pulling an image dependency into the API. */
function pngDataUri(rgba: Buffer, n: number): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const zlib = require('zlib') as typeof import('zlib');
  const raw = Buffer.alloc(n * (n * 4 + 1));
  for (let y = 0; y < n; y++) {
    raw[y * (n * 4 + 1)] = 0;
    rgba.copy(raw, y * (n * 4 + 1) + 1, y * n * 4, (y + 1) * n * 4);
  }
  const chunk = (tag: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(tag, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0);
  ihdr.writeUInt32BE(n, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

let CRC_TABLE: number[] | null = null;
function crc32(buf: Buffer): number {
  if (!CRC_TABLE) {
    CRC_TABLE = [];
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[i] = c;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return crc ^ 0xffffffff;
}

/* ── the render ────────────────────────────────────────────────────────── */

export function renderOrganism(
  domains: OrganismDomain[],
  opts: OrganismOptions = {},
): string {
  const rand = rng(opts.seed ?? 7);
  const live = domains.filter((d) => ANGLE[d.domainType] !== undefined);
  if (!live.length) return '';

  const ground = opts.ground ?? '#070B12';
  const inkWeight = opts.inkWeight ?? 1;

  /**
   * The starfield is drawn on midnight and omitted on parchment — but the
   * draws happen either way.
   *
   * One life must grow one body regardless of theme, which means both paths
   * have to consume the random stream identically. Counting the draws by hand
   * got it wrong (four per particle, three skipped) and the two skies quietly
   * diverged; running the same loop and discarding the output makes that
   * impossible to get wrong again.
   */
  const dust: string[] = [];
  const showDust = opts.dust !== null;
  for (let i = 0; i < 380; i++) {
    const a = rand() * 2 * Math.PI;
    const r = R_MAX * Math.sqrt(rand()) * 1.06;
    const size = (0.5 + rand() * 0.3).toFixed(1);
    const fade = (0.05 + rand() * 0.11).toFixed(2);
    if (!showDust) continue;
    dust.push(`<circle cx="${(CX + r * Math.cos(a)).toFixed(0)}" `
      + `cy="${(CY - r * Math.sin(a)).toFixed(0)}" r="${size}" `
      + `fill="${opts.dust ?? '#E9DCC4'}" opacity="${fade}"/>`);
  }

  const rings = [0.3, 0.52, 0.78, 1].map((f, i) => {
    const dash = i === 1 || i === 3 ? ' stroke-dasharray="2 9"' : '';
    return `<circle cx="${CX}" cy="${CY}" r="${(R_MAX * f).toFixed(0)}" fill="none" `
      + `stroke="${BRASS}" stroke-width="0.6" opacity="0.10"${dash}/>`;
  });

  const body: string[] = [];
  const tips: Record<string, Pt> = {};
  const reachFrac: Record<string, number> = {};

  for (const d of live) {
    const angle = ANGLE[d.domainType];
    const half = 6 + 9 * (d.importance / 100);
    const reach = R_CORE + (R_MAX - R_CORE - 40) * (0.42 + (0.58 * d.attention) / 100);
    reachFrac[d.domainType] = reach / R_MAX;
    const n = Math.round(260 + 700 * Math.min(1, d.acts / 100));
    const cloud = attractors(rand, angle, half, R_CORE + 6, reach, n);
    const { pos, parent } = grow(rand, angle, cloud);
    const { t, kids } = murray(pos, parent);

    for (const { run, th } of chains(pos, parent, kids, t)) {
      const capped = Math.min(th, 7);
      const op = Math.min(1, (0.58 + 0.36 * Math.min(1, capped / 5.5)) * inkWeight);
      const dPath = `M${run[0][0].toFixed(1)},${run[0][1].toFixed(1)} `
        + run.slice(1).map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
      body.push(`<path d="${dPath}" fill="none" stroke="${d.color}" `
        + `stroke-width="${Math.max(0.8, capped).toFixed(2)}" stroke-linecap="round" `
        + `stroke-linejoin="round" opacity="${op.toFixed(2)}"/>`);
    }

    let far = 0;
    for (let i = 0; i < pos.length; i++) {
      if (kids[i].length) continue;
      far = Math.max(far, Math.hypot(pos[i][0] - CX, pos[i][1] - CY));
      body.push(`<circle cx="${pos[i][0].toFixed(1)}" cy="${pos[i][1].toFixed(1)}" `
        + `r="1.7" fill="${d.color}" opacity="0.95"/>`);
    }
    const a = (angle * Math.PI) / 180;
    tips[d.domainType] = [CX + (far + 16) * Math.cos(a), CY - (far + 16) * Math.sin(a)];
  }

  const span = Math.max(...Object.values(tips).map(([x, y]) => Math.hypot(x - CX, y - CY)));
  const box = Math.min(R_MAX, span * 1.1);

  let fieldTag = '';
  if (opts.field !== false) {
    const uri = turingField(
      rand, live, reachFrac,
      opts.fieldSize ?? 176,
      opts.fieldSteps ?? 1800,
      opts.fieldGain ?? 0.24,
    );
    if (uri) {
      fieldTag = `<image href="${uri}" x="${CX - R_MAX}" y="${CY - R_MAX}" `
        + `width="${2 * R_MAX}" height="${2 * R_MAX}" preserveAspectRatio="none"/>`;
    }
  }

  const ordered = Object.keys(tips).sort((a, b) => ANGLE[b] - ANGLE[a]).map((k) => tips[k]);
  const membrane = `<path d="${catmullClosed(ordered)}" fill="none" stroke="${BRASS}" `
    + `stroke-width="1.4" opacity="0.30" stroke-dasharray="6 7"/>`;

  /**
   * A text alternative, because the whole image is encoded in colour.
   *
   * Twelve hues carrying twelve domains is unreadable for anyone with a common
   * colour deficiency, and unreadable full stop for a screen reader. The SVG
   * therefore says out loud what it is drawing: which domains reach furthest,
   * which are barely there. The Record's own words sit directly beneath it, so
   * nothing here is the only copy of anything.
   */
  const described = [...live]
    .sort((a, b) => b.attention - a.attention)
    .map((d) => `${d.domainType}: ${d.acts} ${d.acts === 1 ? 'act' : 'acts'}, `
      + `attention ${Math.round(d.attention)} against importance ${Math.round(d.importance)}`);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" viewBox="${(CX - box).toFixed(0)} `
      + `${(CY - box).toFixed(0)} ${(2 * box).toFixed(0)} ${(2 * box).toFixed(0)}" `
      + `width="${(2 * box).toFixed(0)}" height="${(2 * box).toFixed(0)}">`,
    // "transparent" lets the screen it sits on be the sky, which is what keeps
    // it from reading as an image pasted into the page.
    '<title>Your life as one organism, grown from what you have actually done.</title>',
    `<desc>${described.join('. ')}.</desc>`,
    ground === 'transparent' ? '' : `<rect x="0" y="0" width="${W}" height="${W}" fill="${ground}"/>`,
    ...dust,
    ...rings,
    fieldTag,
    membrane,
    ...body,
    `<circle cx="${CX}" cy="${CY}" r="26" fill="none" stroke="${BRASS}" stroke-width="0.8" opacity="0.30"/>`,
    `<circle cx="${CX}" cy="${CY}" r="11" fill="none" stroke="${BRASS}" stroke-width="1.1" opacity="0.75"/>`,
    `<circle cx="${CX}" cy="${CY}" r="4.2" fill="${BRASS}" opacity="0.95"/>`,
    '</svg>',
  ].filter(Boolean).join('\n');
}
