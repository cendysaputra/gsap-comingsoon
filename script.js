(() => {
    const canvas = document.getElementById('river');
    const title = document.querySelector('.title');

    if (!canvas || !title) {
        return;
    }

    const VERT = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

    // A clear, shallow river seen from straight above, flowing right to left
    // between two grassy banks. Everything is worked out per pixel from a little
    // value noise: no textures other than the words, no geometry, one draw call.
    // Built with LITE defined it drops the rain, the fish, the gravel and the
    // foam, for devices that cannot keep up with the full river.
    const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uRes;       // canvas size in canvas pixels
uniform float uPx;       // canvas pixels per CSS pixel
uniform float uTime;
uniform float uFlow;     // how far the river has flowed, in screen heights
uniform sampler2D uText; // r: the submerged letter mask
uniform vec4 uBox;       // where that texture sits on the page, in CSS pixels
uniform float uTextOn;
uniform vec4 uRip[6];    // pointer ripples: xy in screen heights, start time, flow then

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 hash2(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  // Quintic fade: no crease where one grid cell meets the next.
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 3; i++) {
    s += a * noise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return s;
}

// One size class of stones scattered on the bed. Each stone is its own rounded,
// squashed, randomly turned dome, so stones have gaps between them and may
// overlap. Returns the height of the tallest stone at x (in cell units), its
// surface normal, a random number for it, and how far x is outside the nearest
// stone's outline (negative when inside one).
float stoneLayer(vec2 x, float seed, float density, out vec2 nrm, out float id, out float rim) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  // Pushes the outlines in and out so no stone is a clean ellipse.
  float wobble = (noise(x * 2.7 + seed) - 0.5) * 0.24;
  float best = 0.0;
  nrm = vec2(0.0);
  id = 0.0;
  rim = 1.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 cell = n + g + seed;
      if (hash(cell) > density) continue;
      float k = hash(cell + 31.7);
      vec2 r = g + 0.15 + 0.7 * hash2(cell) - f;
      float angle = k * 6.2832;
      vec2 ax = vec2(cos(angle), sin(angle));
      vec2 ay = vec2(-ax.y, ax.x);
      float radius = 0.30 + 0.30 * fract(k * 13.7);
      float squash = 0.62 + 0.38 * fract(k * 7.1);
      vec2 rl = vec2(dot(r, ax), dot(r, ay) / squash);
      float d = length(rl) / radius + wobble;
      rim = min(rim, d - 1.0);
      float h = sqrt(max(0.0, 1.0 - d * d)) * radius;
      if (h > best) {
        best = h;
        vec2 nl = -rl / radius;
        nrm = ax * nl.x + ay * (nl.y / squash);
        id = k;
      }
    }
  }
  return best;
}

// River stones come in a handful of rock types, each speckled.
vec3 stoneColor(float id, vec2 p) {
  vec3 c = mix(vec3(0.52, 0.50, 0.47), vec3(0.64, 0.54, 0.41), smoothstep(0.25, 0.6, fract(id * 3.3)));
  c = mix(c, vec3(0.27, 0.29, 0.32), step(0.72, fract(id * 5.9)));
  c = mix(c, vec3(0.42, 0.30, 0.23), step(0.86, fract(id * 9.1)));
  c = mix(c, vec3(0.80, 0.78, 0.72), step(0.90, fract(id * 11.3)));
  c *= 0.84 + 0.32 * noise(p * 90.0 + id * 40.0);
  return c;
}

// The stream wanders a little from side to side.
float curve(float x, float t) {
  return 0.045 * sin(x * 2.6 + t * 0.1) + 0.012 * sin(x * 5.3 - t * 0.07 + 1.7);
}

