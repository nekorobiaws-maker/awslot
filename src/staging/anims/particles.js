/**
 * パーティクル(LCD の fgEffect / overlay 共用)。DESIGN.md 5.4 / 6.5
 *
 * 種類ごとにプリセットを持ち、emit(preset, opts) で一括生成する。
 * 上限を設けて、演出が重なっても描画コストが暴れないようにする。
 */

const MAX_PARTICLES = 220;

/** プリセット定義 */
export const PARTICLE_PRESETS = {
  /** コイン(払出・ボーナス) */
  coin: {
    count: 18, life: [900, 1500], size: [5, 9],
    speed: [90, 240], angle: [-Math.PI * 0.85, -Math.PI * 0.15],
    gravity: 420, colors: ['#ffc93c', '#ffe066', '#ffa400'], shape: 'coin',
  },
  /** スケールアウト(緑の粒) */
  scale: {
    count: 22, life: [500, 900], size: [3, 6],
    speed: [80, 220], angle: [0, Math.PI * 2],
    gravity: 0, colors: ['#7bf7d0', '#12a08a', '#d8fff4'], shape: 'dot',
  },
  /** レア役の火花 */
  spark: {
    count: 16, life: [350, 700], size: [2, 5],
    speed: [120, 300], angle: [0, Math.PI * 2],
    gravity: 60, colors: ['#ffe066', '#ff6b6b', '#ffffff'], shape: 'dot',
  },
  /** データストリーム(上昇する粒) */
  stream: {
    count: 14, life: [800, 1400], size: [2, 4],
    speed: [40, 110], angle: [-Math.PI * 0.6, -Math.PI * 0.4],
    gravity: -30, colors: ['#8ad4ff', '#7cf3ff', '#ffffff'], shape: 'square',
  },
  /** 虹色(プレミア) */
  rainbow: {
    count: 30, life: [900, 1600], size: [3, 8],
    speed: [100, 280], angle: [0, Math.PI * 2],
    gravity: 120, colors: null, shape: 'dot', rainbow: true,
  },
};

const rand = (a, b) => a + Math.random() * (b - a);

export class Particles {
  constructor() {
    /** @type {object[]} */
    this.items = [];
  }

  /**
   * @param {string} preset
   * @param {{x:number, y:number, count?:number, scale?:number}} opts
   */
  emit(preset, { x = 0, y = 0, count = null, scale = 1 } = {}) {
    const def = PARTICLE_PRESETS[preset];
    if (!def) {
      console.warn(`[particles] 未定義のプリセット: ${preset}`);
      return;
    }
    const n = count ?? def.count;
    for (let i = 0; i < n; i++) {
      if (this.items.length >= MAX_PARTICLES) break;
      const ang = rand(def.angle[0], def.angle[1]);
      const sp = rand(def.speed[0], def.speed[1]) * scale;
      const life = rand(def.life[0], def.life[1]);
      this.items.push({
        x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        gravity: def.gravity,
        size: rand(def.size[0], def.size[1]) * scale,
        life,
        left: life,
        color: def.rainbow
          ? `hsl(${Math.floor(Math.random() * 360)}, 100%, 65%)`
          : def.colors[Math.floor(Math.random() * def.colors.length)],
        shape: def.shape,
        spin: rand(-8, 8),
        rot: rand(0, Math.PI * 2),
      });
    }
  }

  update(dt) {
    const s = dt / 1000;
    for (const p of this.items) {
      p.left -= dt;
      p.vy += p.gravity * s;
      p.x += p.vx * s;
      p.y += p.vy * s;
      p.rot += p.spin * s;
    }
    this.items = this.items.filter((p) => p.left > 0);
  }

  clear() { this.items = []; }

  get count() { return this.items.length; }

  draw(ctx) {
    if (this.items.length === 0) return;
    ctx.save();
    for (const p of this.items) {
      const a = Math.min(1, p.left / (p.life * 0.35));
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      switch (p.shape) {
        case 'coin':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * Math.abs(Math.cos(p.rot)), 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(140,90,0,0.7)';
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.restore();
          break;
        case 'square':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          ctx.restore();
          break;
        default:
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
      }
    }
    ctx.restore();
  }
}
