export function termCols() {
  return (process.stdout.columns && process.stdout.columns > 1 ? process.stdout.columns : 80) - 1;
}
