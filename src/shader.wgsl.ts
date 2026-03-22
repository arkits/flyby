// FLYBY2 — WGSL Shaders
// Lit pipeline (flat-shaded per-face) and unlit pipeline

export const SHADER_WGSL = /* wgsl */ `
struct Uniforms {
  viewProjMatrix: mat4x4f,
  modelMatrix: mat4x4f,
  lightPos: vec3f,
  cameraPos: vec3f,
}

@group(0) @binding(0) var<uniform> u: Uniforms;

// --- Lit Pipeline ---

struct LitVertexInput {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) cullNormal: vec3f,
  @location(3) color: vec3f,
  @location(4) bright: f32,
}

struct LitVertexOutput {
  @builtin(position) clipPos: vec4f,
  @location(0) worldPos: vec3f,
  @location(1) normal: vec3f,
  @location(2) cullNormal: vec3f,
  @location(3) color: vec3f,
  @location(4) bright: f32,
}

@vertex
fn vsLit(input: LitVertexInput) -> LitVertexOutput {
  var output: LitVertexOutput;
  let worldPos = u.modelMatrix * vec4f(input.position, 1.0);
  output.clipPos = u.viewProjMatrix * worldPos;
  output.worldPos = worldPos.xyz;
  output.normal = (u.modelMatrix * vec4f(input.normal, 0.0)).xyz;
  output.cullNormal = (u.modelMatrix * vec4f(input.cullNormal, 0.0)).xyz;
  output.color = input.color;
  output.bright = input.bright;
  return output;
}

@fragment
fn fsLit(input: LitVertexOutput, @builtin(front_facing) frontFacing: bool) -> @location(0) vec4f {
  if (input.bright > 1.5) {
    return vec4f(input.color, 1.0);
  }
  if (input.bright > 0.5) {
    return vec4f(input.color * 0.3, 1.0);
  }
  let N = normalize(select(-input.normal, input.normal, frontFacing));
  let L = normalize(u.lightPos - input.worldPos);
  let V = normalize(u.cameraPos - input.worldPos);
  let R = reflect(-L, N);
  let ambient = 0.3;
  let diffuse = max(dot(N, L), 0.0) * 0.6;
  let spec = pow(max(dot(R, V), 0.0), 60.0) * 0.3;
  let finalColor = input.color * (ambient + diffuse) + vec3f(spec);
  return vec4f(finalColor, 1.0);
}

@fragment
fn fsLitOneSided(input: LitVertexOutput) -> @location(0) vec4f {
  if (dot(input.cullNormal, input.worldPos - u.cameraPos) > 0.0) {
    discard;
  }
  if (input.bright > 1.5) {
    return vec4f(input.color, 1.0);
  }
  if (input.bright > 0.5) {
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

@fragment
fn fsSmokeLit(input: LitVertexOutput, @builtin(front_facing) frontFacing: bool) -> @location(0) vec4f {
  let alpha = clamp(input.bright, 0.0, 1.0);
  if (alpha <= 0.01) {
    discard;
  }
  let N = normalize(select(-input.normal, input.normal, frontFacing));
  let L = normalize(u.lightPos - input.worldPos);
  let diffuse = max(dot(N, L), 0.0);
  let finalColor = input.color * (0.82 + diffuse * 0.18);
  return vec4f(finalColor, alpha);
}

// --- Unlit Pipeline ---

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

@fragment
fn fsSmokeUnlit(input: UnlitVertexOutput) -> @location(0) vec4f {
  return vec4f(input.color, 0.24);
}
`;