// Surface height at a point in stream space (x runs along the flow).
float height(vec2 q, float t, vec2 warp) {
  // Long swells, stretched along the flow so they read as current, not a pond.
  vec2 s = vec2(q.x * 1.6, q.y * 5.0) + warp * 1.2;
  float h = 0.6 * fbm(s + vec2(t * 0.4, 0.0));
  // Water is thin: most of its relief is small, quick ripples and wind chop.
  h += 0.22 * noise(vec2(q.x * 7.0, q.y * 17.0) + warp * 2.0 - vec2(t * 1.5, 0.0));
  h += 0.10 * noise(vec2(q.x * 23.0, q.y * 47.0) + warp * 3.0 - vec2(t * 3.0, t * 0.6));
#ifndef LITE
  h += 0.045 * noise(vec2(q.x * 45.0, q.y * 85.0) - vec2(t * 4.6, -t * 1.1));
#endif
  return h;
}

#ifndef LITE
// A few small fish, seen from above: a tapered body with a tail fin that beats
// from side to side. They face upstream and work slowly against the current.
float fish(vec2 p, float t, float aspect) {
  float mask = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float s1 = hash(vec2(fi, 1.7));
    float s2 = hash(vec2(fi, 9.2));
    float s3 = hash(vec2(fi, 4.4));
    float span = aspect + 0.3;
    float x = mod(s2 * span + t * (0.012 + 0.02 * s1), span) - 0.15;
    float y = 0.2 + 0.6 * s3 + 0.03 * sin(t * 0.3 + fi * 2.1);
    float heading = 0.25 * sin(t * 0.25 + fi * 1.3);
    vec2 d = p - vec2(x, y);
    float c = cos(heading);
    float s = sin(heading);
    vec2 l = vec2(c * d.x + s * d.y, -s * d.x + c * d.y);
    float len = 0.028 + 0.014 * s1; // half the body length
    float u = l.x / len; // -1 at the tail, 1 at the nose
    if (abs(u) > 1.6) continue;
    // The beat is a wave travelling down the body, widest at the tail.
    float beat = sin(u * 3.0 + t * (6.0 + 3.0 * s2) + fi) * 0.25 * len * (1.0 - smoothstep(-1.0, 0.6, u));
    float v = abs(l.y - beat);
    float body = len * 0.24 * sqrt(max(0.0, 1.0 - u * u)) * (0.55 + 0.45 * smoothstep(-1.0, 0.3, u));
    float m = (1.0 - smoothstep(body - 0.0005, body + 0.0015, v)) * step(abs(u), 1.0);
    float tu = (-u - 0.85) / 0.6; // 0..1 along the tail fin
    float fin = len * 0.3 * tu;
    float mf = (1.0 - smoothstep(fin - 0.0005, fin + 0.001, v)) * step(0.0, tu) * step(tu, 1.0);
    mask = max(mask, max(m, mf * 0.85));
  }
  return mask;
}

// A light drizzle. Seen from above, rain is not streaks but impacts: each drop
// leaves a pinpoint splash and a ring that spreads and fades. Returns the slope
// the rings add to the surface (xy), the brightness of fresh splashes (z) and
// of ring crests (w).
vec4 rain(vec2 p, float t) {
  float cs = 0.16;
  vec2 n = floor(p / cs);
  vec4 acc = vec4(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 cell = n + vec2(float(i), float(j));
      float beat = t * 0.42 + hash(cell + 3.7);
      float turn = floor(beat);
      if (hash(cell + turn * 7.13) > 0.45) continue;
      // A ring lives for the first half of its beat, a little over a second.
      float life = fract(beat) / 0.5;
      if (life > 1.0) continue;
      vec2 centre = (cell + 0.15 + 0.7 * hash2(cell + turn * 1.31)) * cs;
      vec2 dv = p - centre;
      float d = length(dv);
      float x = d - life * 0.07;
      float fade = (1.0 - life) * (1.0 - life);
      float env = exp(-x * x * 2500.0) * fade;
      // Slope of sin(420x) * exp(-2500x^2), pointing away from the centre.
      float slope = (420.0 * cos(x * 420.0) - 5000.0 * x * sin(x * 420.0)) * env;
      acc.xy += slope * dv / max(d, 0.0005);
      acc.z += (1.0 - smoothstep(0.0, 0.007, d)) * (1.0 - smoothstep(0.0, 0.12, life));
      acc.w += max(sin(x * 420.0), 0.0) * env;
    }
  }
  return acc;
}
#endif

