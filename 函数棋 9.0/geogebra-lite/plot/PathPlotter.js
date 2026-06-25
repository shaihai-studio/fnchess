class PathPlotter {
  constructor(plotter) {
    this.plotter = plotter;
    this.current = null;
  }

  newDoubleArray() {
    return [0, 0, 0];
  }

  drawTo(pos, lineTo) {
    if (lineTo === Gap.LINE_TO) {
      this.lineTo(pos);
    } else {
      this.moveTo(pos);
    }
  }

  lineTo(pos) {
    this.current = [...pos];
  }

  moveTo(pos) {
    this.current = [...pos];
  }

  corner() {}

  cornerPos(pos) {
    this.current = [...pos];
  }

  firstPoint(pos, moveToAllowed) {
    this.current = [...pos];
  }

  copyCoords(point, ret, transformSys) {
    ret[0] = point[0];
    ret[1] = point[1];
    return true;
  }

  endPlot() {}

  supports(transformSys) {
    return true;
  }
}
