class QueryFunctionDataImpl extends QueryFunctionData {
  constructor(tuples) {
    super();
    this.tuples = tuples;
    this.neighbours = new TupleNeighbours();
  }

  at(index) { return this.tuples.get?.(index) ?? this.tuples[index]; }
  hasNext(index) { return index < (this.tuples.count?.() ?? this.tuples.length); }
  isInvertedAt(index) { return index >= (this.tuples.count?.() ?? this.tuples.length) || this.at(index).isInverted?.(); }
  getCount() { return this.tuples.count?.() ?? this.tuples.length; }
  isWholeAt(index) { return index >= this.getCount() || this.at(index).y()?.isWhole?.(); }
  hasValidData() { return this.tuples.isValid?.() ?? true; }
  nonDegenerated(index) { return !this.isInvertedPositiveInfinity(index); }
  isInvertedPositiveInfinity(index) {
    return this.isValidIndex(index) && this.at(index).y().isPositiveInfinity?.() && this.isInvertedAt(index);
  }
  isValidIndex(index) { return index < this.getCount(); }
  forEach(action) {
    for (let i = 0; i < this.getCount(); i++) action(i);
  }
  neighboursAt(index) {
    this.neighbours.set(this.at(index - 1), this.at(index), this.at(index + 1));
    return this.neighbours;
  }
}