// Grass growing in tufts from a bank along one edge of the screen and leaning
// out over the water. p.x runs along the bank, p.y is the distance from it.
// rise is how far up its blade the hit point is (0 at the root, 1 at the tip).
float grass(vec2 p, float t, float seed, out float rise) {
  float cs = 0.03;
  float n = floor(p.x / cs);
  float mask = 0.0;
  rise = 0.0;
  for (int i = -2; i <= 2; i++) {
    float cell = n + float(i);
    // Tufts, with bare bank between them.
    float tuft = smoothstep(0.4, 0.6, noise(vec2(cell * 0.23, seed)));
    for (int b = 0; b < 2; b++) {
      vec2 id = vec2(cell, float(b) + seed);
      float r = hash(id);
      float r2 = hash(id + 3.3);
      float r3 = hash(id + 8.8);
      float h = (0.03 + 0.07 * r) * tuft;
      if (h < 0.005 || p.y > h) continue;
      float a = p.y / h;
      float bx = (cell + r2) * cs;
      // Each blade leans its own way, bows under its weight, and stirs in the wind.
      float cx = bx + (r3 - 0.5) * 0.9 * p.y + (r3 - 0.5) * 6.0 * p.y * p.y
        + 0.012 * sin(t * 1.3 + r * 6.28 + bx * 8.0) * a * a;
      float w = 0.0032 * (1.0 - a) + 0.0004;
      float m = 1.0 - smoothstep(w * 0.5, w, abs(p.x - cx));
      if (m > mask) {
        mask = m;
        rise = a;
      }
    }
  }
  return mask;
}

// Rings spreading from where the pointer touched the water, carried downstream
// as they widen and die away. Returns the slope they give the surface.
vec2 ripples(vec2 p, float t) {
  vec2 slope = vec2(0.0);
  for (int i = 0; i < 6; i++) {
    vec4 r = uRip[i];
    float age = t - r.z;
    if (age < 0.0 || age > 2.5) continue;
    vec2 dv = p - vec2(r.x - (uFlow - r.w), r.y);
    float d = length(dv);
    float x = d - age * 0.22;
    float fade = 1.0 - age / 2.5;
    // Slope of sin(90x) * exp(-900x^2), pointing away from the centre.
    float s = (90.0 * cos(x * 90.0) - 1800.0 * x * sin(x * 90.0)) * exp(-x * x * 900.0) * fade * fade;
    slope += s * dv / max(d, 0.0005);
  }
  return slope;
}

// Light focused by the surface onto the bed: two drifting ridge patterns, multiplied.
float caustics(vec2 p, float t) {
  float a = 1.0 - abs(2.0 * noise(p + vec2(t * 0.7, t * 0.22)) - 1.0);
  float b = 1.0 - abs(2.0 * noise(p * 1.7 - vec2(t * 0.5, t * 0.34) + 3.1) - 1.0);
  return pow(a * b, 3.0);
}

// Transparent outside the texture, even when strong refraction crosses its edge.
float textMask(vec2 at) {
  vec2 st = (at - uBox.xy) / uBox.zw;
  vec2 inside = step(vec2(0.0), st) * step(st, vec2(1.0));
  return texture2D(uText, st).r * inside.x * inside.y * uTextOn;
}

