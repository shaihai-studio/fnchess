class CurvePlotterUtils {
  static draw(gp, pointList, transformSys) {
    const coords = gp.newDoubleArray();
    const size = pointList.length;
    const supports = gp.supports(transformSys);
    if (!supports || size === 0) {
      return coords;
    }

    let linetofirst = true;
    let lastMove = null;
    for (const p of pointList) {
      if (p && typeof p.isFinite === 'function' ? p.isFinite() : true) {
        const segmentType = p.getSegmentType ? p.getSegmentType() : null;
        const getLineTo = p.getLineTo ? p.getLineTo() : true;
        const point = p.coords || p;
        if (CurvePlotterUtils.isArcOrCurvePart(segmentType) && !linetofirst) {
          gp.drawTo(coords, segmentType);
          lastMove = null;
        } else if (getLineTo && !linetofirst) {
          gp.lineTo(coords);
          lastMove = null;
        } else {
          lastMove = CurvePlotterUtils.moveTo(gp, coords, lastMove);
        }
        linetofirst = false;
      } else {
        linetofirst = true;
      }
    }
    if (lastMove != null) {
      gp.lineTo(lastMove);
    }
    gp.endPlot();
    return coords;
  }

  static moveTo(gp, coords, previousLastMove) {
    let lastMove;
    if (previousLastMove != null) {
      gp.lineTo(previousLastMove);
      lastMove = previousLastMove;
    } else {
      lastMove = new Array(coords.length).fill(0);
    }
    gp.moveTo(coords);
    for (let i = 0; i < coords.length; i++) lastMove[i] = coords[i];
    return lastMove;
  }

  static isArcOrCurvePart(segmentType) {
    return segmentType === 'CURVE_TO'
      || segmentType === 'CONTROL'
      || segmentType === 'ARC_TO'
      || segmentType === 'AUXILIARY';
  }
}
