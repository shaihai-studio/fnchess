class BernsteinBoundingBox {
  constructor(x1 = 0, y1 = 0, x2 = 0, y2 = 0, pool = null) {
    this._pool = pool || BernsteinBoundingBox.defaultPool || (BernsteinBoundingBox.defaultPool = new BernsteinBoundingBoxPool());
    this.set(x1, y1, x2, y2);
  }

  set(x1, y1, x2, y2) {
    this._x1 = x1;
    this._y1 = y1;
    this._x2 = x2;
    this._y2 = y2;
  }

  x1() { return this._x1; }
  y1() { return this._y1; }
  x2() { return this._x2; }
  y2() { return this._y2; }
  getWidth() { return this._x2 - this._x1; }
  getHeight() { return this._y2 - this._y1; }

  split() {
    const xHalf = (this._x1 + this._x2) / 2;
    const yHalf = (this._y1 + this._y2) / 2;
    return [
      this._pool.request(this._x1, this._y1, xHalf, yHalf),
      this._pool.request(xHalf, this._y1, this._x2, yHalf),
      this._pool.request(this._x1, yHalf, xHalf, this._y2),
      this._pool.request(xHalf, yHalf, this._x2, this._y2)
    ];
  }

  release() { this._pool.release(this); }

  toString() { return `Box{x1=${this._x1}, y1=${this._y1}, y2=${this._y2}, x2=${this._x2}}`; }
}
