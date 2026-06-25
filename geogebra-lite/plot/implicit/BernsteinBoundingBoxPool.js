class BernsteinBoundingBoxPool {
  constructor() {
    this.queue = [];
  }

  request(x1, y1, x2, y2) {
    const box = this.queue.pop();
    if (!box) return new BernsteinBoundingBox(x1, y1, x2, y2, this);
    box.set(x1, y1, x2, y2);
    return box;
  }

  release(box) {
    this.queue.push(box);
  }
}
