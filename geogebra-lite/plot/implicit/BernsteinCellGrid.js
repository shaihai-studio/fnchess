class BernsteinCellGrid {
  constructor() {
    this.cells = null;
  }

  resize(bounds) {
    this.cells = [[null]];
  }

  toList() {
    if (!this.cells) return [];
    const list = [];
    for (const row of this.cells) {
      if (!row) continue;
      for (const cell of row) if (cell) list.push(cell);
    }
    return list;
  }

  put(cell, row, column) {
    this.cells[row][column] = cell;
  }
}
