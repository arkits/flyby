# flyby

TypeScript/WebGPU reimplementation of Soji Yamakawa's original Windows `FLYBY2`
screensaver. The goal of this repository is behavior parity with the original
C code in [`FLYBY2/`](./FLYBY2), not a modernized reinterpretation.

## Status

The port is functional but not yet at full parity. The current build can load
the original aircraft and airport data, run the maneuver scripts, render smoke,
and draw the field/terrain scene in the browser. Camera/framing and final
rendering equivalence are still being validated against the original source and
captured frames.

The browser build now also includes non-parity sandbox modes on top of the
original screensaver path:

- `?app=freeflight` for a controllable third-person aircraft sandbox
- `?app=drive` for a controllable third-person car sandbox

These new modes are browser-only adaptations intended to turn the port into a
vehicle-sim foundation. The original parity work remains under the default
`scriptedFlyby` path.

See [`spec/validation-report.md`](./spec/validation-report.md) for the current
parity status and [`spec/10-implementation-plan.md`](./spec/10-implementation-plan.md)
for the remaining work.

## Requirements

- [Bun](https://bun.sh/)
- A browser/runtime with WebGPU support

## Commands

```sh
bun install
bun run dev
bun run build
bun run capture:parity -- http://127.0.0.1:4180/ parity-shot-webgpu.png

# browser-only sandbox modes
# http://127.0.0.1:4180/?app=freeflight
# http://127.0.0.1:4180/?app=drive
```

## Deploy To Vercel

This app deploys to Vercel as a static Vite build.

1. Import the repository into Vercel.
2. Keep the project root at the repository root.
3. Use the default settings from [`vercel.json`](./vercel.json):
   - Install command: `bun install`
   - Build command: `bun run build`
   - Output directory: `dist`

No environment variables are required for the current build.

After deploy, the site still requires a browser with WebGPU support to render
the scene correctly.

## Repository Layout

- `src/`: WebGPU renderer, flight logic, parsers, smoke generation, math
- `public/data/`: original asset files loaded at runtime
- `FLYBY2/`: original C source used as the source of truth
- `spec/`: implementation notes, parity tracking, and validation docs
- `scripts/`: small helper scripts such as deterministic frame capture

## Working Principles

- Prefer source-faithful fixes over visual polish.
- Treat browser-specific behavior as an adaptation and document it explicitly.
- Do not claim parity unless it has been checked against the original source or
  a captured frame.

The repository instructions in [`AGENTS.md`](./AGENTS.md) describe the current
priorities and the files to consult when behavior is unclear.
