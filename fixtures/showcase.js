/** @typedef {{ name: string, health: number }} Tree */

const healthyTree = /** @type {Tree} */ ({ name: "Evergreen", health: 42 });

export function describeTree({ name, health }) {
  return `${name}: ${health}`;
}

console.log(describeTree(healthyTree));
