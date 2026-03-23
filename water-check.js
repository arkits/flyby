// Verify water collision logic
const waterRect = {
  minX: -960 - 110, // -1070
  maxX: -960 + 110, // -850
  minZ: -620 - 575, // -1195
  maxZ: -620 + 575, // -45
};

console.log("Water bounds:", waterRect);

// Test a building that should be blocked (overlaps water)
const testBuilding1 = {
  x: -900, // Inside water X range
  z: -600, // Inside water Z range
  w: 60,
  d: 50,
};
const bMinX1 = testBuilding1.x - testBuilding1.w * 0.5;
const bMaxX1 = testBuilding1.x + testBuilding1.w * 0.5;
const bMinZ1 = testBuilding1.z - testBuilding1.d * 0.5;
const bMaxZ1 = testBuilding1.z + testBuilding1.d * 0.5;

console.log("\nTest Building 1 (should BLOCK):");
console.log("Position:", testBuilding1.x, testBuilding1.z);
console.log("Size:", testBuilding1.w, "x", testBuilding1.d);
console.log("Bounds:", { minX: bMinX1, maxX: bMaxX1, minZ: bMinZ1, maxZ: bMaxZ1 });
console.log(
  "Overlaps water:",
  !(
    bMaxX1 < waterRect.minX ||
    bMinX1 > waterRect.maxX ||
    bMaxZ1 < waterRect.minZ ||
    bMinZ1 > waterRect.maxZ
  )
);

// Test a building that should be allowed (clear of water)
const testBuilding2 = {
  x: 0, // Clear of water X range
  z: 0, // Clear of water Z range
  w: 60,
  d: 50,
};
const bMinX2 = testBuilding2.x - testBuilding2.w * 0.5;
const bMaxX2 = testBuilding2.x + testBuilding2.w * 0.5;
const bMinZ2 = testBuilding2.z - testBuilding2.d * 0.5;
const bMaxZ2 = testBuilding2.z + testBuilding2.d * 0.5;

console.log("\nTest Building 2 (should ALLOW):");
console.log("Position:", testBuilding2.x, testBuilding2.z);
console.log("Size:", testBuilding2.w, "x", testBuilding2.d);
console.log("Bounds:", { minX: bMinX2, maxX: bMaxX2, minZ: bMinZ2, maxZ: bMaxZ2 });
console.log(
  "Overlaps water:",
  !(
    bMaxX2 < waterRect.minX ||
    bMinX2 > waterRect.maxX ||
    bMaxZ2 < waterRect.minZ ||
    bMinZ2 > waterRect.maxZ
  )
);

// Test edge case - building just touching water
const testBuilding3 = {
  x: -1070, // At water boundary
  z: -600,
  w: 10, // Small building
  d: 10,
};
const bMinX3 = testBuilding3.x - testBuilding3.w * 0.5;
const bMaxX3 = testBuilding3.x + testBuilding3.w * 0.5;
const bMinZ3 = testBuilding3.z - testBuilding3.d * 0.5;
const bMaxZ3 = testBuilding3.z + testBuilding3.d * 0.5;

console.log("\nTest Building 3 (edge case - should BLOCK if touching):");
console.log("Position:", testBuilding3.x, testBuilding3.z);
console.log("Size:", testBuilding3.w, "x", testBuilding3.d);
console.log("Bounds:", { minX: bMinX3, maxX: bMaxX3, minZ: bMinZ3, maxZ: bMaxZ3 });
console.log(
  "Overlaps water:",
  !(
    bMaxX3 < waterRect.minX ||
    bMinX3 > waterRect.maxX ||
    bMaxZ3 < waterRect.minZ ||
    bMinZ3 > waterRect.maxZ
  )
);
