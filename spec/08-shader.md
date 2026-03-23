# WGSL Shader Specification

## Uniform Bindings

```wgsl
struct Uniforms {
  viewProjMatrix: mat4x4f,    // Camera view * projection
  modelMatrix: mat4x4f,       // Object model transform
  lightPos: vec3f,            // World-space light position (above camera)
  cameraPos: vec3f,           // World-space camera position
}

@group(0) @binding(0) var<uniform> u: Uniforms;
```

## Vertex Shader — Lit Pipeline

```wgsl
struct VertexInput {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,     // Face normal (or vertex normal for smooth)
  @location(2) color: vec3f,      // Face color (0-1)
  @location(3) bright: f32,       // 0=lit, 1=unlit (flat color)
}

struct VertexOutput {
  @builtin(position) clipPos: vec4f,
  @location(0) worldPos: vec3f,
  @location(1) normal: vec3f,
  @location(2) color: vec3f,
  @location(3) bright: f32,
}

@vertex
fn vsLit(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  let worldPos = u.modelMatrix * vec4f(input.position, 1.0);
  output.clipPos = u.viewProjMatrix * worldPos;
  output.worldPos = worldPos.xyz;
  output.normal = (u.modelMatrix * vec4f(input.normal, 0.0)).xyz;
  output.color = input.color;
  output.bright = input.bright;
  return output;
}
```

## Fragment Shader — Lit Pipeline

Implements the original's lighting model from `BiShadColor`:

- Ambient: 0.3
- Diffuse: `max(0, dot(N, L)) * 0.6`
- Specular: `pow(max(0, dot(R, V)), 60) * 0.3`

The `pow(..., 60)` matches `BiPow60` which uses a lookup table for t^60.

```wgsl
@fragment
fn fsLit(input: VertexOutput) -> @location(0) vec4f {
  if (input.bright > 0.5) {
    // Unlit: just output the face color (ambient only)
    return vec4f(input.color * 0.3, 1.0);
  }

  let N = normalize(input.normal);
  let L = normalize(u.lightPos - input.worldPos);
  let V = normalize(u.cameraPos - input.worldPos);
  let R = reflect(-L, N);

  let ambient = 0.3;
  let diffuse = max(dot(N, L), 0.0) * 0.6;
  let spec = pow(max(dot(R, V), 0.0), 60.0) * 0.3;

  let finalColor = input.color * (ambient + diffuse) + vec3f(spec);
  return vec4f(finalColor, 1.0);
}
```

## Vertex Shader — Unlit Pipeline

Used for sky/ground, grid lines, smoke. No model transform (billboard-like).

```wgsl
struct UnlitVertexInput {
  @location(0) position: vec3f,
  @location(1) color: vec3f,
}

struct UnlitVertexOutput {
  @builtin(position) clipPos: vec4f,
  @location(0) color: vec3f,
}

@vertex
fn vsUnlit(input: UnlitVertexInput) -> UnlitVertexOutput {
  var output: UnlitVertexOutput;
  output.clipPos = u.viewProjMatrix * u.modelMatrix * vec4f(input.position, 1.0);
  output.color = input.color;
  return output;
}

@fragment
fn fsUnlit(input: UnlitVertexOutput) -> @location(0) vec4f {
  return vec4f(input.color, 1.0);
}
```

## Line Pipeline

Same as unlit but with `topology: "line-list"` in the pipeline descriptor.

## Sky/Ground Gradient

The original `BiDrawGroundSky` draws a split: above horizon = sky color, below = ground color.
In the original, the split is based on camera pitch.

Web implementation: two large triangles forming a quad behind all scene geometry:

```
Vertices (view-space, at far distance):
  Top-left:     (-big, +big, -farDist)  color = sky
  Top-right:    (+big, +big, -farDist)  color = sky
  Bot-left:     (-big, -big, -farDist)  color = ground
  Bot-right:    (+big, -big, -farDist)  color = ground

Or in world space, a large quad positioned behind the scene,
facing the camera, with colors interpolated.
```

Simpler approach: set the clear color to the sky color, draw one large ground quad below the camera.

```wgsl
// Ground quad at y=0, very large
// Vertices:
//   (-20000, 0.01, -20000) color = ground
//   (+20000, 0.01, -20000) color = ground
//   (-20000, 0.01, +20000) color = ground
//   (+20000, 0.01, +20000) color = ground
```

This will render the ground color at y=0.01, and the clear color (sky) appears above the horizon.

## Alpha Blending

Not needed for the original's opaque rendering. All geometry is solid color.
Smoke uses unlit pipeline with opaque white/gray.
