# SRF Parser — 3D Model Format Specification

Ported from `imodel.c` (1606 lines), specifically `BiLoadSrfMainLoop` (line 315).

## Format

Text-based polygon model format. Starts with `Surf` header, ends with `END`.

```
Surf
V x y z [R]          — Vertex. Optional R flag marks smooth-shading participation
V x y z [R]
...
F                     — Begin face definition
  C col15             — Color (15-bit packed GRB integer)
  N cx cy cz nx ny nz — Normal: center point + normal vector
  V id id id ...      — Vertex indices (0-based)
  B                   — Bright flag (unlit, optional)
E                     — End face
...repeat F...E...
END                   — End model
```

## Parsing Algorithm

```
1. Read first line, verify it starts with "Surf" (case-insensitive)
2. Loop reading lines:
   - "V x y z [R]":
     - Parse x, y, z as floats
     - If 5th token is "R", set smoothFlag = BI_ON
     - Push vertex onto linked list, increment vertex count
   - "F":
     - Begin face parsing loop:
       - "C col15": Parse 15-bit integer color
         - g = ((col15 >> 10) & 31) / 31.0
         - r = ((col15 >>  5) & 31) / 31.0
         - b = (col15 & 31) / 31.0
       - "N cx cy cz nx ny nz": Parse center (cx,cy,cz) and normal (nx,ny,nz)
         - If |normal| > YSEPS, normalize it and set backFaceRemove = BI_ON
         - Otherwise backFaceRemove = BI_OFF
       - "V id id id...": Parse vertex indices, push onto ID list
       - "B": Set bright = BI_ON (unlit)
       - "E": End face. Build SrfPolygon:
         - Remove duplicate last vertex if same as first
         - Store vertex count, color, normal, center, vertex IDs, bright, backFaceRemove
   - "END": Break
3. Convert linked lists to arrays
4. Post-processing:
   a. Compute face normals (for backFaceRemove==OFF faces)
   b. Compute smooth vertex normals
   c. Constrain twist (ensure consistent winding)
   d. Sort polygons by color (for batch rendering optimization)
   e. Build 8-corner bounding box
```

## Post-Processing Details

### Compute Face Normals (imodel.c:156-169)

For polygons where `backFaceRemove == BI_OFF`, recompute normal from vertices using
`averageNormalVector` and normalize.

### Compute Smooth Vertex Normals (imodel.c:193-240)

For each vertex:
1. Find all faces that reference this vertex where:
   - `bright != BI_ON` (not unlit)
   - `backFaceRemove == BI_ON` (has face normal)
   - vertex is in face's vertex list
2. Collect unique face normals (reject duplicates and opposing normals)
3. Average all collected normals, normalize result
4. Store as `vertex.normal`

### Constrain Twist (imodel.c:243-287)

For each polygon with `backFaceRemove == BI_ON`:
1. Build vertex position array from vertex IDs
2. Call `twist3` to check winding direction vs normal
3. If RIGHT-twisted, reverse the vertex order (swap[i] with [nVt-1-i])

`twist3` computes cross products of edge pairs and checks consistency against the normal.

### Build Bounding Box (imodel.c:443-469)

Find min/max across all vertices, create 8-corner box:
```
bbox[0] = (min.x, min.y, min.z)
bbox[1] = (max.x, min.y, min.z)
bbox[2] = (min.x, max.y, min.z)
bbox[3] = (max.x, max.y, min.z)
bbox[4] = (min.x, min.y, max.z)
bbox[5] = (max.x, min.y, max.z)
bbox[6] = (min.x, max.y, max.z)
bbox[7] = (max.x, max.y, max.z)
```

## API

```typescript
async function loadSrf(url: string): Promise<SrfModel>
  // Fetch file from URL, parse text, return SrfModel

function parseSrfText(text: string): SrfModel
  // Parse SRF text content directly
```

## Example Data (A6.SRF, first few vertices and first face)

```
Surf
V 0 0.10 4.90 R
V 0 -0.20 4.90 R
V 0 -0.05 5.00 R
...
F
C 14607
N -0.11 0.16 4.78 -0.30 0.75 0.60
V 0 3 24 23
E
```

Color 14607 = 0b001110010001111:
- G = (14607 >> 10) & 31 = 0b00111 = 7 → 7/31 = 0.226
- R = (14607 >> 5) & 31 = 0b00100 = 4 → 4/31 = 0.129
- B = 14607 & 31 = 0b01111 = 15 → 15/31 = 0.484

This is a dark blue-gray typical of military aircraft.
