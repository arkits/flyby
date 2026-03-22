# Field/PC2/Terrain Parser Specifications

## FLD Parser

Ported from `ifield.c` (899 lines).

### Format

```
FIELD
SKY r g b                          — Sky color (0-255 per channel)
GND r g b                          — Ground color (0-255 per channel)

PC2                                — 2D picture overlay (runway markings)
FIL filename.pc2
POS x y z h p b                    — Position + attitude (angles in 0x10000 units)
END

SRF                                — 3D model in scene (hangars, tower)
FIL filename.srf
POS x y z h p b
ID integer
TAG "string"
END

TER                                — Terrain mesh
FIL filename.ter
POS x y z h p b
ID integer
TAG "string"
END

PLT                                — Plate/sign (signal panels)
FIL filename.pc2
POS x y z h p b
END

RGN                                — Region (bounding area)
ARE xmin zmin xmax zmax
POS x y z h p b
ID integer
TAG "string"
END

ENDF                               — End field
```

### Parsing Algorithm

```
1. Verify first line is "FIELD"
2. Initialize sky={0,128,255}, gnd={128,128,0} (defaults)
3. Loop reading lines:
   - "SKY r g b": Set sky color from 0-255 values, normalize to 0-1
   - "GND r g b": Set ground color
   - "PC2": Read block until "END", create FieldPc2:
     - "FIL name": Fetch + parse PC2 file (deduplicate by filename)
     - "POS x y z h p b": Parse position and attitude
   - "SRF": Read block until "END", create FieldSrf:
     - "FIL name": Fetch + parse SRF file
     - "POS x y z h p b"
     - "ID n", "TAG str"
   - "TER": Read block until "END", create FieldTer:
     - "FIL name": Fetch + parse TER file
     - "POS x y z h p b", "ID n", "TAG str"
   - "PLT": Same as PC2 (different rendering category)
   - "ENDF": Break
4. Return Field object
```

### Asset Deduplication

Before loading a referenced file, check if the same filename was already loaded.
If so, reuse the parsed model. Example: airport.fld references `hanger.srf` 3 times
with different positions — parse once, share the SrfModel.

### API

```typescript
async function loadField(url: string): Promise<Field>
  // 1. Fetch FLD file
  // 2. Parse structure
  // 3. For each FIL reference, fetch + parse sub-file
  // 4. Return complete Field
```

### Actual Data (AIRPORT.FLD)

```
FIELD
SKY 0 128 255              — Blue sky
GND 128 128 0              — Olive/brown ground
PC2
FIL runway.pc2
POS 92.81 0.00 19.89 0 0 0 — First runway
END
PC2
FIL runway.pc2
POS 199.58 0.00 -97.85 -9624 0 0 — Second runway, rotated ~-52.7°
END
SRF
FIL hanger.srf
POS -147.23 0.00 148.33 -16590 0 0 — Hangar, rotated ~-90.7°
END
SRF
FIL tower.srf
POS -148.87 0.00 -46.12 0 0 0 — Control tower
END
TER
FIL sample.ter
POS -64.90 0.00 -173.18 0 0 0 — Terrain
END
PLT
FIL signal.pc2
POS 148.56 0.00 1483.84 0 0 0 — Signal panel
END
ENDF
```

---

## PC2 Parser

Ported from `i2dpict.c` / `i2dg.c`.

### Format

```
Pict2
PLG                      — Begin polygon
COL r g b                — Color (0-255 RGB)
VER x y                  — 2D vertex (x, z in world space — y is always 0)
VER x y
...
ENDO                     — End polygon
...more PLG...ENDO...
ENDPICT                  — End picture
```

### Parsing

```
1. Verify "Pict2" header
2. Loop:
   - "PLG": Begin polygon
     - "COL r g b": Parse color, normalize to 0-1
     - "VER x y": Parse 2D vertices
     - "ENDO": End polygon, store
   - "ENDPICT": Break
3. Compute min/max bounding
4. Return Pc2
```

### API

```typescript
async function loadPc2(url: string): Promise<Pc2>
```

### Actual Data (RUNWAY.PC2)

```
Pict2
PLG
COL 79 79 79                    — Gray runway surface
VER -30.0 1500.000000
VER -30.0 -1500.000000
VER 30.0 -1500.000000
VER 30.0 1500.000000
ENDO
PLG
COL 255 255 255                 — White center line marking
VER -5.0 1200.000000
VER -5.0 1073.684204
VER 5.0 1073.684204
VER 5.0 1200.000000
ENDO
...more white markings...
ENDPICT
```

---

## Terrain Parser

Ported from `iterrain.c`.

### Format

```
TerrMesh
BOT r g b                  — Bottom color
RIG r g b                  — Right side color
LEF r g b                  — Left side color
TOP r g b                  — Top color
NBL nx nz                  — Block count in x and z
TMS xw zw                  — Tile size (width per block in x and z)
BLO height [R/L] [ON/OFF] r g b [ON/OFF] r g b
BLO height [R/L] [ON/OFF] r g b [ON/OFF] r g b
... (nx * nz blocks, row-major)
...
END
```

BLO line fields:
- height: float (block height above base)
- R/L: right or left visibility flag for side faces
- ON/OFF r g b: side color with visibility toggle (repeated for each visible side)

### Parsing

```
1. Verify "TerrMesh" header
2. Read BOT/RIG/LEF/TOP colors
3. Read NBL nx nz, TMS xw zw
4. Allocate nx * nz blocks
5. For each BLO line (row-major, z-outer, x-inner):
   - Parse height, visibility flags, colors
6. Build side polygons for terrain edges
7. Build bounding box
8. Return Terrain
```

### API

```typescript
async function loadTer(url: string): Promise<Terrain>
```

### Actual Data (SAMPLE.TER)

```
TerrMesh
BOT 255 255 255
RIG 255 255 255
LEF 255 255 255
TOP 255 255 255
NBL 3 3
TMS 20.000000 20.000000
BLO 0.00 R ON 0 128 0 ON 0 128 0
BLO 0.00 R ON 0 128 0 ON 0 128 0
BLO 0.00 L ON 0 128 0 ON 0 128 0
BLO 0.00
BLO 0.00 R ON 0 128 0 ON 0 128 0
BLO 17.06 R ON 0 128 0 ON 0 128 0
BLO 17.12 R ON 0 128 0 ON 0 128 0
...
END
```

3x3 grid of 20x20 unit tiles. Blocks at (1,1) and (2,1) have heights ~17 units (hills).
