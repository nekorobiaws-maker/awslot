/**
 * requestAnimationFrame ループ(固定dt + サブステップ)。
 *
 * timeScale で全体の進行速度を変えられる(デバッグの ?turbo=N 用)。
 */

export class Loop {
  /**
   * @param {object} opts
   * @param {(dtMs:number)=>void} opts.onStep   固定dtで呼ばれる更新
   * @param {(nowMs:number)=>void} [opts.onRender] 1フレーム1回の描画
   * @param {number} [opts.fixedDt=16.666] 固定ステップ(ms)
   * @param {number} [opts.maxSubSteps=6]  1フレームの最大ステップ数
   */
  constructor({ onStep, onRender = null, fixedDt = 1000 / 60, maxSubSteps = 6 }) {
    this.onStep = onStep;
    this.onRender = onRender;
    this.fixedDt = fixedDt;
    this.maxSubSteps = maxSubSteps;
    this.timeScale = 1;
    this.running = false;
    this._acc = 0;
    this._last = 0;
    this._raf = 0;
    this._tick = this._tick.bind(this);
    /** 計測値(デバッグ表示用) */
    this.fps = 0;
    this._fpsAcc = 0;
    this._fpsFrames = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    this._acc = 0;
    this._raf = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  _tick(now) {
    if (!this.running) return;
    // タブ復帰時などの巨大なdtをクランプ
    const frame = Math.min(now - this._last, 250);
    this._last = now;

    this._fpsAcc += frame;
    this._fpsFrames++;
    if (this._fpsAcc >= 500) {
      this.fps = Math.round((this._fpsFrames * 1000) / this._fpsAcc);
      this._fpsAcc = 0;
      this._fpsFrames = 0;
    }

    this._acc += frame * this.timeScale;
    let steps = 0;
    while (this._acc >= this.fixedDt && steps < this.maxSubSteps) {
      this.onStep(this.fixedDt);
      this._acc -= this.fixedDt;
      steps++;
    }
    // 追いつけない場合は溜め込まず捨てる(スパイラル防止)
    if (steps >= this.maxSubSteps) this._acc = 0;

    this.onRender?.(now);
    this._raf = requestAnimationFrame(this._tick);
  }
}
