class CurvePlotterStack {
  constructor(length, onScreen, evalValue) {
    this.items = new Array(length);
    for (let i = 0; i < length; i++) this.items[i] = new CurvePlotterStackItem();
    this.items[0].set(1, 0, onScreen, Array.isArray(evalValue) ? [...evalValue] : evalValue);
    this.top = 1;
  }

  push(dyadic, depth, onScreen, evalValue) {
    this.items[this.top].set(dyadic, depth, onScreen, Array.isArray(evalValue) ? [...evalValue] : evalValue);
    this.top += 1;
  }

  pop() {
    this.top -= 1;
    return this.top >= 0 ? this.items[this.top] : null;
  }

  hasItems() {
    return this.top !== 0;
  }
}

if (typeof window !== 'undefined') {
  window.CurvePlotterStack = CurvePlotterStack;
}
