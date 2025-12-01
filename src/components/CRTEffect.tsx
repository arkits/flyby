import { forwardRef } from 'react';
import { Effect } from 'postprocessing';
import * as THREE from 'three';

// CRT shader code
const fragmentShader = `
  uniform float time;
  uniform float curvature;
  uniform float scanlineIntensity;
  uniform float vignetteIntensity;
  uniform float chromaticAberration;
  uniform float noiseIntensity;
  
  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 center = uv - 0.5;
    
    // Screen curvature effect
    float dist = length(center);
    vec2 curvedUV = center * (1.0 + curvature * dist * dist);
    curvedUV += 0.5;
    
    // Clamp to prevent sampling outside texture
    curvedUV = clamp(curvedUV, 0.0, 1.0);
    
    // Sample with chromatic aberration (RGB shift)
    vec2 offset = center * chromaticAberration * 0.01;
    float r = texture2D(inputBuffer, curvedUV + offset).r;
    float g = texture2D(inputBuffer, curvedUV).g;
    float b = texture2D(inputBuffer, curvedUV - offset).b;
    
    vec3 color = vec3(r, g, b);
    
    // Scanlines
    float scanline = sin(curvedUV.y * 800.0) * 0.5 + 0.5;
    scanline = 1.0 - scanline * scanlineIntensity;
    color *= scanline;
    
    // Vignette
    float vignette = 1.0 - dist * vignetteIntensity;
    color *= vignette;
    
    // Subtle noise/flicker
    float noise = fract(sin(dot(curvedUV + time, vec2(12.9898, 78.233))) * 43758.5453);
    color += (noise - 0.5) * noiseIntensity;
    
    // Slight brightness boost to compensate for darkening effects
    color *= 1.1;
    
    outputColor = vec4(color, inputColor.a);
  }
`;

class CRTEffectImpl extends Effect {
  constructor({
    curvature = 0.25,
    scanlineIntensity = 0.3,
    vignetteIntensity = 0.5,
    chromaticAberration = 0.5,
    noiseIntensity = 0.02,
  } = {}) {
    super('CRTEffect', fragmentShader, {
      uniforms: new Map([
        ['time', new THREE.Uniform(0)],
        ['curvature', new THREE.Uniform(curvature)],
        ['scanlineIntensity', new THREE.Uniform(scanlineIntensity)],
        ['vignetteIntensity', new THREE.Uniform(vignetteIntensity)],
        ['chromaticAberration', new THREE.Uniform(chromaticAberration)],
        ['noiseIntensity', new THREE.Uniform(noiseIntensity)],
      ]),
    });
  }

  update(_renderer: THREE.WebGLRenderer, _inputBuffer: THREE.WebGLRenderTarget, deltaTime: number) {
    const timeUniform = this.uniforms.get('time');
    if (timeUniform) {
      timeUniform.value += deltaTime;
    }
  }
}

export const CRTEffect = forwardRef(function CRTEffect(props: {
  curvature?: number;
  scanlineIntensity?: number;
  vignetteIntensity?: number;
  chromaticAberration?: number;
  noiseIntensity?: number;
}, ref) {
  const effect = new CRTEffectImpl(props);
  return <primitive ref={ref} object={effect} />;
});

