// Test the actual coordinate ranges used in downtown generation
const xs = [-810, -570, -330, -90, 150, 390, 630, 870];
const zs = [-810, -570, -330, -90, 150, 390, 630, 870];

// Water bounds
const waterRect = {
  minX: -960 - 110, // -1070
  maxX: -960 + 110, // -850
  minZ: -620 - 575, // -1195
  maxZ: -620 + 575, // -45
};

console.log("Water bounds:", waterRect);
console.log("X positions:", xs);
console.log("Z positions:", zs);

let blockedCount = 0;
let totalCount = 0;

// Test regular buildings
for (let ix = 0; ix < xs.length; ix++) {
  for (let iz = 0; iz < zs.length; iz++) {
    const x = xs[ix];
    const z = zs[iz];

    // Apply existing filters
    if (Math.abs(x) < 120 && Math.abs(z) < 120) continue;
    if (x < -860) continue;

    totalCount++;

    // Calculate building dimensions (same as in code)
    const w = 56 + ((ix * 17 + iz * 11) % 34);
    const d = 48 + ((ix * 13 + iz * 19) % 30);

    // Calculate building bounds
    const bMinX = x - w * 0.5;
    const bMaxX = x + w * 0.5;
    const bMinZ = z - d * 0.5;
    const bMaxZ = z + d * 0.5;

    // Check water overlap
    const overlapsWater = !(
      bMaxX < waterRect.minX ||
      bMinX > waterRect.maxX ||
      bMaxZ < waterRect.minZ ||
      bMinZ > waterRect.maxZ
    );

    if (overlapsWater) {
      blockedCount++;
      console.log(`BLOCKED: Building at (${x}, ${z}) size ${w}x${d}`);
      console.log(
        `  Bounds: [${bMinX.toFixed(1)},${bMaxX.toFixed(1)}] x [${bMinZ.toFixed(1)},${bMaxZ.toFixed(1)}]`
      );
    }
  }
}

console.log(`\nResults: ${blockedCount}/${totalCount} buildings blocked due to water overlap`);

// Test a few specific problem areas
console.log("\n--- Specific Problem Area Checks ---");
const problemPositions = [
  { x: -900, z: -600, name: "Directly in water" },
  { x: -870, z: -500, name: "Near water boundary" },
  { x: -950, z: -700, name: "Deep in water" },
];

for (const pos of problemPositions) {
  const w = 60; // approximate
  const d = 50; // approximate
  const bMinX = pos.x - w * 0.5;
  const bMaxX = pos.x + w * 0.5;
  const bMinZ = pos.z - d * 0.5;
  const bMaxZ = pos.z + d * 0.5;

  const overlaps = !(
    bMaxX < waterRect.minX ||
    bMinX > waterRect.maxX ||
    bMaxZ < waterRect.minZ ||
    bMinZ > waterRect.maxZ
  );

  console.log(`${pos.name} (${pos.x}, ${pos.z}): ${overlaps ? "BLOCK" : "ALLOW"}`);
}
