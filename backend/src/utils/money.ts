export function toCents(value: number | string): number {
  return Math.round(Number(value) * 100);
}

export function fromCents(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

export function decimalToNumber(value: { toString(): string } | number | string): number {
  return Number(value.toString());
}
