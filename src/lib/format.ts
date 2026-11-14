export function formatTaka(amount: number): string {
  return `৳${amount.toLocaleString("en-US")}`;
}

/** "Suite" or "Room", from a room type's tag. */
export function roomKind(tag: string): string {
  return tag === "SUITE" ? "Suite" : "Room";
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
