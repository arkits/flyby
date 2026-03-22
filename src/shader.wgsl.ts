// FLYBY2 — WGSL Shaders
// Environment lighting, procedural sky, fog, and ground shading.

export const SHADER_WGSL = /* wgsl */ `
struct Uniforms {
  viewProjMatrix: mat4x4f,
  modelMatrix: mat4x4f,
  cameraRight: vec4f,
  cameraUp: vec4f,
  cameraForward: vec4f,
  cameraPos: vec4f,
  projectionScale: vec4f,
  keyLightDir: vec4f,
  keyLightColor: vec4f,
  hemiSkyColor: vec4f,
  hemiGroundColor: vec4f,
  fogColor: vec4f,
  fogParams: vec4f,
  skyTopColor: vec4f,
  skyHorizonColor: vec4f,
  skyBottomColor: vec4f,
  skyParams: vec4f,
  cloudColor: vec4f,
  cloudShadowColor: vec4f,
  cloudParams0: vec4f,
  cloudParams1: vec4f,
  groundPrimaryColor: vec4f,
  groundSecondaryColor: vec4f,
  groundAccentColor: vec4f,
  groundPavedColor: vec4f,
  groundParamsA: vec4f,
  groundParamsB: vec4f,
  emissiveColor: vec4f,
  emissiveParams: vec4f,
}

@group(0) @binding(0) var<uniform> u: Uniforms;

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

struct UnlitVertexInput {
  @location(0) position: vec3f,
  @location(1) color: vec3f,
}

struct UnlitVertexOutput {
  @builtin(position) clipPos: vec4f,
  @location(0) worldPos: vec3f,
  @location(1) color: vec3f,
}

struct SkyVertexOutput {
  @builtin(position) clipPos: vec4f,
  @location(0) ndc: vec2f,
}

fn saturate(value: f32) -> f32 {
  return clamp(value, 0.0, 1.0);
}

fn luminance(color: vec3f) -> f32 {
  return dot(color, vec3f(0.2126, 0.7152, 0.0722));
}

fn hash21(p: vec2f) -> f32 {
  let h = dot(p, vec2f(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}

fn noise2(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u2 = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u2.x), mix(c, d, u2.x), u2.y);
}

fn fbm(p: vec2f) -> f32 {
  var q = p;
  var sum = 0.0;
  var amp = 0.5;
  for (var i = 0; i < 4; i = i + 1) {
    sum += noise2(q) * amp;
    q = mat2x2f(1.6, -1.2, 1.2, 1.6) * q;
    amp *= 0.5;
  }
  return sum;
}

fn viewDirFromNdc(ndc: vec2f) -> vec3f {
  let cameraDir = normalize(vec3f(
    ndc.x * u.projectionScale.x,
    ndc.y * u.projectionScale.y,
    1.0,
  ));
  return normalize(
    cameraDir.x * u.cameraRight.xyz
    + cameraDir.y * u.cameraUp.xyz
    + cameraDir.z * u.cameraForward.xyz
  );
}

fn fogFactor(worldPos: vec3f, emissiveFactor: f32) -> f32 {
  let dist = distance(worldPos, u.cameraPos.xyz);
  let fogRange = max(1.0, u.fogParams.y - u.fogParams.x);
  let linearFog = saturate((dist - u.fogParams.x) / fogRange);
  let expFog = 1.0 - exp(-linearFog * u.fogParams.z * 4.0);
  let heightFog = saturate(exp(-max(worldPos.y, 0.0) * u.fogParams.w));
  return saturate(max(linearFog, expFog) * heightFog * (1.0 - emissiveFactor * 0.28));
}

fn applyFog(color: vec3f, worldPos: vec3f, emissiveFactor: f32) -> vec3f {
  let fog = fogFactor(worldPos, emissiveFactor);
  return mix(color, u.fogColor.xyz, fog);
}

fn actorFogFactor(worldPos: vec3f, emissiveFactor: f32) -> f32 {
  return fogFactor(worldPos, emissiveFactor) * 0.18;
}

fn applyActorFog(color: vec3f, worldPos: vec3f, emissiveFactor: f32) -> vec3f {
  let fog = actorFogFactor(worldPos, emissiveFactor);
  return mix(color, u.fogColor.xyz, fog);
}

fn hemiAmbient(normal: vec3f) -> vec3f {
  let hemiMix = saturate((normal.y * 0.5 + 0.5) * u.hemiGroundColor.w + (1.0 - u.hemiGroundColor.w) * 0.5);
  return mix(u.hemiGroundColor.xyz, u.hemiSkyColor.xyz, hemiMix) * u.hemiSkyColor.w;
}

fn shadeLitSurface(baseColor: vec3f, worldPos: vec3f, normal: vec3f) -> vec3f {
  let N = normalize(normal);
  let L = normalize(u.keyLightDir.xyz);
  let V = normalize(u.cameraPos.xyz - worldPos);
  let H = normalize(L + V);
  let diffuse = max(dot(N, L), 0.0) * u.keyLightDir.w;
  let spec = pow(max(dot(N, H), 0.0), 48.0) * 0.14 * u.keyLightDir.w;
  let rim = pow(1.0 - max(dot(N, V), 0.0), 2.0) * 0.08;
  let lit = baseColor * (hemiAmbient(N) + diffuse * u.keyLightColor.xyz) + vec3f(spec + rim * 0.05);
  return applyFog(lit, worldPos, 0.0);
}

fn shadeActorSurface(baseColor: vec3f, worldPos: vec3f, normal: vec3f) -> vec3f {
  let N = normalize(normal);
  let L = normalize(u.keyLightDir.xyz);
  let V = normalize(u.cameraPos.xyz - worldPos);
  let H = normalize(L + V);
  let diffuse = max(dot(N, L), 0.0) * u.keyLightDir.w * 1.08;
  let spec = pow(max(dot(N, H), 0.0), 36.0) * 0.22 * u.keyLightDir.w;
  let rim = pow(1.0 - max(dot(N, V), 0.0), 1.8) * 0.24;
  let ambient = hemiAmbient(N) * 1.14;
  let lit = baseColor * (ambient + diffuse * u.keyLightColor.xyz) + vec3f(spec + rim * 0.26);
  return applyActorFog(max(lit, baseColor * 0.52), worldPos, 0.0);
}

fn emissiveOverlayColor(baseColor: vec3f, worldPos: vec3f) -> vec3f {
  let hot = smoothstep(u.emissiveParams.y, 1.0, luminance(baseColor));
  let accent = mix(baseColor, max(baseColor, u.emissiveColor.xyz), u.emissiveParams.z);
  let color = baseColor + accent * (hot * u.emissiveParams.x);
  return applyFog(color, worldPos, hot * u.emissiveParams.x);
}

fn groundMaterial(worldPos: vec3f) -> vec3f {
  let p = worldPos.xz;
  let coarse = fbm(p * u.groundParamsA.y);
  let detail = noise2(p * u.groundParamsA.x);
  let patchNoise = noise2((p + vec2f(87.3, -48.1)) * u.groundParamsA.w);
  let stripA = pow(saturate(sin(p.y * u.groundParamsA.z) * 0.5 + 0.5), 7.0);
  let stripB = pow(saturate(cos((p.x + p.y * 0.2) * u.groundParamsA.z * 0.65) * 0.5 + 0.5), 6.0);
  let breakup = saturate(coarse * 0.72 + detail * 0.28);
  let accentMix = saturate(stripA * 0.7 + stripB * u.groundParamsB.y + patchNoise * 0.25);
  var base = mix(u.groundPrimaryColor.xyz, u.groundSecondaryColor.xyz, breakup);
  base = mix(base, u.groundAccentColor.xyz, accentMix * 0.55);

  let mapId = u.groundParamsB.z;
  let pavedSeed = saturate(detail * 0.45 + patchNoise * 0.35 + coarse * 0.2);
  let pavedMask = smoothstep(u.groundParamsB.x - 0.15, u.groundParamsB.x + 0.15, pavedSeed);
  if (mapId > 2.5) {
    base = mix(base, u.groundPavedColor.xyz, pavedMask * 0.72);
  } else if (mapId > 1.5) {
    base = mix(base, u.groundPavedColor.xyz, pavedMask * 0.28);
  } else {
    base = mix(base, u.groundPavedColor.xyz, pavedMask * 0.18);
  }

  return base;
}

fn shadeGround(worldPos: vec3f) -> vec3f {
  let base = groundMaterial(worldPos);
  return shadeLitSurface(base, worldPos, vec3f(0.0, 1.0, 0.0));
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

@vertex
fn vsUnlit(input: UnlitVertexInput) -> UnlitVertexOutput {
  var output: UnlitVertexOutput;
  let worldPos = u.modelMatrix * vec4f(input.position, 1.0);
  output.clipPos = u.viewProjMatrix * worldPos;
  output.worldPos = worldPos.xyz;
  output.color = input.color;
  return output;
}

@vertex
fn vsSky(@builtin(vertex_index) vertexIndex: u32) -> SkyVertexOutput {
  var output: SkyVertexOutput;
  let positions = array<vec2f, 3>(
    vec2f(-1.0, -3.0),
    vec2f(-1.0, 1.0),
    vec2f(3.0, 1.0),
  );
  let ndc = positions[vertexIndex];
  output.clipPos = vec4f(ndc, 0.0, 1.0);
  output.ndc = ndc;
  return output;
}

@fragment
fn fsLit(input: LitVertexOutput) -> @location(0) vec4f {
  if (input.bright > 1.5) {
    let emissiveColor = input.color * (1.0 + u.emissiveParams.x * (0.8 + input.bright * 0.2));
    return vec4f(applyFog(mix(emissiveColor, max(emissiveColor, u.emissiveColor.xyz), u.emissiveParams.z), input.worldPos, 1.0), 1.0);
  }
  if (input.bright > 0.5) {
    return vec4f(applyFog(input.color, input.worldPos, 0.0), 1.0);
  }
  let rawNormal = normalize(input.normal);
  let viewVector = u.cameraPos.xyz - input.worldPos;
  let N = normalize(select(-rawNormal, rawNormal, dot(rawNormal, viewVector) >= 0.0));
  return vec4f(shadeLitSurface(input.color, input.worldPos, N), 1.0);
}

@fragment
fn fsLitOneSided(input: LitVertexOutput) -> @location(0) vec4f {
  if (dot(input.cullNormal, input.worldPos - u.cameraPos.xyz) > 0.0) {
    discard;
  }
  if (input.bright > 1.5) {
    let emissiveColor = input.color * (1.0 + u.emissiveParams.x * (0.8 + input.bright * 0.2));
    return vec4f(applyFog(mix(emissiveColor, max(emissiveColor, u.emissiveColor.xyz), u.emissiveParams.z), input.worldPos, 1.0), 1.0);
  }
  if (input.bright > 0.5) {
    return vec4f(applyFog(input.color, input.worldPos, 0.0), 1.0);
  }
  return vec4f(shadeLitSurface(input.color, input.worldPos, normalize(input.normal)), 1.0);
}

@fragment
fn fsActorLit(input: LitVertexOutput) -> @location(0) vec4f {
  if (input.bright > 1.5) {
    let emissiveColor = input.color * (1.0 + u.emissiveParams.x * (0.8 + input.bright * 0.2));
    return vec4f(applyActorFog(mix(emissiveColor, max(emissiveColor, u.emissiveColor.xyz), u.emissiveParams.z), input.worldPos, 1.0), 1.0);
  }
  if (input.bright > 0.5) {
    return vec4f(applyActorFog(input.color, input.worldPos, 0.0), 1.0);
  }
  let rawNormal = normalize(input.normal);
  let viewVector = u.cameraPos.xyz - input.worldPos;
  let N = normalize(select(-rawNormal, rawNormal, dot(rawNormal, viewVector) >= 0.0));
  return vec4f(shadeActorSurface(input.color, input.worldPos, N), 1.0);
}

@fragment
fn fsActorLitOneSided(input: LitVertexOutput) -> @location(0) vec4f {
  if (dot(input.cullNormal, input.worldPos - u.cameraPos.xyz) > 0.0) {
    discard;
  }
  if (input.bright > 1.5) {
    let emissiveColor = input.color * (1.0 + u.emissiveParams.x * (0.8 + input.bright * 0.2));
    return vec4f(applyActorFog(mix(emissiveColor, max(emissiveColor, u.emissiveColor.xyz), u.emissiveParams.z), input.worldPos, 1.0), 1.0);
  }
  if (input.bright > 0.5) {
    return vec4f(applyActorFog(input.color, input.worldPos, 0.0), 1.0);
  }
  return vec4f(shadeActorSurface(input.color, input.worldPos, normalize(input.normal)), 1.0);
}

@fragment
fn fsSmokeLit(input: LitVertexOutput, @builtin(front_facing) frontFacing: bool) -> @location(0) vec4f {
  let alpha = saturate(input.bright);
  if (alpha <= 0.01) {
    discard;
  }
  let N = normalize(select(-input.normal, input.normal, frontFacing));
  let L = normalize(u.keyLightDir.xyz);
  let diffuse = max(dot(N, L), 0.0);
  let color = input.color * (0.82 + diffuse * 0.18);
  return vec4f(applyFog(color, input.worldPos, 0.16), alpha);
}

@fragment
fn fsGround(input: UnlitVertexOutput) -> @location(0) vec4f {
  return vec4f(shadeGround(input.worldPos), 1.0);
}

@fragment
fn fsUnlit(input: UnlitVertexOutput) -> @location(0) vec4f {
  return vec4f(applyFog(input.color, input.worldPos, 0.0), 1.0);
}

@fragment
fn fsOverlay(input: UnlitVertexOutput) -> @location(0) vec4f {
  return vec4f(emissiveOverlayColor(input.color, input.worldPos), 1.0);
}

@fragment
fn fsShadowUnlit(input: UnlitVertexOutput) -> @location(0) vec4f {
  return vec4f(applyFog(input.color, input.worldPos, 0.0), 0.18 + u.keyLightColor.w * 0.42);
}

@fragment
fn fsSmokeUnlit(input: UnlitVertexOutput) -> @location(0) vec4f {
  return vec4f(applyFog(input.color, input.worldPos, 0.08), 0.24);
}

@fragment
fn fsSky(input: SkyVertexOutput) -> @location(0) vec4f {
  let dir = viewDirFromNdc(input.ndc);
  let upAmount = saturate(dir.y * 0.5 + 0.5);
  let horizonBand = smoothstep(-0.18, 0.2, dir.y) * (1.0 - smoothstep(0.22, 0.88, dir.y));
  var color = mix(u.skyBottomColor.xyz, u.skyHorizonColor.xyz, smoothstep(-0.24, 0.1, dir.y));
  color = mix(color, u.skyTopColor.xyz, pow(upAmount, max(0.2, u.skyParams.x)));

  let sunDir = normalize(u.keyLightDir.xyz);
  let sunDot = max(dot(dir, sunDir), 0.0);
  let skyMode = u.skyParams.z;
  let sunTight = select(280.0, 640.0, skyMode > 0.5);
  let sunGlow = pow(sunDot, sunTight) * u.skyParams.y;
  color += u.keyLightColor.xyz * sunGlow;

  let cloudBand = smoothstep(-0.08, 0.28, dir.y) * (1.0 - smoothstep(0.42, 0.88, dir.y));
  if (cloudBand > 0.0 && u.cloudParams0.x > 0.01) {
    let cloudUv = dir.xz / max(0.14, dir.y + u.cloudParams1.z);
    let bandWarp = fbm(cloudUv * (u.cloudParams0.w * 0.35) + vec2f(10.0, -4.0));
    let cloudNoise = fbm(cloudUv * u.cloudParams0.z + vec2f(bandWarp * 0.8, bandWarp * -0.55));
    let cloudThreshold = mix(0.86, 0.44, saturate(u.cloudParams0.x));
    let cloudField = mix(cloudNoise, cloudNoise * 0.72 + bandWarp * 0.28, 0.5);
    let cloudMask = smoothstep(
      cloudThreshold,
      cloudThreshold + max(0.035, u.cloudParams0.y * 0.6),
      cloudField,
    ) * cloudBand * saturate(u.cloudParams1.y * 1.15);
    let cloudShade = saturate(0.35 + sunDot * 0.65);
    let cloudTint = mix(u.cloudShadowColor.xyz, u.cloudColor.xyz, cloudShade);
    color = mix(color, cloudTint, cloudMask);
  }

  if (skyMode > 1.5) {
    let haze = pow(1.0 - max(dir.y, 0.0), 2.2);
    color = mix(color, u.fogColor.xyz, haze * 0.36);
  } else if (skyMode > 0.5) {
    let starUv = floor(dir.xz * 640.0);
    let star = step(0.9975, hash21(starUv));
    color += vec3f(star * (0.45 + 0.55 * hash21(starUv + 17.0))) * (1.0 - cloudBand * 0.7);
  }

  color = mix(color, u.skyHorizonColor.xyz, horizonBand * 0.14);
  return vec4f(color, 1.0);
}
`;
