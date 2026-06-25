class CurvePlotterStackItem {
  constructor() {
    this.dyadic = 0;
    this.depth = 0;
    this.eval = null;
    this.onScreen = false;
  }

  set(dyadic, depth, onScreen, evalValue) {
    this.dyadic = dyadic;
    this.depth = depth;
    this.onScreen = onScreen;
    this.eval = Array.isArray(evalValue) ? [...evalValue] : evalValue;
  }
}
