
// Procedural textures, so the simulation ships with no image files.
import * as THREE from "three";

const cache = new Map<string, THREE.Texture>();

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, key: string, repeat = true) {
  if (cache.has(key)) return cache.get(key)!;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

/** Warm Kigali brick: buff and terracotta tones, light mortar, running bond. */
export function brick() {
  return canvas(
    512,
    512,
    (g) => {
      g.fillStyle = "#e2cdb0";
      g.fillRect(0, 0, 512, 512);
      const tones = ["#d2ad8a", "#dbb796", "#c9a07e", "#e0bf9f", "#cda585", "#d7b291", "#c39a78"];
      const bh = 21.3;
      const bw = 64;
      let seed = 3;
      const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
      for (let row = 0; row < 24; row++) {
        const off = row % 2 ? bw / 2 : 0;
        for (let col = -1; col < 9; col++) {
          g.fillStyle = tones[Math.floor(r() * tones.length)];
          g.fillRect(col * bw + off + 1.5, row * bh + 1.5, bw - 3, bh - 3);
          g.fillStyle = `rgba(255,255,255,${r() * 0.07})`;
          g.fillRect(col * bw + off + 1.5, row * bh + 1.5, bw - 3, 3);
        }
      }
    },
    "brick",
  );
}

/** Perforated brick screen: a lattice of square voids. */
export function screen() {
  return canvas(
    256,
    256,
    (g) => {
      g.fillStyle = "#d0a47c";
      g.fillRect(0, 0, 256, 256);
      g.fillStyle = "#2b2420";
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          const ox = y % 2 ? 16 : 0;
          g.fillRect(x * 32 + ox + 9, y * 32 + 9, 14, 14);
        }
    },
    "screen",
  );
}

/** Pale gravel for the flat roofs. */
export function gravel() {
  return canvas(
    256,
    256,
    (g) => {
      g.fillStyle = "#cdbca3";
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 2600; i++) {
        const v = 160 + Math.floor(Math.random() * 60);
        g.fillStyle = `rgb(${v},${v - 12},${v - 28})`;
        g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
      }
    },
    "gravel",
  );
}

/** Warm stone paving for the plazas. */
export function paving() {
  return canvas(
    256,
    256,
    (g) => {
      g.fillStyle = "#d8c3a6";
      g.fillRect(0, 0, 256, 256);
      g.strokeStyle = "rgba(120,96,70,0.35)";
      g.lineWidth = 2;
      for (let i = 0; i <= 4; i++) {
        g.beginPath();
        g.moveTo(i * 64, 0);
        g.lineTo(i * 64, 256);
        g.moveTo(0, i * 64);
        g.lineTo(256, i * 64);
        g.stroke();
      }
      for (let i = 0; i < 900; i++) {
        g.fillStyle = `rgba(90,70,50,${Math.random() * 0.08})`;
        g.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
      }
    },
    "paving",
  );
}

/** Grass with soft variation. */
export function grass() {
  return canvas(
    256,
    256,
    (g) => {
      g.fillStyle = "#5f7d36";
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 4000; i++) {
        const hue = Math.random() < 0.5 ? "rgba(110,140,60,0.25)" : "rgba(45,70,28,0.3)";
        g.fillStyle = hue;
        g.fillRect(Math.random() * 256, Math.random() * 256, 2, 4);
      }
    },
    "grass",
  );
}

/** The large colourful mural along the courtyard wall (abstract, in the spirit of the original). */
export function mural() {
  return canvas(
    1024,
    256,
    (g) => {
      const cols = ["#e0a24a", "#2f7f8f", "#7d3f6b", "#c4523a", "#3b5d9a", "#e8d18a", "#4b8c5a"];
      g.fillStyle = "#e8d6b8";
      g.fillRect(0, 0, 1024, 256);
      for (let i = 0; i < 14; i++) {
        g.fillStyle = cols[i % cols.length];
        const x = i * 74;
        g.beginPath();
        g.moveTo(x, 256);
        g.lineTo(x + 60 + (i % 3) * 20, 40 + (i % 4) * 30);
        g.lineTo(x + 140, 256);
        g.closePath();
        g.fill();
      }
      for (let i = 0; i < 6; i++) {
        g.fillStyle = "#2b1d18";
        g.beginPath();
        g.ellipse(120 + i * 160, 110, 34, 46, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = cols[(i + 2) % cols.length];
        g.fillRect(96 + i * 160, 150, 48, 106);
      }
    },
    "mural",
    false,
  );
}

/** Hazy Kigali sky: pale at the horizon, soft blue above, warm toward the sun. */
export function sky() {
  return canvas(
    16,
    512,
    (g) => {
      const grd = g.createLinearGradient(0, 0, 0, 512);
      grd.addColorStop(0, "#9fc0dc");
      grd.addColorStop(0.45, "#d8e3ea");
      grd.addColorStop(0.62, "#efe4d6");
      grd.addColorStop(1, "#e8dccd");
      g.fillStyle = grd;
      g.fillRect(0, 0, 16, 512);
    },
    "sky",
    false,
  );
}

/** Lettering for vertical signs. */
export function sign(text: string) {
  return canvas(
    128,
    1024,
    (g) => {
      g.fillStyle = "#e8e4dc";
      g.fillRect(0, 0, 128, 1024);
      g.fillStyle = "#3a3a3a";
      g.font = "bold 92px Inter, Arial, sans-serif";
      g.textAlign = "center";
      const step = 1024 / (text.length + 1);
      [...text].forEach((ch, i) => g.fillText(ch, 64, step * (i + 1) + 30));
    },
    `sign:${text}`,
    false,
  );
}
