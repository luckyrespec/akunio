export type TrajectoryMode = "EXACT" | "IN_ORDER" | "ANY_ORDER";

function countBy(names: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const name of names) {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

function matchExact(actual: string[], expected: string[]): boolean {
  if (actual.length !== expected.length) return false;
  return expected.every((name, i) => actual[i] === name);
}

function matchInOrder(actual: string[], expected: string[]): boolean {
  let j = 0;
  for (const name of actual) {
    if (j < expected.length && name === expected[j]) j += 1;
  }
  return j === expected.length;
}

function matchAnyOrder(actual: string[], expected: string[]): boolean {
  const have = countBy(actual);
  const need = countBy(expected);
  for (const [name, count] of need) {
    if ((have.get(name) ?? 0) < count) return false;
  }
  return true;
}

export function matchTrajectory(actual: string[], expected: string[], mode: TrajectoryMode): boolean {
  switch (mode) {
    case "EXACT":
      return matchExact(actual, expected);
    case "IN_ORDER":
      return matchInOrder(actual, expected);
    case "ANY_ORDER":
      return matchAnyOrder(actual, expected);
  }
}