void main() {
  // uv: screen heights, origin bottom-left. css: page pixels, origin top-left.
  vec2 uv = gl_FragCoord.xy / uRes.y;
  vec2 css = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uPx;
  float vh = uRes.y / uPx;
  float t = uTime;

  // Bend everything along the current, then slide it downstream.
  vec2 p = vec2(uv.x, uv.y - curve(uv.x, t));
  vec2 q = vec2(p.x + uFlow, p.y);

  float e = 0.0018;
  vec2 warp = vec2(
    noise(q * 1.3 + vec2(t * 0.2, 0.0)),
    noise(q * 1.3 + vec2(4.7, t * 0.15))
  ) - 0.5;
  float h0 = height(q, t, warp);
  float hx = height(q + vec2(e, 0.0), t, warp);
  float hy = height(q + vec2(0.0, e), t, warp);
  vec2 grad = vec2(h0 - hx, h0 - hy) / e;
#ifndef LITE
  // Raindrops ring the surface and drift with the current.
  vec4 drops = rain(vec2(uv.x + uFlow, uv.y), t);
  grad -= drops.xy * 0.022;
#endif
  grad -= ripples(uv, t) * 0.13;
  vec3 n = normalize(vec3(grad * 0.05, 1.0));
  float tilt = length(n.xy);

  // Deepest along the middle of the stream, with pools and bars that stay put.
  float mid = 1.0 - smoothstep(0.0, 0.62, abs(p.y - 0.5));
  float depth = mix(0.3, 1.0, mid) * (0.75 + 0.5 * fbm(uv * 1.4 + 7.0));

  // The bed does not move; the surface above it bends the view of it.
  vec2 bedUv = uv + n.xy * 0.03 * depth;
  // Sizes of stone lie on sand; whichever stands tallest at a point is seen.
  vec2 n1; vec2 n2; vec2 n3 = vec2(0.0);
  float id1; float id2; float id3 = 0.0;
  float rim1; float rim2; float rim3 = 1.0;
  float h3 = 0.0;
  float h1 = stoneLayer(bedUv * 6.5, 3.0, 0.5, n1, id1, rim1) / 6.5;
  float h2 = stoneLayer(bedUv * 15.0, 17.0, 0.8, n2, id2, rim2) / 15.0;
#ifndef LITE
  h3 = stoneLayer(bedUv * 36.0, 41.0, 0.95, n3, id3, rim3) / 36.0;
#endif

  float top = 0.0; // 0 = sand, then 3, 2, 1 from gravel up to boulders
  float hb = 0.0;
  vec2 nb = vec2(0.0);
  float idb = 0.0;
  if (h3 > hb) { hb = h3; nb = n3; idb = id3; top = 3.0; }
  if (h2 > hb) { hb = h2; nb = n2; idb = id2; top = 2.0; }
  if (h1 > hb) { hb = h1; nb = n1; idb = id1; top = 1.0; }

  vec3 bedCol;
  if (top > 0.5) {
    bedCol = stoneColor(idb, bedUv);
  } else {
    bedCol = vec3(0.62, 0.56, 0.45) * (0.82 + 0.3 * noise(bedUv * 130.0));
    bedCol *= 0.9 + 0.2 * noise(bedUv * 5.0);
  }

  // Lit as rounded solids: the sun rakes across each crown and leaves its far side dim.
  vec3 bn = normalize(vec3(nb * 0.9, sqrt(max(0.0, 1.0 - dot(nb, nb))) + 0.4));
  float sun = max(dot(bn, normalize(vec3(-0.45, 0.5, 0.74))), 0.0);
  bedCol *= 0.36 + 0.82 * sun;

  // Whatever lies lower is shaded where it tucks under a larger stone's edge.
  float occ = 1.0;
  if (top != 1.0) occ *= 0.45 + 0.55 * smoothstep(0.0, 0.3, rim1);
  if (top != 1.0 && top != 2.0) occ *= 0.55 + 0.45 * smoothstep(0.0, 0.28, rim2);
  if (top < 0.5) occ *= 0.65 + 0.35 * smoothstep(0.0, 0.22, rim3);
  bedCol *= occ;

  // Sunlight on the bed, gathered into moving caustic lines.
  float ca = caustics(q * vec2(5.0, 9.0) + n.xy * 2.0, t);
  bedCol *= 0.75 + 2.4 * ca * mix(1.0, 0.45, mid);

  // Water takes red first, then green, so the bed turns blue and dim with depth.
  vec3 absorb = vec3(3.2, 1.3, 0.85) * depth;
  vec3 col = bedCol * 1.5 * exp(-absorb);

#ifndef LITE
  // Fish swim above the bed, so they keep more of their colour than the stones.
  float aspect = uRes.x / uRes.y;
  vec2 lifeUv = uv + n.xy * 0.02 * depth;
  col *= 1.0 - 0.4 * fish(lifeUv + vec2(-0.012, 0.016), t, aspect);
  float fishMask = fish(lifeUv, t, aspect);
  col = mix(col, vec3(0.58, 0.39, 0.16) * mix(exp(-absorb * 0.5), vec3(1.0), 0.45), fishMask * 0.92);
#endif
  col += vec3(0.015, 0.085, 0.150) * (1.0 - exp(-depth * 1.9));

  // Pale, granular lettering just BELOW the surface. Refract it with the same
  // normal as the bed; long flowing ripples pull its edges sideways as well.
  // Scale with the type size so portrait text keeps its shape on tall phones.
  float typeScale = min(vh, uBox.z * 0.85);
  float ribbon = noise(vec2(q.x * 5.0, q.y * 62.0) + warp * 2.0 - vec2(t * 0.7, 0.0));
  vec2 textAt = css + vec2(n.x, -n.y) * typeScale * 0.055
    + vec2((ribbon - 0.5) * 0.013, (h0 - 0.4) * 0.009) * typeScale;
  float letters = textMask(textAt);
  // A faint refracted edge blends into the current instead of casting a drop shadow.
  float fringe = textMask(textAt + vec2(0.003, -0.001) * typeScale);
  vec2 inkAt = (textAt - uBox.xy) / max(uBox.z, 1.0);
  float grain = hash(floor(inkAt * 1500.0));
  float pigment = smoothstep(0.14, 0.52, grain);
  float mottling = noise(inkAt * vec2(90.0, 170.0));
  float veil = smoothstep(0.30, 0.63, h0 + ribbon * 0.15);
  float ink = letters * mix(0.70, 1.0, pigment) * mix(0.84, 1.0, mottling);
  float sinking = smoothstep(0.30, 0.80, (textAt.y - uBox.y) / uBox.w);
  ink *= mix(1.0, 0.76, veil) * mix(1.0, 0.74, sinking);
  // Enough scattered light to stay legible after the water's tone mapping.
  vec3 inkColor = mix(vec3(0.95, 1.24, 1.32), vec3(1.75, 1.95, 2.0), pigment);
  inkColor *= 0.80 + 0.35 * ca + 0.16 * max(dot(n.xy, vec2(-0.3, 0.45)), 0.0);
  col = mix(col, vec3(0.38, 0.57, 0.63), fringe * (1.0 - letters) * 0.14);
  col = mix(col, inkColor, ink);

  // What the surface mirrors: bright sky overhead, dark trees leaning in from the banks.
#ifdef LITE
  vec3 sky = vec3(0.56, 0.75, 0.88);
#else
  float clouds = noise(uv * 1.1 + n.xy * 3.0 + vec2(t * 0.01, 0.0));
  vec3 sky = mix(vec3(0.50, 0.71, 0.86), vec3(0.93, 0.96, 0.97), smoothstep(0.5, 0.8, clouds));
#endif
  float bank = smoothstep(0.26, 0.5, abs(uv.y - 0.5) + n.y * 0.5 + 0.06 * noise(uv * vec2(9.0, 2.0)));
  vec3 mirror = mix(sky, vec3(0.05, 0.10, 0.11), bank * 0.9);
  // Looking straight down little is mirrored; the tilted faces of ripples mirror more.
  float fresnel = 0.05 + 0.5 * smoothstep(0.04, 0.36, tilt);
  col = mix(col, mirror, fresnel);

  // The sun: a soft sheen across the swells and hard sparkles on the chop.
  vec3 light = normalize(vec3(-0.30, 0.45, 0.84));
  float glint = max(dot(reflect(-light, n), vec3(0.0, 0.0, 1.0)), 0.0);
  float open = 1.0 - bank * 0.8;
  col += vec3(1.0, 0.97, 0.88) * (0.12 * pow(glint, 24.0) + 1.9 * pow(glint, 320.0)) * open;

#ifndef LITE
  // White water, kept small: thin streaks drawn out by the current, drifting
  // downstream in loose patches.
  float drift = smoothstep(0.36, 0.6, fbm(vec2(q.x * 1.4, q.y * 5.0) + warp * 0.2 + vec2(t * 0.05, 0.0)));
  vec2 sp = vec2(q.x * 16.0, q.y * 120.0) + warp * 4.0 + vec2(t * 0.35, 0.0);
  float fine = 0.65 * noise(sp) + 0.35 * noise(sp * 2.03 + 11.0);
  float lengthwise = noise(vec2(q.x * 5.0, q.y * 30.0) + warp + 3.7);
  float foam = drift * 0.9 * smoothstep(0.6, 0.76, fine) * smoothstep(0.35, 0.75, lengthwise);
  col = mix(col, vec3(0.93, 0.96, 0.97), clamp(foam, 0.0, 1.0) * 0.8);
  // The splash where each drop lands, and a faint light along its ring.
  col += vec3(0.90, 0.95, 1.0) * (0.7 * drops.z + 0.3 * drops.w);
#endif

  // The banks: a strip of dark earth along the top and bottom of the screen,
  // and grass growing from it out over the water.
  float edge = min(uv.y, 1.0 - uv.y);
  if (edge < 0.12) {
    float side = step(0.5, uv.y);
    float earth = 1.0 - smoothstep(0.004, 0.016 + 0.012 * noise(vec2(uv.x * 14.0, side * 9.0)), edge);
    col = mix(col, vec3(0.10, 0.13, 0.06), earth * 0.75);
    float rise;
    float blade = grass(vec2(uv.x, edge), t, 3.0 + side * 20.0, rise);
    vec3 grassCol = mix(vec3(0.07, 0.20, 0.05), vec3(0.42, 0.62, 0.20), rise);
    col = mix(col, grassCol, blade);
  }
  col *= 1.0 - 0.3 * pow(abs(uv.y - 0.5) * 2.0, 2.5);
  // A soft shoulder keeps the glints from clipping flat without lifting the shadows.
  col = 1.0 - exp(-col * 1.35);

  // A little noise, so the smooth gradients don't band.
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}`;

    // Screen heights the river flows per second.
    const FLOW_SPEED = 0.035;
    const MAX_RIPPLES = 6;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const textCanvas = document.createElement('canvas');
    const textCtx = textCanvas.getContext('2d');
    const ripples = new Float32Array(MAX_RIPPLES * 4);
    let nextRipple = 0;

    let gl = null;
    let program = null;
    let uniforms = null;
    let textTexture = null;

    // Phones and small machines start on the cheaper river.
    let lite = window.matchMedia('(pointer: coarse)').matches
        || (navigator.hardwareConcurrency || 8) <= 4;
    // Share of full resolution the river is drawn at. Drops on slow devices.
    let quality = 1;
    let slowFrames = 0;
    let measuredFrames = 0;

    let time = 0;
    let lastFrame = 0;
    let frameId = 0;
    let fontsReady = false;

    function clearRipples() {
        for (let i = 0; i < MAX_RIPPLES; i += 1) {
            ripples[i * 4 + 2] = -1000;
        }
    }

    // One <span> per letter. The spans are what gets measured to redraw the
    // heading inside the river, so it lands exactly where the page laid it out.
    function splitTitle() {
        const words = title.textContent.trim().split(/\s+/);

        title.setAttribute('aria-label', words.join(' '));
        title.textContent = '';

        words.forEach((word, index) => {
            const wordEl = document.createElement('span');
            wordEl.className = 'word';
            wordEl.setAttribute('aria-hidden', 'true');

            for (const letter of word) {
                const letterEl = document.createElement('span');
                letterEl.className = 'letter';
                letterEl.textContent = letter;
                wordEl.appendChild(letterEl);
            }

            if (index > 0) {
                title.appendChild(document.createTextNode(' '));
            }
            title.appendChild(wordEl);
        });
    }

    function compile(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw new Error(gl.getShaderInfoLog(shader) || 'Shader failed to compile');
        }
        return shader;
    }

    // Builds the river for the current value of lite. Safe to call again to
    // switch between the full and the cheaper shader.
    function setup() {
        gl = gl || canvas.getContext('webgl', {
            alpha: false,
            antialias: false,
            depth: false,
            stencil: false,
            powerPreference: 'low-power'
        });

        if (!gl) {
            return false;
        }

        const next = gl.createProgram();
        gl.attachShader(next, compile(gl.VERTEX_SHADER, VERT));
        gl.attachShader(next, compile(gl.FRAGMENT_SHADER, (lite ? '#define LITE\n' : '') + FRAG));
        gl.linkProgram(next);

        if (!gl.getProgramParameter(next, gl.LINK_STATUS)) {
            throw new Error(gl.getProgramInfoLog(next) || 'Program failed to link');
        }
        if (program) {
            gl.deleteProgram(program);
        }
        program = next;
        gl.useProgram(program);

        // A single triangle that covers the whole screen.
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const aPos = gl.getAttribLocation(program, 'aPos');
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        uniforms = {};
        ['uRes', 'uPx', 'uTime', 'uFlow', 'uText', 'uBox', 'uTextOn', 'uRip'].forEach((name) => {
            uniforms[name] = gl.getUniformLocation(program, name);
        });

        if (textTexture) {
            gl.deleteTexture(textTexture);
        }
        textTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, textTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
        gl.uniform1i(uniforms.uText, 0);
        gl.uniform1f(uniforms.uTextOn, 0);
        gl.uniform4f(uniforms.uBox, 0, 0, 1, 1);

        return true;
    }

    function resize() {
        const cssWidth = canvas.clientWidth || window.innerWidth;
        const cssHeight = canvas.clientHeight || window.innerHeight;
        // Past 1.5x the extra pixels cost a lot and moving water hides them.
        const scale = Math.min(window.devicePixelRatio || 1, 1.5) * quality;

        canvas.width = Math.max(1, Math.round(cssWidth * scale));
        canvas.height = Math.max(1, Math.round(cssHeight * scale));

        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(uniforms.uRes, canvas.width, canvas.height);
        gl.uniform1f(uniforms.uPx, canvas.width / cssWidth);
    }

    // Redraws the heading into a mask that the river refracts below its surface.
    function updateText() {
        if (!fontsReady) {
            return;
        }

        const style = getComputedStyle(title);
        const fontSize = parseFloat(style.fontSize);
        const pad = Math.ceil(fontSize * 0.6);
        const rect = title.getBoundingClientRect();
        const origin = canvas.getBoundingClientRect();
        const box = {
            x: rect.left - origin.left - pad,
            y: rect.top - origin.top - pad,
            w: rect.width + pad * 2,
            h: rect.height + pad * 2
        };
        const scale = Math.min(window.devicePixelRatio || 1, 2);

        textCanvas.width = Math.max(1, Math.ceil(box.w * scale));
        textCanvas.height = Math.max(1, Math.ceil(box.h * scale));

        textCtx.setTransform(1, 0, 0, 1, 0, 0);
        textCtx.fillStyle = '#000';
        textCtx.fillRect(0, 0, textCanvas.width, textCanvas.height);
        textCtx.setTransform(scale, 0, 0, scale, -(rect.left - pad) * scale, -(rect.top - pad) * scale);
        textCtx.font = `${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
        textCtx.textBaseline = 'alphabetic';

        const ascent = textCtx.measureText('M').fontBoundingBoxAscent || fontSize * 0.8;
        const letters = Array.from(title.querySelectorAll('.letter'), (el) => {
            const r = el.getBoundingClientRect();
            // If the page upper-cases via CSS, the canvas has to be told.
            const text = style.textTransform === 'uppercase' ? el.textContent.toUpperCase() : el.textContent;
            return { text, x: r.left, y: r.top + ascent };
        });

        // Red: the letters themselves.
        textCtx.fillStyle = '#f00';
        letters.forEach((l) => textCtx.fillText(l.text, l.x, l.y));

        gl.bindTexture(gl.TEXTURE_2D, textTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);
        gl.uniform4f(uniforms.uBox, box.x, box.y, box.w, box.h);
        gl.uniform1f(uniforms.uTextOn, 1);

        // Only now is it safe to hide the real heading.
        document.documentElement.classList.add('has-water');
    }

    function draw() {
        gl.uniform1f(uniforms.uTime, time);
        gl.uniform1f(uniforms.uFlow, time * FLOW_SPEED);
        gl.uniform4fv(uniforms.uRip, ripples);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // The device is not keeping up: give it less to do, one step at a time.
    function easeLoad() {
        if (quality > 0.75) {
            quality = 0.75;
        } else if (!lite) {
            lite = true;
            try {
                setup();
            } catch (error) {
                console.warn('River could not switch to its lighter shader:', error);
            }
        } else if (quality > 0.5) {
            quality = 0.5;
        } else {
            return;
        }
        resize();
        updateText();
    }

    function frame(now) {
        frameId = requestAnimationFrame(frame);

        const delta = now - lastFrame;
        lastFrame = now;

        // A long gap means the tab was away, not that the device is slow.
        if (delta > 0 && delta < 250) {
            time += delta / 1000;
            measuredFrames += 1;
            if (delta > 24) {
                slowFrames += 1;
            }

            // Mostly below ~40fps over the last 60 frames.
            if (measuredFrames >= 60) {
                if (slowFrames > 36) {
                    easeLoad();
                }
                measuredFrames = 0;
                slowFrames = 0;
            }
        }

        draw();
    }

    function start() {
        cancelAnimationFrame(frameId);
        frameId = 0;

        if (!gl || gl.isContextLost()) {
            return;
        }

        if (reducedMotion.matches) {
            // A still river: one frame, no animation loop.
            clearRipples();
            draw();
            return;
        }

        if (!document.hidden) {
            lastFrame = performance.now();
            measuredFrames = 0;
            slowFrames = 0;
            frameId = requestAnimationFrame(frame);
        }
    }

    function refresh() {
        if (!gl || gl.isContextLost()) {
            return;
        }
        resize();
        updateText();
        if (!frameId) {
            draw();
        }
    }

    function addRipple(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        const height = rect.height || 1;

        ripples[nextRipple * 4] = (clientX - rect.left) / height;
        ripples[nextRipple * 4 + 1] = (rect.bottom - clientY) / height;
        ripples[nextRipple * 4 + 2] = time;
        ripples[nextRipple * 4 + 3] = time * FLOW_SPEED;
        nextRipple = (nextRipple + 1) % MAX_RIPPLES;
    }

    function bindEvents() {
        let resizeTimer = 0;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(refresh, 150);
        });

        document.addEventListener('visibilitychange', start);
        reducedMotion.addEventListener('change', start);

        let lastX = -1000;
        let lastY = -1000;
        let lastTime = 0;

        window.addEventListener('pointerdown', (event) => {
            if (frameId) {
                addRipple(event.clientX, event.clientY);
                lastX = event.clientX;
                lastY = event.clientY;
                lastTime = time;
            }
        }, { passive: true });

        // A moving pointer drags a trail of rings, spaced out so they stay few.
        window.addEventListener('pointermove', (event) => {
            if (!frameId || time - lastTime < 0.12) {
                return;
            }
            if (Math.hypot(event.clientX - lastX, event.clientY - lastY) < 48) {
                return;
            }
            addRipple(event.clientX, event.clientY);
            lastX = event.clientX;
            lastY = event.clientY;
            lastTime = time;
        }, { passive: true });

        canvas.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            cancelAnimationFrame(frameId);
            frameId = 0;
        });

        canvas.addEventListener('webglcontextrestored', () => {
            // Everything made with the old context went with it.
            program = null;
            textTexture = null;
            try {
                if (setup()) {
                    refresh();
                    start();
                }
            } catch (error) {
                console.warn('River could not be restored:', error);
            }
        });
    }

    splitTitle();
    clearRipples();

    try {
        if (!setup()) {
            return;
        }
    } catch (error) {
        // No river: the page keeps its plain background and visible heading.
        console.warn('River background disabled:', error);
        gl = null;
        return;
    }

    resize();
    bindEvents();
    start();

    // The letters can only be drawn once the web font is in, or the texture
    // would be made with the fallback font and not line up.
    const fonts = document.fonts;
    const titleStyle = getComputedStyle(title);
    const whenReady = fonts && fonts.load
        ? fonts.load(`${titleStyle.fontWeight} 1em ${titleStyle.fontFamily.split(',')[0]}`).then(() => fonts.ready)
        : Promise.resolve();

    whenReady.catch(() => {}).then(() => {
        fontsReady = true;
        refresh();
    });
})();
