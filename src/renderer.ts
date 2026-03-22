// FLYBY2 — WebGPU Renderer
// Replaces the OpenGL 1.x backend

import type {
  SrfModel, SrfPolygon, SrfVertex, PosAtt, Color, Vec3,
  Field, Pc2, Pc2Object, Axis, Projection, GpuSrf, GpuField, Terrain, GpuPrimitive, MapEnvironment, WorldSnapshot, DynamicActorSnapshot,
} from './types';
import {
  vec3, getStdProjection, convLtoG, convGtoL, rotFastLtoG, rotFastGtoL,
  makeTrigonomy, vectorToAngle, pitchUp,
} from './math';
import { SHADER_WGSL } from './shader.wgsl';

// 13 floats per vertex: pos(3) + shadeNormal(3) + cullNormal(3) + color(3) + bright(1)
const LIT_STRIDE = 13;
// 6 floats per vertex: pos(3) + color(3)
const UNLIT_STRIDE = 6;
// Keep field-authored overlays just above the ground plane so they do not
// z-fight, but avoid visibly slicing through nearby building bases.
const PC2_OVERLAY_Y = 0.05;
const PC2_LAYER_STEP_Y = 0.01;
const SAMPLE_COUNT = 4;
const SHOW_DEBUG_GRID = false;
const POLYGON_EPSILON = 1e-5;
const SHADOW_GROUND_Y = 0.05;
const SHADOW_COLOR: Color = { r: 0.05, g: 0.08, b: 0.05 };
const GROUND_RING_SEGMENTS = [14, 16, 18, 20];
const GROUND_RING_RADII = [480, 1400, 3600, 8600];

const srfTriangulationCache = new WeakMap<SrfPolygon, number[]>();
const pc2TriangulationCache = new WeakMap<Pc2Object, number[]>();
const fieldGeometryWarnings = new Set<string>();

export class Renderer {
  private static readonly UNIFORM_FLOAT_COUNT = 140;
  private static readonly UNIFORM_BYTE_SIZE = Renderer.UNIFORM_FLOAT_COUNT * 4;
  private static readonly MAX_UNIFORM_DRAWS = 64;

  device!: GPUDevice;
  context!: GPUCanvasContext;
  format!: GPUTextureFormat;
  colorTexture!: GPUTexture;
  depthTexture!: GPUTexture;
  litPipeline!: GPURenderPipeline;
  litCulledPipeline!: GPURenderPipeline;
  actorLitPipeline!: GPURenderPipeline;
  actorLitCulledPipeline!: GPURenderPipeline;
  smokeLitPipeline!: GPURenderPipeline;
  shadowPipeline!: GPURenderPipeline;
  overlayPipeline!: GPURenderPipeline;
  overlayLinePipeline!: GPURenderPipeline;
  overlayPointPipeline!: GPURenderPipeline;
  unlitPipeline!: GPURenderPipeline;
  groundPipeline!: GPURenderPipeline;
  gridPipeline!: GPURenderPipeline;
  linePipeline!: GPURenderPipeline;
  smokeLinePipeline!: GPURenderPipeline;
  pointPipeline!: GPURenderPipeline;
  skyPipeline!: GPURenderPipeline;
  uniformBuffer!: GPUBuffer;
  uniformBindGroupLayout!: GPUBindGroupLayout;
  uniformBindGroup!: GPUBindGroup;
  uniformStride = 0;

  // Pre-built geometry
  gridBuffer!: GPUBuffer;
  gridVertCount = 0;
  groundBuffer!: GPUBuffer;
  groundVertCount = 0;
  groundBufferSize = { value: 0 };

  // Reusable smoke buffers (to prevent memory leak)
  smokeBuffer!: GPUBuffer;
  smokeBufferSize = { value: 0 };
  smokeLineBuffer!: GPUBuffer;
  smokeLineBufferSize = { value: 0 };
  vaporBuffer!: GPUBuffer;
  vaporBufferSize = { value: 0 };
  vaporLineBuffer!: GPUBuffer;
  vaporLineBufferSize = { value: 0 };

  private width = 0;
  private height = 0;

  async init(canvas: HTMLCanvasElement): Promise<void> {
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) throw new Error('WebGPU not available');

    this.device = await adapter.requestDevice();
    this.format = navigator.gpu.getPreferredCanvasFormat();

    this.context = canvas.getContext('webgpu')!;
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'premultiplied',
    });

    this.resize(canvas.width, canvas.height);

    // Create shader module
    const shaderModule = this.device.createShaderModule({ code: SHADER_WGSL });

    // Uniform buffer stores matrices plus environment lighting / fog / sky / ground parameters.
    this.uniformStride = Math.ceil(
      Renderer.UNIFORM_BYTE_SIZE / this.device.limits.minUniformBufferOffsetAlignment,
    ) * this.device.limits.minUniformBufferOffsetAlignment;
    this.uniformBuffer = this.device.createBuffer({
      size: this.uniformStride * Renderer.MAX_UNIFORM_DRAWS,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.uniformBindGroupLayout = this.device.createBindGroupLayout({
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform', hasDynamicOffset: true },
      }],
    });

    this.uniformBindGroup = this.device.createBindGroup({
      layout: this.uniformBindGroupLayout,
      entries: [{
        binding: 0,
        resource: { buffer: this.uniformBuffer, size: Renderer.UNIFORM_BYTE_SIZE },
      }],
    });

    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [this.uniformBindGroupLayout],
    });
    const smokeBlend: GPUBlendState = {
      color: {
        srcFactor: 'src-alpha',
        dstFactor: 'one-minus-src-alpha',
        operation: 'add',
      },
      alpha: {
        srcFactor: 'one',
        dstFactor: 'one-minus-src-alpha',
        operation: 'add',
      },
    };

    // Lit pipeline
    this.litPipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vsLit',
        buffers: [{
          arrayStride: LIT_STRIDE * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },  // position
            { shaderLocation: 1, offset: 12, format: 'float32x3' }, // normal
            { shaderLocation: 2, offset: 24, format: 'float32x3' }, // cull normal
            { shaderLocation: 3, offset: 36, format: 'float32x3' }, // color
            { shaderLocation: 4, offset: 48, format: 'float32' },   // bright
          ],
        }],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fsLit',
        targets: [{ format: this.format }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      multisample: { count: SAMPLE_COUNT },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less-equal',
        format: 'depth24plus',
      },
    });

    this.litCulledPipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vsLit',
        buffers: [{
          arrayStride: LIT_STRIDE * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
            { shaderLocation: 2, offset: 24, format: 'float32x3' },
            { shaderLocation: 3, offset: 36, format: 'float32x3' },
            { shaderLocation: 4, offset: 48, format: 'float32' },
          ],
        }],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fsLitOneSided',
        targets: [{ format: this.format }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      multisample: { count: SAMPLE_COUNT },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less-equal',
        format: 'depth24plus',
      },
    });

    this.actorLitPipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vsLit',
        buffers: [{
          arrayStride: LIT_STRIDE * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
            { shaderLocation: 2, offset: 24, format: 'float32x3' },
            { shaderLocation: 3, offset: 36, format: 'float32x3' },
            { shaderLocation: 4, offset: 48, format: 'float32' },
          ],
        }],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fsActorLit',
        targets: [{ format: this.format }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      multisample: { count: SAMPLE_COUNT },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less-equal',
        format: 'depth24plus',
      },
    });

    this.actorLitCulledPipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vsLit',
        buffers: [{
          arrayStride: LIT_STRIDE * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
            { shaderLocation: 2, offset: 24, format: 'float32x3' },
            { shaderLocation: 3, offset: 36, format: 'float32x3' },
            { shaderLocation: 4, offset: 48, format: 'float32' },
          ],
        }],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fsActorLitOneSided',
        targets: [{ format: this.format }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      multisample: { count: SAMPLE_COUNT },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less-equal',
        format: 'depth24plus',
      },
    });

    this.smokeLitPipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vsLit',
        buffers: [{
          arrayStride: LIT_STRIDE * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
            { shaderLocation: 2, offset: 24, format: 'float32x3' },
            { shaderLocation: 3, offset: 36, format: 'float32x3' },
            { shaderLocation: 4, offset: 48, format: 'float32' },
          ],
        }],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fsSmokeLit',
        targets: [{ format: this.format }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      multisample: { count: SAMPLE_COUNT },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: 'less',
        format: 'depth24plus',
      },
    });

    this.shadowPipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vsUnlit',
        buffers: [{
          arrayStride: UNLIT_STRIDE * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
          ],
        }],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fsShadowUnlit',
        targets: [{ format: this.format, blend: smokeBlend }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      multisample: { count: SAMPLE_COUNT },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: 'less-equal',
        format: 'depth24plus',
      },
    });

    // Unlit pipeline
    this.unlitPipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vsUnlit',
        buffers: [{
          arrayStride: UNLIT_STRIDE * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
          ],
        }],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fsUnlit',
        targets: [{ format: this.format, blend: smokeBlend }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      multisample: { count: SAMPLE_COUNT },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less-equal',
        format: 'depth24plus',
      },
    });

    this.groundPipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vsUnlit',
        buffers: [{
          arrayStride: UNLIT_STRIDE * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
          ],
        }],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fsGround',
        targets: [{ format: this.format }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      multisample: { count: SAMPLE_COUNT },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less-equal',
        format: 'depth24plus',
      },
    });

    this.overlayPipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vsUnlit',
        buffers: [{
          arrayStride: UNLIT_STRIDE * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
          ],
        }],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fsOverlay',
        targets: [{ format: this.format }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      multisample: { count: SAMPLE_COUNT },
      depthStencil: {
        // Keep the runway overlay slightly above the support plane so its
        // internal quad split does not fight the ground underneath.
        depthWriteEnabled: true,
        depthCompare: 'less-equal',
        depthBias: -32,
        depthBiasSlopeScale: -1,
        depthBiasClamp: 0,
        format: 'depth24plus',
      },
    });

    this.overlayLinePipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vsUnlit',
        buffers: [{
          arrayStride: UNLIT_STRIDE * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
          ],
        }],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fsOverlay',
        targets: [{ format: this.format }],
      },
      primitive: { topology: 'line-list', cullMode: 'none' },
      multisample: { count: SAMPLE_COUNT },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: 'less-equal',
        format: 'depth24plus',
      },
    });

    this.overlayPointPipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vsUnlit',
        buffers: [{
          arrayStride: UNLIT_STRIDE * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
          ],
        }],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fsOverlay',
        targets: [{ format: this.format }],
      },
      primitive: { topology: 'point-list', cullMode: 'none' },
      multisample: { count: SAMPLE_COUNT },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: 'less-equal',
        format: 'depth24plus',
      },
    });

    this.skyPipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vsSky',
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fsSky',
        targets: [{ format: this.format }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      multisample: { count: SAMPLE_COUNT },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: 'always',
        format: 'depth24plus',
      },
    });

    // Grid pipeline (lines)
    this.gridPipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vsUnlit',
        buffers: [{
          arrayStride: UNLIT_STRIDE * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
          ],
        }],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fsSmokeUnlit',
        targets: [{ format: this.format }],
      },
      primitive: { topology: 'line-list', cullMode: 'none' },
      multisample: { count: SAMPLE_COUNT },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: 'less-equal',
        format: 'depth24plus',
      },
    });

    this.linePipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vsUnlit',
        buffers: [{
          arrayStride: UNLIT_STRIDE * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
          ],
        }],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fsUnlit',
        targets: [{ format: this.format }],
      },
      primitive: { topology: 'line-list', cullMode: 'none' },
      multisample: { count: SAMPLE_COUNT },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: 'less-equal',
        format: 'depth24plus',
      },
    });

    this.smokeLinePipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vsUnlit',
        buffers: [{
          arrayStride: UNLIT_STRIDE * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
          ],
        }],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fsUnlit',
        targets: [{ format: this.format }],
      },
      primitive: { topology: 'line-list', cullMode: 'none' },
      multisample: { count: SAMPLE_COUNT },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: 'less',
        format: 'depth24plus',
      },
    });

    this.pointPipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vsUnlit',
        buffers: [{
          arrayStride: UNLIT_STRIDE * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
          ],
        }],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fsUnlit',
        targets: [{ format: this.format }],
      },
      primitive: { topology: 'point-list', cullMode: 'none' },
      multisample: { count: SAMPLE_COUNT },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: 'less-equal',
        format: 'depth24plus',
      },
    });

    this.buildGridBuffer();
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    const canvas = this.context.canvas as HTMLCanvasElement;
    canvas.width = w;
    canvas.height = h;

    if (this.colorTexture) this.colorTexture.destroy();
    if (this.depthTexture) this.depthTexture.destroy();
    this.colorTexture = this.device.createTexture({
      size: [w, h],
      sampleCount: SAMPLE_COUNT,
      format: this.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.depthTexture = this.device.createTexture({
      size: [w, h],
      sampleCount: SAMPLE_COUNT,
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  // --- Geometry Builders ---

  private createBuffer(data: Float32Array): GPUBuffer {
    const buf = this.device.createBuffer({
      size: Math.max(16, data.byteLength),
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    if (data.byteLength > 0) {
      this.device.queue.writeBuffer(buf, 0, data as Float32Array<ArrayBuffer>);
    }
    return buf;
  }

  private updateOrCreateBuffer(data: Float32Array, currentBuf: GPUBuffer, sizePtr: {value: number}, _name: string): GPUBuffer {
    const byteLength = data.byteLength;
    if (currentBuf && byteLength <= sizePtr.value) {
      // Reuse existing buffer
      this.device.queue.writeBuffer(currentBuf, 0, data as Float32Array<ArrayBuffer>);
      return currentBuf;
    }
    // Create new or larger buffer
    if (currentBuf) currentBuf.destroy();
    const buf = this.device.createBuffer({
      size: Math.max(16, byteLength),
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    if (byteLength > 0) {
      this.device.queue.writeBuffer(buf, 0, data as Float32Array<ArrayBuffer>);
    }
    sizePtr.value = Math.max(16, byteLength);
    return buf;
  }

  private buildGridBuffer(): void {
    const verts: number[] = [];
    const c = { r: 0, g: 0, b: 1 };
    for (let x = -20000; x <= 20000; x += 1000) {
      // X-direction line
      verts.push(x, 0.02, -20000, c.r, c.g, c.b);
      verts.push(x, 0.02, 20000, c.r, c.g, c.b);
      // Z-direction line
      verts.push(-20000, 0.02, x, c.r, c.g, c.b);
      verts.push(20000, 0.02, x, c.r, c.g, c.b);
    }
    const data = new Float32Array(verts);
    this.gridBuffer = this.createBuffer(data);
    this.gridVertCount = verts.length / UNLIT_STRIDE;
  }

  buildSrfGpuBuffer(model: SrfModel): GpuSrf {
    const oneSidedVerts: number[] = [];
    const twoSidedVerts: number[] = [];
    for (const plg of model.polygons) {
      triangulateSrfPolygon(oneSidedVerts, twoSidedVerts, plg, model.vertices);
    }
    return {
      oneSided: this.createPrimitive(new Float32Array(oneSidedVerts), LIT_STRIDE),
      twoSided: this.createPrimitive(new Float32Array(twoSidedVerts), LIT_STRIDE),
    };
  }

  buildFieldGpuBuffer(field: Field, lightDirection: Vec3): GpuField {
    try {
      const staticScene = buildFieldSceneGeometry(field, null, lightDirection);
      return {
        sceneLit: this.createPrimitive(staticScene.scene.lit, LIT_STRIDE),
        sceneShadow: this.createPrimitive(staticScene.scene.shadow, UNLIT_STRIDE),
        sceneUnlit: this.createPrimitive(staticScene.scene.unlit, UNLIT_STRIDE),
        sceneLines: this.createPrimitive(staticScene.scene.lines, UNLIT_STRIDE),
        scenePoints: this.createPrimitive(staticScene.scene.points, UNLIT_STRIDE),
        overlayUnlit: this.createPrimitive(staticScene.overlay.unlit, UNLIT_STRIDE),
        overlayLines: this.createPrimitive(staticScene.overlay.lines, UNLIT_STRIDE),
        overlayPoints: this.createPrimitive(staticScene.overlay.points, UNLIT_STRIDE),
        sceneLitBufferSize: Math.max(16, staticScene.scene.lit.byteLength),
        sceneShadowBufferSize: Math.max(16, staticScene.scene.shadow.byteLength),
        sceneUnlitBufferSize: Math.max(16, staticScene.scene.unlit.byteLength),
        sceneLinesBufferSize: Math.max(16, staticScene.scene.lines.byteLength),
        scenePointsBufferSize: Math.max(16, staticScene.scene.points.byteLength),
        overlayUnlitBufferSize: Math.max(16, staticScene.overlay.unlit.byteLength),
        overlayLinesBufferSize: Math.max(16, staticScene.overlay.lines.byteLength),
        overlayPointsBufferSize: Math.max(16, staticScene.overlay.points.byteLength),
      };
    } catch (error) {
      const wrapped = new Error('Failed to assemble field GPU buffers.');
      (wrapped as Error & { cause?: unknown }).cause = error;
      throw wrapped;
    }
  }

  private createPrimitive(data: Float32Array, stride: number): GpuPrimitive {
    return {
      buffer: this.createBuffer(data),
      vertexCount: Math.floor(data.length / stride),
    };
  }

  // --- Uniform Updates ---

  private makeUniformData(
    viewProj: Float32Array,
    model: Float32Array,
    eye: PosAtt,
    prj: Projection,
    environment: MapEnvironment,
  ): Float32Array {
    const basis = getCameraBasis(eye);
    const data = new Float32Array(Renderer.UNIFORM_FLOAT_COUNT);
    data.set(viewProj, 0);
    data.set(model, 16);

    writeVec4(data, 32, basis.right.x, basis.right.y, basis.right.z, 0);
    writeVec4(data, 36, basis.up.x, basis.up.y, basis.up.z, 0);
    writeVec4(data, 40, basis.forward.x, basis.forward.y, basis.forward.z, 0);
    writeVec4(data, 44, eye.p.x, eye.p.y, eye.p.z, 0);
    writeVec4(data, 48, (this.width * 0.5) / prj.magx, (this.height * 0.5) / prj.magy, this.width, this.height);
    writeVec4(
      data,
      52,
      environment.keyLight.direction.x,
      environment.keyLight.direction.y,
      environment.keyLight.direction.z,
      environment.keyLight.intensity,
    );
    writeColor4(data, 56, environment.keyLight.color, environment.keyLight.shadowStrength);
    writeColor4(data, 60, environment.hemisphere.skyColor, environment.hemisphere.intensity);
    writeColor4(data, 64, environment.hemisphere.groundColor, environment.hemisphere.balance);
    writeColor4(data, 68, environment.fog.color, 0);
    writeVec4(
      data,
      72,
      environment.fog.start,
      environment.fog.end,
      environment.fog.density,
      environment.fog.heightFalloff,
    );
    writeColor4(data, 76, environment.sky.topColor, 0);
    writeColor4(data, 80, environment.sky.horizonColor, 0);
    writeColor4(data, 84, environment.sky.bottomColor, 0);
    writeVec4(data, 88, environment.sky.curve, environment.sky.glow, skyModeId(environment), 0);
    writeColor4(data, 92, environment.cloud.color, 0);
    writeColor4(data, 96, environment.cloud.shadowColor, 0);
    writeVec4(
      data,
      100,
      environment.cloud.coverage,
      environment.cloud.softness,
      environment.cloud.scale,
      environment.cloud.bandScale,
    );
    writeVec4(
      data,
      104,
      environment.cloud.speed,
      environment.cloud.density,
      environment.cloud.height,
      0,
    );
    writeColor4(data, 108, environment.ground.primary, 0);
    writeColor4(data, 112, environment.ground.secondary, 0);
    writeColor4(data, 116, environment.ground.accent, 0);
    writeColor4(data, 120, environment.ground.paved, 0);
    writeVec4(
      data,
      124,
      environment.ground.detailScale,
      environment.ground.breakupScale,
      environment.ground.stripScale,
      environment.ground.patchScale,
    );
    writeVec4(
      data,
      128,
      environment.ground.pavementBias,
      environment.ground.shoulderDepth,
      mapVariantId(environment),
      0,
    );
    writeColor4(data, 132, environment.emissive.color, 0);
    writeVec4(
      data,
      136,
      environment.emissive.strength,
      environment.emissive.threshold,
      environment.emissive.saturationBoost,
      0,
    );
    return data;
  }

  private bindFrameUniforms(
    passEncoder: GPURenderPassEncoder,
    slotRef: { value: number },
    viewProj: Float32Array,
    model: Float32Array,
    eye: PosAtt,
    prj: Projection,
    environment: MapEnvironment,
  ): void {
    const slot = slotRef.value;
    if (slot >= Renderer.MAX_UNIFORM_DRAWS) {
      throw new Error(`Frame exceeded uniform draw budget (${Renderer.MAX_UNIFORM_DRAWS})`);
    }
    const data = this.makeUniformData(viewProj, model, eye, prj, environment);
    const offset = slot * this.uniformStride;
    this.device.queue.writeBuffer(this.uniformBuffer, offset, data as Float32Array<ArrayBuffer>);
    passEncoder.setBindGroup(0, this.uniformBindGroup, [offset]);
    slotRef.value += 1;
  }

  // --- Drawing ---

  beginFrame(_skyColor: Color): void {
    // clearScreen handled in endFrame via render pass
  }

  render(snapshot: WorldSnapshot): void {
    const {
      camera: eye,
      cameraZoom,
      environment,
      gpuField: fieldGpu,
      dynamicActors,
      smokeGeometry,
      vaporGeometry,
    } = snapshot;
    const prj = getStdProjection(this.width, this.height);
    prj.magx *= 2 * cameraZoom;
    prj.magy *= 2 * cameraZoom;
    const viewProj = buildViewProjMatrix(eye, prj);
    const identity = buildModelMatrix({ p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } });
    const uniformSlot = { value: 0 };

    const commandEncoder = this.device.createCommandEncoder();
    const textureView = this.context.getCurrentTexture().createView();
    const groundPlaneVerts = buildGroundRingGeometry(eye, environment.ground.primary);
    if (groundPlaneVerts.length > 0) {
      this.groundBuffer = this.updateOrCreateBuffer(
        groundPlaneVerts,
        this.groundBuffer,
        this.groundBufferSize,
        'ground-plane',
      );
      this.groundVertCount = groundPlaneVerts.length / UNLIT_STRIDE;
    } else {
      this.groundVertCount = 0;
    }

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: this.colorTexture.createView(),
        resolveTarget: textureView,
        clearValue: {
          r: environment.sky.topColor.r,
          g: environment.sky.topColor.g,
          b: environment.sky.topColor.b,
          a: 1,
        },
        loadOp: 'clear',
        storeOp: 'store',
      }],
      depthStencilAttachment: {
        view: this.depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });

    this.bindFrameUniforms(passEncoder, uniformSlot, viewProj, identity, eye, prj, environment);
    passEncoder.setPipeline(this.skyPipeline);
    passEncoder.draw(3);

    if (this.groundVertCount > 0) {
      this.bindFrameUniforms(passEncoder, uniformSlot, viewProj, identity, eye, prj, environment);
      passEncoder.setPipeline(this.groundPipeline);
      passEncoder.setVertexBuffer(0, this.groundBuffer);
      passEncoder.draw(this.groundVertCount);
    }

    // --- Draw field overlays before inserted scene objects ---
    if (fieldGpu.overlayUnlit.vertexCount > 0) {
      this.bindFrameUniforms(passEncoder, uniformSlot, viewProj, identity, eye, prj, environment);
      passEncoder.setPipeline(this.overlayPipeline);
      passEncoder.setVertexBuffer(0, fieldGpu.overlayUnlit.buffer);
      passEncoder.draw(fieldGpu.overlayUnlit.vertexCount);
    }
    if (fieldGpu.overlayLines.vertexCount > 0) {
      this.bindFrameUniforms(passEncoder, uniformSlot, viewProj, identity, eye, prj, environment);
      passEncoder.setPipeline(this.overlayLinePipeline);
      passEncoder.setVertexBuffer(0, fieldGpu.overlayLines.buffer);
      passEncoder.draw(fieldGpu.overlayLines.vertexCount);
    }
    if (fieldGpu.overlayPoints.vertexCount > 0) {
      this.bindFrameUniforms(passEncoder, uniformSlot, viewProj, identity, eye, prj, environment);
      passEncoder.setPipeline(this.overlayPointPipeline);
      passEncoder.setVertexBuffer(0, fieldGpu.overlayPoints.buffer);
      passEncoder.draw(fieldGpu.overlayPoints.vertexCount);
    }

    // --- Draw grid (lines) ---
    if (SHOW_DEBUG_GRID) {
      this.bindFrameUniforms(passEncoder, uniformSlot, viewProj, identity, eye, prj, environment);
      passEncoder.setPipeline(this.gridPipeline);
      passEncoder.setVertexBuffer(0, this.gridBuffer);
      passEncoder.draw(this.gridVertCount);
    }

    // --- Draw field objects (lit) ---
    if (fieldGpu.sceneUnlit.vertexCount > 0) {
      this.bindFrameUniforms(passEncoder, uniformSlot, viewProj, identity, eye, prj, environment);
      passEncoder.setPipeline(this.unlitPipeline);
      passEncoder.setVertexBuffer(0, fieldGpu.sceneUnlit.buffer);
      passEncoder.draw(fieldGpu.sceneUnlit.vertexCount);
    }
    if (fieldGpu.sceneLines.vertexCount > 0) {
      this.bindFrameUniforms(passEncoder, uniformSlot, viewProj, identity, eye, prj, environment);
      passEncoder.setPipeline(this.linePipeline);
      passEncoder.setVertexBuffer(0, fieldGpu.sceneLines.buffer);
      passEncoder.draw(fieldGpu.sceneLines.vertexCount);
    }
    if (fieldGpu.scenePoints.vertexCount > 0) {
      this.bindFrameUniforms(passEncoder, uniformSlot, viewProj, identity, eye, prj, environment);
      passEncoder.setPipeline(this.pointPipeline);
      passEncoder.setVertexBuffer(0, fieldGpu.scenePoints.buffer);
      passEncoder.draw(fieldGpu.scenePoints.vertexCount);
    }
    if (fieldGpu.sceneLit.vertexCount > 0) {
      this.bindFrameUniforms(passEncoder, uniformSlot, viewProj, identity, eye, prj, environment);
      passEncoder.setPipeline(this.litPipeline);
      passEncoder.setVertexBuffer(0, fieldGpu.sceneLit.buffer);
      passEncoder.draw(fieldGpu.sceneLit.vertexCount);
    }
    if (fieldGpu.sceneShadow.vertexCount > 0) {
      this.bindFrameUniforms(passEncoder, uniformSlot, viewProj, identity, eye, prj, environment);
      passEncoder.setPipeline(this.shadowPipeline);
      passEncoder.setVertexBuffer(0, fieldGpu.sceneShadow.buffer);
      passEncoder.draw(fieldGpu.sceneShadow.vertexCount);
    }

    // --- Draw smoke ---
    if (smokeGeometry.lit.length > 0) {
      this.smokeBuffer = this.updateOrCreateBuffer(
        smokeGeometry.lit,
        this.smokeBuffer,
        this.smokeBufferSize,
        'smoke',
      );
      this.bindFrameUniforms(passEncoder, uniformSlot, viewProj, identity, eye, prj, environment);
      passEncoder.setPipeline(this.smokeLitPipeline);
      passEncoder.setVertexBuffer(0, this.smokeBuffer);
      passEncoder.draw(smokeGeometry.lit.length / LIT_STRIDE);
    }

    if (smokeGeometry.lines.length > 0) {
      this.smokeLineBuffer = this.updateOrCreateBuffer(
        smokeGeometry.lines,
        this.smokeLineBuffer,
        this.smokeLineBufferSize,
        'smoke-lines',
      );
      this.bindFrameUniforms(passEncoder, uniformSlot, viewProj, identity, eye, prj, environment);
      passEncoder.setPipeline(this.smokeLinePipeline);
      passEncoder.setVertexBuffer(0, this.smokeLineBuffer);
      passEncoder.draw(smokeGeometry.lines.length / UNLIT_STRIDE);
    }

    if (vaporGeometry.lit.length > 0) {
      this.vaporBuffer = this.updateOrCreateBuffer(
        vaporGeometry.lit,
        this.vaporBuffer,
        this.vaporBufferSize,
        'vapor',
      );
      this.bindFrameUniforms(passEncoder, uniformSlot, viewProj, identity, eye, prj, environment);
      passEncoder.setPipeline(this.smokeLitPipeline);
      passEncoder.setVertexBuffer(0, this.vaporBuffer);
      passEncoder.draw(vaporGeometry.lit.length / LIT_STRIDE);
    }

    if (vaporGeometry.lines.length > 0) {
      this.vaporLineBuffer = this.updateOrCreateBuffer(
        vaporGeometry.lines,
        this.vaporLineBuffer,
        this.vaporLineBufferSize,
        'vapor-lines',
      );
      this.bindFrameUniforms(passEncoder, uniformSlot, viewProj, identity, eye, prj, environment);
      passEncoder.setPipeline(this.smokeLinePipeline);
      passEncoder.setVertexBuffer(0, this.vaporLineBuffer);
      passEncoder.draw(vaporGeometry.lines.length / UNLIT_STRIDE);
    }

    // --- Draw dynamic actors after smoke so aircraft remain readable in
    // smoke-heavy maneuvers. Smoke does not write depth in this adaptation.
    for (const actor of dynamicActors) {
      this.drawDynamicActor(passEncoder, actor, uniformSlot, viewProj, eye, prj, environment);
    }

    passEncoder.end();
    this.device.queue.submit([commandEncoder.finish()]);
  }

  private drawDynamicActor(
    passEncoder: GPURenderPassEncoder,
    actor: DynamicActorSnapshot,
    slotRef: { value: number },
    viewProj: Float32Array,
    eye: PosAtt,
    prj: Projection,
    environment: MapEnvironment,
  ): void {
    const modelMatrix = buildModelMatrix(actor.transform);
    if (actor.gpuModel.twoSided.vertexCount > 0) {
      this.bindFrameUniforms(passEncoder, slotRef, viewProj, modelMatrix, eye, prj, environment);
      passEncoder.setPipeline(actor.kind === 'aircraft' ? this.actorLitPipeline : this.litPipeline);
      passEncoder.setVertexBuffer(0, actor.gpuModel.twoSided.buffer);
      passEncoder.draw(actor.gpuModel.twoSided.vertexCount);
    }
    if (actor.gpuModel.oneSided.vertexCount > 0) {
      this.bindFrameUniforms(passEncoder, slotRef, viewProj, modelMatrix, eye, prj, environment);
      passEncoder.setPipeline(actor.kind === 'aircraft' ? this.actorLitCulledPipeline : this.litCulledPipeline);
      passEncoder.setVertexBuffer(0, actor.gpuModel.oneSided.buffer);
      passEncoder.draw(actor.gpuModel.oneSided.vertexCount);
    }
  }
}

// --- Geometry Helpers ---

function writeVec4(data: Float32Array, offset: number, x: number, y: number, z: number, w: number): void {
  data[offset] = x;
  data[offset + 1] = y;
  data[offset + 2] = z;
  data[offset + 3] = w;
}

function writeColor4(data: Float32Array, offset: number, color: Color, w: number): void {
  writeVec4(data, offset, color.r, color.g, color.b, w);
}

function skyModeId(environment: MapEnvironment): number {
  switch (environment.sky.mode) {
    case 'night':
      return 1;
    case 'hazy':
      return 2;
    case 'clear':
    default:
      return 0;
  }
}

function mapVariantId(environment: MapEnvironment): number {
  switch (environment.key) {
    case 'airport-improved':
      return 1;
    case 'airport-night':
      return 2;
    case 'downtown':
      return 3;
    case 'airport':
    default:
      return 0;
  }
}

function pushLitVert(
  verts: number[], p: Vec3, n: Vec3, cullNormal: Vec3, c: Color, bright: number,
): void {
  verts.push(
    p.x, p.y, p.z,
    n.x, n.y, n.z,
    cullNormal.x, cullNormal.y, cullNormal.z,
    c.r, c.g, c.b,
    bright,
  );
}

function pushUnlitTri(
  verts: number[], p0: Vec3, p1: Vec3, p2: Vec3, c: Color,
): void {
  verts.push(p0.x, p0.y, p0.z, c.r, c.g, c.b);
  verts.push(p1.x, p1.y, p1.z, c.r, c.g, c.b);
  verts.push(p2.x, p2.y, p2.z, c.r, c.g, c.b);
}

function pushUnlitLine(verts: number[], p0: Vec3, p1: Vec3, c: Color): void {
  verts.push(p0.x, p0.y, p0.z, c.r, c.g, c.b);
  verts.push(p1.x, p1.y, p1.z, c.r, c.g, c.b);
}

function pushUnlitPoint(verts: number[], p: Vec3, c: Color): void {
  verts.push(p.x, p.y, p.z, c.r, c.g, c.b);
}

type ShadowPoint = { x: number; z: number };

function projectShadowPoint(point: Vec3, lightDirection: Vec3): ShadowPoint | null {
  const shadowDirection = vec3(-lightDirection.x, -lightDirection.y, -lightDirection.z);
  if (Math.abs(shadowDirection.y) <= 1e-6) {
    return null;
  }
  const t = (SHADOW_GROUND_Y - point.y) / shadowDirection.y;
  if (t < 0) {
    return null;
  }
  return {
    x: point.x + shadowDirection.x * t,
    z: point.z + shadowDirection.z * t,
  };
}

function shadowCross(o: ShadowPoint, a: ShadowPoint, b: ShadowPoint): number {
  return ((a.x - o.x) * (b.z - o.z)) - ((a.z - o.z) * (b.x - o.x));
}

function buildShadowHull(points: ShadowPoint[]): ShadowPoint[] {
  if (points.length < 3) {
    return [];
  }

  const sorted = [...points].sort((a, b) => (a.x - b.x) || (a.z - b.z));
  const lower: ShadowPoint[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && shadowCross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: ShadowPoint[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const point = sorted[i];
    while (upper.length >= 2 && shadowCross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function triangulateSrfShadow(verts: number[], model: SrfModel, pos: PosAtt, lightDirection: Vec3): void {
  if (model.bbox.length === 0) {
    return;
  }

  const min = model.bbox[0];
  const max = model.bbox[7];
  if ((max.y - min.y) < 1) {
    return;
  }

  const axs: Axis = { p: { ...pos.p }, a: { ...pos.a }, t: makeTrigonomy(pos.a) };
  const projected: ShadowPoint[] = [];
  for (const corner of model.bbox) {
    const worldPoint = vec3(0, 0, 0);
    convLtoG(worldPoint, corner, axs);
    const shadowPoint = projectShadowPoint(worldPoint, lightDirection);
    if (shadowPoint !== null) {
      projected.push(shadowPoint);
    }
  }

  const hull = buildShadowHull(projected);
  if (hull.length < 3) {
    return;
  }

  const anchor = vec3(hull[0].x, SHADOW_GROUND_Y, hull[0].z);
  for (let i = 1; i < hull.length - 1; i++) {
    pushUnlitTri(
      verts,
      anchor,
      vec3(hull[i].x, SHADOW_GROUND_Y, hull[i].z),
      vec3(hull[i + 1].x, SHADOW_GROUND_Y, hull[i + 1].z),
      SHADOW_COLOR,
    );
  }
}

function getCameraBasis(eye: PosAtt): { right: Vec3; up: Vec3; forward: Vec3 } {
  const t = makeTrigonomy(eye.a);
  const right = vec3(0, 0, 0);
  const up = vec3(0, 0, 0);
  const forward = vec3(0, 0, 0);
  rotFastLtoG(right, vec3(1, 0, 0), t);
  rotFastLtoG(up, vec3(0, 1, 0), t);
  rotFastLtoG(forward, vec3(0, 0, 1), t);
  return { right, up, forward };
}

function buildGroundRingGeometry(eye: PosAtt, groundColor: Color): Float32Array {
  const verts: number[] = [];
  const centerX = Math.round(eye.p.x / 120) * 120;
  const centerZ = Math.round(eye.p.z / 120) * 120;
  const y = -0.08;

  let inner = 0;
  for (let ringIndex = 0; ringIndex < GROUND_RING_RADII.length; ringIndex++) {
    const outer = GROUND_RING_RADII[ringIndex];
    const segments = GROUND_RING_SEGMENTS[ringIndex];
    const step = (outer * 2) / segments;

    for (let zIndex = 0; zIndex < segments; zIndex++) {
      for (let xIndex = 0; xIndex < segments; xIndex++) {
        const x0 = -outer + (xIndex * step);
        const x1 = x0 + step;
        const z0 = -outer + (zIndex * step);
        const z1 = z0 + step;

        if (inner > 0 && x0 >= -inner && x1 <= inner && z0 >= -inner && z1 <= inner) {
          continue;
        }

        const p0 = vec3(centerX + x0, y, centerZ + z0);
        const p1 = vec3(centerX + x1, y, centerZ + z0);
        const p2 = vec3(centerX + x1, y, centerZ + z1);
        const p3 = vec3(centerX + x0, y, centerZ + z1);
        pushUnlitTri(verts, p0, p1, p2, groundColor);
        pushUnlitTri(verts, p0, p2, p3, groundColor);
      }
    }

    inner = outer;
  }

  return new Float32Array(verts);
}


function pushSrfVertex(
  verts: number[],
  vertex: SrfVertex,
  plg: SrfPolygon,
  useSmoothNormal: boolean,
): void {
  const normal = useSmoothNormal ? vertex.normal : plg.normal;
  pushLitVert(verts, vertex.pos, normal, plg.normal, plg.color, plg.bright);
}

function projectPolygonPoint(point: Vec3, normal: Vec3): { x: number; y: number } {
  const ax = Math.abs(normal.x);
  const ay = Math.abs(normal.y);
  const az = Math.abs(normal.z);
  if (ax >= ay && ax >= az) {
    return { x: point.y, y: point.z };
  }
  if (ay >= ax && ay >= az) {
    return { x: point.x, y: point.z };
  }
  return { x: point.x, y: point.y };
}

function polygonCross2d(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): number {
  return ((b.x - a.x) * (c.y - a.y)) - ((b.y - a.y) * (c.x - a.x));
}

function polygonArea2d(points: { x: number; y: number }[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += (current.x * next.y) - (next.x * current.y);
  }
  return area * 0.5;
}

function samePoint2d(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) <= POLYGON_EPSILON && Math.abs(a.y - b.y) <= POLYGON_EPSILON;
}

function pointInTriangle2d(
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  orientation: number,
): boolean {
  const ab = polygonCross2d(a, b, point) * orientation;
  const bc = polygonCross2d(b, c, point) * orientation;
  const ca = polygonCross2d(c, a, point) * orientation;
  return ab >= -POLYGON_EPSILON && bc >= -POLYGON_EPSILON && ca >= -POLYGON_EPSILON;
}

function triangulatePolygonIndices(points: { x: number; y: number }[]): number[] {
  const deduped: number[] = [];
  for (let i = 0; i < points.length; i++) {
    if (deduped.length === 0 || !samePoint2d(points[deduped[deduped.length - 1]], points[i])) {
      deduped.push(i);
    }
  }
  if (deduped.length >= 2 && samePoint2d(points[deduped[0]], points[deduped[deduped.length - 1]])) {
    deduped.pop();
  }
  if (deduped.length < 3) {
    return [];
  }

  const fallbackFan = (): number[] => {
    const tris: number[] = [];
    for (let i = 1; i < deduped.length - 1; i++) {
      tris.push(deduped[0], deduped[i], deduped[i + 1]);
    }
    return tris;
  };

  if (deduped.length === 3) {
    return deduped;
  }

  const polygon = deduped.map(index => points[index]);
  const orientation = polygonArea2d(polygon) >= 0 ? 1 : -1;
  const remaining = [...deduped];
  const triangles: number[] = [];
  let guard = 0;
  const maxGuard = remaining.length * remaining.length;

  while (remaining.length > 3 && guard < maxGuard) {
    let earFound = false;
    for (let i = 0; i < remaining.length; i++) {
      const prev = remaining[(i + remaining.length - 1) % remaining.length];
      const current = remaining[i];
      const next = remaining[(i + 1) % remaining.length];
      const a = points[prev];
      const b = points[current];
      const c = points[next];
      if ((polygonCross2d(a, b, c) * orientation) <= POLYGON_EPSILON) {
        continue;
      }

      let containsPoint = false;
      for (const candidate of remaining) {
        if (candidate === prev || candidate === current || candidate === next) {
          continue;
        }
        if (pointInTriangle2d(points[candidate], a, b, c, orientation)) {
          containsPoint = true;
          break;
        }
      }

      if (!containsPoint) {
        triangles.push(prev, current, next);
        remaining.splice(i, 1);
        earFound = true;
        break;
      }
    }

    if (!earFound) {
      return fallbackFan();
    }
    guard++;
  }

  if (remaining.length !== 3) {
    return fallbackFan();
  }

  triangles.push(remaining[0], remaining[1], remaining[2]);
  return triangles;
}

function getSrfPolygonTriangles(plg: SrfPolygon, vertices: SrfVertex[]): number[] {
  const cached = srfTriangulationCache.get(plg);
  if (cached) {
    return cached;
  }

  const points = plg.vertexIds.map(vertexId => projectPolygonPoint(vertices[vertexId].pos, plg.normal));
  const triangles = triangulatePolygonIndices(points);
  srfTriangulationCache.set(plg, triangles);
  return triangles;
}

function getPc2PolygonTriangles(obj: Pc2Object): number[] {
  const cached = pc2TriangulationCache.get(obj);
  if (cached) {
    return cached;
  }

  const triangles = triangulatePolygonIndices(obj.vertices);
  pc2TriangulationCache.set(obj, triangles);
  return triangles;
}

function triangulateSrfPolygon(
  oneSidedVerts: number[],
  twoSidedVerts: number[],
  plg: SrfPolygon,
  vertices: SrfVertex[],
): void {
  if (plg.nVt < 3) return;
  const dst = plg.backFaceRemove ? oneSidedVerts : twoSidedVerts;
  const triangles = getSrfPolygonTriangles(plg, vertices);
  for (let i = 0; i < triangles.length; i += 3) {
    const v0 = vertices[plg.vertexIds[triangles[i]]];
    const vi = vertices[plg.vertexIds[triangles[i + 1]]];
    const vip1 = vertices[plg.vertexIds[triangles[i + 2]]];
    const smooth = plg.backFaceRemove !== 0;
    pushSrfVertex(dst, v0, plg, smooth && v0.smoothFlag !== 0);
    pushSrfVertex(dst, vi, plg, smooth && vi.smoothFlag !== 0);
    pushSrfVertex(dst, vip1, plg, smooth && vip1.smoothFlag !== 0);
  }
}

function triangulateSrfPolygonTransformed(
  verts: number[],
  plg: SrfPolygon,
  vertices: SrfVertex[],
  pos: PosAtt,
  eye: PosAtt | null,
): void {
  if (plg.nVt < 3) return;

  const axs: Axis = { p: { ...pos.p }, a: { ...pos.a }, t: makeTrigonomy(pos.a) };
  const faceNormal = vec3(0, 0, 0);
  rotFastLtoG(faceNormal, plg.normal, axs.t);
  if (eye !== null) {
    const worldCenter = vec3(0, 0, 0);
    convLtoG(worldCenter, plg.center, axs);
    const faceDot = (
      (worldCenter.x - eye.p.x) * faceNormal.x
      + (worldCenter.y - eye.p.y) * faceNormal.y
      + (worldCenter.z - eye.p.z) * faceNormal.z
    );
    if (plg.backFaceRemove !== 0 && faceDot > 0) {
      return;
    }
  }

  const triangles = getSrfPolygonTriangles(plg, vertices);
  for (let i = 0; i < triangles.length; i += 3) {
    const tri = [triangles[i], triangles[i + 1], triangles[i + 2]];
    for (const vertexIndex of tri) {
      const src = vertices[plg.vertexIds[vertexIndex]];
      const worldPos = vec3(0, 0, 0);
      convLtoG(worldPos, src.pos, axs);

      const useSmooth = plg.backFaceRemove !== 0 && src.smoothFlag !== 0;
      const worldNormal = vec3(0, 0, 0);
      rotFastLtoG(worldNormal, useSmooth ? src.normal : plg.normal, axs.t);
      pushLitVert(verts, worldPos, worldNormal, faceNormal, plg.color, plg.bright);
    }
  }
}

interface PrimitiveBuckets {
  lit: number[];
  unlit: number[];
  lines: number[];
  points: number[];
}

function triangulatePc2(
  buckets: PrimitiveBuckets,
  pc2: Pc2,
  pos: PosAtt,
  layerBase: number,
  eye: PosAtt | null,
): void {
  const axs: Axis = { p: { ...pos.p }, a: { ...pos.a }, t: makeTrigonomy(pos.a) };
  const eyeAxs = eye === null ? null : { p: { ...eye.p }, a: { ...eye.a }, t: makeTrigonomy(eye.a) };
  for (let objectIndex = 0; objectIndex < pc2.objects.length; objectIndex++) {
    const obj = pc2.objects[objectIndex];
    if (eyeAxs !== null && !isPc2ObjectVisible(obj, axs, eyeAxs, layerBase + objectIndex * PC2_LAYER_STEP_Y)) {
      continue;
    }

    switch (obj.type) {
      case 'PLG':
        triangulatePc2Polygon(buckets.unlit, obj, axs, layerBase + objectIndex * PC2_LAYER_STEP_Y);
        break;
      case 'PLL':
        triangulatePc2Polyline(buckets.lines, obj, axs, layerBase + objectIndex * PC2_LAYER_STEP_Y, true);
        break;
      case 'LSQ':
        triangulatePc2Polyline(buckets.lines, obj, axs, layerBase + objectIndex * PC2_LAYER_STEP_Y, false);
        break;
      case 'PST':
        triangulatePc2Points(buckets.points, obj, axs, layerBase + objectIndex * PC2_LAYER_STEP_Y);
        break;
    }
  }
}

function isPc2ObjectVisible(obj: Pc2Object, pc2Axs: Axis, eyeAxs: Axis, layerBase: number): boolean {
  const worldCenter = vec3(0, 0, 0);
  convLtoG(worldCenter, vec3(obj.center.x, obj.center.y, layerBase), pc2Axs);
  const cameraCenter = vec3(0, 0, 0);
  convGtoL(cameraCenter, worldCenter, eyeAxs);
  return (
    Math.abs(cameraCenter.x) <= obj.visiDist &&
    Math.abs(cameraCenter.y) <= obj.visiDist &&
    Math.abs(cameraCenter.z) <= obj.visiDist
  );
}

function triangulatePc2Polygon(verts: number[], obj: Pc2Object, axs: Axis, layerBase: number): void {
  if (obj.vertices.length < 3) return;
  const triangles = getPc2PolygonTriangles(obj);
  for (let i = 0; i < triangles.length; i += 3) {
    pushPc2Tri(
      verts,
      obj,
      axs,
      layerBase,
      obj.vertices[triangles[i]],
      obj.vertices[triangles[i + 1]],
      obj.vertices[triangles[i + 2]],
    );
  }
}

function triangulatePc2Polyline(
  verts: number[],
  obj: Pc2Object,
  axs: Axis,
  layerBase: number,
  closed: boolean,
): void {
  const count = closed ? obj.vertices.length : obj.vertices.length - 1;
  for (let i = 0; i < count; i++) {
    const a = obj.vertices[i];
    const b = obj.vertices[(i + 1) % obj.vertices.length];
    pushPc2Segment(verts, obj, axs, layerBase, a, b);
  }
}

function triangulatePc2Points(verts: number[], obj: Pc2Object, axs: Axis, layerBase: number): void {
  for (const point of obj.vertices) {
    const p = vec3(0, 0, 0);
    convLtoG(p, vec3(point.x, point.y, layerBase), axs);
    pushUnlitPoint(verts, p, obj.color);
  }
}

function pushPc2Segment(
  verts: number[],
  obj: Pc2Object,
  axs: Axis,
  layerBase: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
): void {
  const p0 = vec3(0, 0, 0);
  const p1 = vec3(0, 0, 0);
  convLtoG(p0, vec3(a.x, a.y, layerBase), axs);
  convLtoG(p1, vec3(b.x, b.y, layerBase), axs);
  pushUnlitLine(verts, p0, p1, obj.color);
}

function pushPc2Tri(
  verts: number[],
  obj: Pc2Object,
  axs: Axis,
  layerBase: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): void {
  const p0 = vec3(0, 0, 0);
  const p1 = vec3(0, 0, 0);
  const p2 = vec3(0, 0, 0);
  convLtoG(p0, vec3(a.x, a.y, layerBase), axs);
  convLtoG(p1, vec3(b.x, b.y, layerBase), axs);
  convLtoG(p2, vec3(c.x, c.y, layerBase), axs);

  pushUnlitTri(verts, p0, p1, p2, obj.color);
}

function terrainBlockIndex(ter: Terrain, x: number, z: number): number {
  return z * (ter.xSiz + 1) + x;
}

function terrainPoint(ter: Terrain, x: number, z: number): Vec3 {
  const blk = ter.blocks[terrainBlockIndex(ter, x, z)];
  return vec3(ter.xWid * x, blk.y, ter.zWid * z);
}

function pushTerrainTri(
  verts: number[], p0: Vec3, p1: Vec3, p2: Vec3, color: Color, axs: Axis,
): void {
  const tp0 = vec3(0, 0, 0);
  const tp1 = vec3(0, 0, 0);
  const tp2 = vec3(0, 0, 0);
  convLtoG(tp0, p0, axs);
  convLtoG(tp1, p1, axs);
  convLtoG(tp2, p2, axs);

  const ux = tp2.x - tp1.x;
  const uy = tp2.y - tp1.y;
  const uz = tp2.z - tp1.z;
  const vx = tp1.x - tp0.x;
  const vy = tp1.y - tp0.y;
  const vz = tp1.z - tp0.z;
  const n = vec3(
    uy * vz - uz * vy,
    uz * vx - ux * vz,
    ux * vy - uy * vx,
  );

  pushLitVert(verts, tp0, n, n, color, 0);
  pushLitVert(verts, tp1, n, n, color, 0);
  pushLitVert(verts, tp2, n, n, color, 0);
}

function triangulateTerrain(verts: number[], ter: Terrain, pos: PosAtt): void {
  const axs: Axis = { p: { ...pos.p }, a: { ...pos.a }, t: makeTrigonomy(pos.a) };

  for (let z = 0; z < ter.zSiz; z++) {
    for (let x = 0; x < ter.xSiz; x++) {
      const blk = ter.blocks[terrainBlockIndex(ter, x, z)];
      const ed0 = terrainPoint(ter, x, z);
      const ed1 = terrainPoint(ter, x + 1, z);
      const ed2 = terrainPoint(ter, x, z + 1);
      const ed3 = terrainPoint(ter, x + 1, z + 1);

      const tri0 = blk.lup === 1 ? [ed1, ed3, ed2] : [ed0, ed3, ed2];
      const tri1 = blk.lup === 1 ? [ed0, ed1, ed2] : [ed0, ed1, ed3];

      if (blk.vis[0]) {
        pushTerrainTri(verts, tri0[0], tri0[1], tri0[2], blk.col[0], axs);
      }
      if (blk.vis[1]) {
        pushTerrainTri(verts, tri1[0], tri1[1], tri1[2], blk.col[1], axs);
      }
    }
  }

  if (ter.side[0]) {
    for (let x = 0; x < ter.xSiz; x++) {
      const blk0 = ter.blocks[terrainBlockIndex(ter, x, 0)];
      const blk1 = ter.blocks[terrainBlockIndex(ter, x + 1, 0)];
      const p0 = vec3(x * ter.xWid, 0, 0);
      const p1 = vec3((x + 1) * ter.xWid, 0, 0);
      const p2 = vec3((x + 1) * ter.xWid, blk1.y, 0);
      const p3 = vec3(x * ter.xWid, blk0.y, 0);
      pushTerrainTri(verts, p0, p1, p2, ter.sdCol[0], axs);
      pushTerrainTri(verts, p0, p2, p3, ter.sdCol[0], axs);
    }
  }
  if (ter.side[1]) {
    for (let z = 0; z < ter.zSiz; z++) {
      const blk0 = ter.blocks[terrainBlockIndex(ter, ter.xSiz, z)];
      const blk1 = ter.blocks[terrainBlockIndex(ter, ter.xSiz, z + 1)];
      const p0 = vec3(ter.xWid * ter.xSiz, 0, z * ter.zWid);
      const p1 = vec3(ter.xWid * ter.xSiz, 0, (z + 1) * ter.zWid);
      const p2 = vec3(ter.xWid * ter.xSiz, blk1.y, (z + 1) * ter.zWid);
      const p3 = vec3(ter.xWid * ter.xSiz, blk0.y, z * ter.zWid);
      pushTerrainTri(verts, p0, p1, p2, ter.sdCol[1], axs);
      pushTerrainTri(verts, p0, p2, p3, ter.sdCol[1], axs);
    }
  }
  if (ter.side[2]) {
    for (let x = 0; x < ter.xSiz; x++) {
      const blk0 = ter.blocks[terrainBlockIndex(ter, x, ter.zSiz)];
      const blk1 = ter.blocks[terrainBlockIndex(ter, x + 1, ter.zSiz)];
      const p0 = vec3(x * ter.xWid, 0, ter.zWid * ter.zSiz);
      const p1 = vec3((x + 1) * ter.xWid, 0, ter.zWid * ter.zSiz);
      const p2 = vec3((x + 1) * ter.xWid, blk1.y, ter.zWid * ter.zSiz);
      const p3 = vec3(x * ter.xWid, blk0.y, ter.zWid * ter.zSiz);
      pushTerrainTri(verts, p0, p2, p1, ter.sdCol[2], axs);
      pushTerrainTri(verts, p0, p3, p2, ter.sdCol[2], axs);
    }
  }
  if (ter.side[3]) {
    for (let z = 0; z < ter.zSiz; z++) {
      const blk0 = ter.blocks[terrainBlockIndex(ter, 0, z)];
      const blk1 = ter.blocks[terrainBlockIndex(ter, 0, z + 1)];
      const p0 = vec3(0, 0, z * ter.zWid);
      const p1 = vec3(0, 0, (z + 1) * ter.zWid);
      const p2 = vec3(0, blk1.y, (z + 1) * ter.zWid);
      const p3 = vec3(0, blk0.y, z * ter.zWid);
      pushTerrainTri(verts, p0, p2, p1, ter.sdCol[3], axs);
      pushTerrainTri(verts, p0, p3, p2, ter.sdCol[3], axs);
    }
  }
}

function angleToVectors(att: PosAtt['a']): { eye: Vec3; up: Vec3 } {
  const eye = vec3(0, 0, 1);
  const up = vec3(0, 1, 0);
  const t = makeTrigonomy(att);
  rotFastLtoG(eye, eye, t);
  rotFastLtoG(up, up, t);
  return { eye, up };
}

function composePosAtt(local: PosAtt, parent: PosAtt): PosAtt {
  const parentAxs: Axis = { p: { ...parent.p }, a: { ...parent.a }, t: makeTrigonomy(parent.a) };
  const { eye, up } = angleToVectors(local.a);
  const worldEye = vec3(0, 0, 0);
  const worldUp = vec3(0, 0, 0);
  rotFastLtoG(worldEye, eye, parentAxs.t);
  rotFastLtoG(worldUp, up, parentAxs.t);

  const out: PosAtt = {
    p: vec3(0, 0, 0),
    a: { h: 0, p: 0, b: 0 },
  };
  convLtoG(out.p, local.p, parentAxs);
  vectorToAngle(out.a, worldEye, worldUp);
  return out;
}

function distanceSquared(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

function isFiniteVec3(value: Vec3 | null | undefined): value is Vec3 {
  return value !== null
    && value !== undefined
    && Number.isFinite(value.x)
    && Number.isFinite(value.y)
    && Number.isFinite(value.z);
}

function isValidPosAtt(value: PosAtt | null | undefined): value is PosAtt {
  return value !== null
    && value !== undefined
    && isFiniteVec3(value.p)
    && Number.isFinite(value.a.h)
    && Number.isFinite(value.a.p)
    && Number.isFinite(value.a.b);
}

function warnFieldGeometryOnce(key: string, message: string, payload: unknown): void {
  if (fieldGeometryWarnings.has(key)) return;
  fieldGeometryWarnings.add(key);
  console.warn(message, payload);
}

function composePosAttSafe(local: PosAtt | null | undefined, parent: PosAtt, label: string): PosAtt | null {
  if (!isValidPosAtt(local)) {
    warnFieldGeometryOnce(label, `[renderer] Skipping field node with invalid local transform (${label}).`, local);
    return null;
  }
  if (!isValidPosAtt(parent)) {
    warnFieldGeometryOnce(`${label}:parent`, `[renderer] Skipping field node with invalid parent transform (${label}).`, parent);
    return null;
  }
  return composePosAtt(local, parent);
}

function isWithinLod(pos: PosAtt, lodDist: number, eye: PosAtt): boolean {
  if (!isValidPosAtt(pos) || !isValidPosAtt(eye)) {
    return false;
  }
  if (!Number.isFinite(lodDist)) {
    return true;
  }
  const safeLodDist = Math.max(0, lodDist);
  return distanceSquared(pos.p, eye.p) <= safeLodDist * safeLodDist;
}

function createPrimitiveBuckets(): PrimitiveBuckets {
  return { lit: [], unlit: [], lines: [], points: [] };
}

function buildFieldSceneGeometry(field: Field, eye: PosAtt | null, lightDirection: Vec3): {
  scene: {
    lit: Float32Array;
    shadow: Float32Array;
    unlit: Float32Array;
    lines: Float32Array;
    points: Float32Array;
  };
  overlay: { unlit: Float32Array; lines: Float32Array; points: Float32Array };
} {
  const scene = createPrimitiveBuckets();
  const shadow: number[] = [];
  const overlay = createPrimitiveBuckets();
  const root: PosAtt = { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } };
  accumulateFieldGeometry(scene, shadow, overlay, field, root, eye, lightDirection);
  return {
    scene: {
      lit: new Float32Array(scene.lit),
      shadow: new Float32Array(shadow),
      unlit: new Float32Array(scene.unlit),
      lines: new Float32Array(scene.lines),
      points: new Float32Array(scene.points),
    },
    overlay: {
      unlit: new Float32Array(overlay.unlit),
      lines: new Float32Array(overlay.lines),
      points: new Float32Array(overlay.points),
    },
  };
}

function accumulateFieldGeometry(
  scene: PrimitiveBuckets,
  shadow: number[],
  overlay: PrimitiveBuckets,
  field: Field,
  fieldPos: PosAtt,
  eye: PosAtt | null,
  lightDirection: Vec3,
): void {
  for (const fsrf of field.srf) {
    const objPos = composePosAttSafe(fsrf.pos, fieldPos, `srf:${fsrf.fn}:${fsrf.id}`);
    if (objPos === null) continue;
    if (eye !== null && !isWithinLod(objPos, fsrf.lodDist, eye)) continue;
    for (const plg of fsrf.srf.polygons) {
      triangulateSrfPolygonTransformed(scene.lit, plg, fsrf.srf.vertices, objPos, eye);
    }
    triangulateSrfShadow(shadow, fsrf.srf, objPos, lightDirection);
  }

  for (const fter of field.ter) {
    const objPos = composePosAttSafe(fter.pos, fieldPos, `ter:${fter.fn}:${fter.id}`);
    if (objPos === null) continue;
    if (eye !== null && !isWithinLod(objPos, fter.lodDist, eye)) continue;
    triangulateTerrain(scene.lit, fter.ter, objPos);
  }

  for (const fplt of field.plt) {
    const objPos = composePosAttSafe(fplt.pos, fieldPos, `plt:${fplt.fn}`);
    if (objPos === null) continue;
    if (eye !== null && !isWithinLod(objPos, fplt.lodDist, eye)) continue;
    triangulatePc2(scene, fplt.pc2, objPos, 0, eye);
  }

  for (const fpc2 of field.pc2) {
    const overlayPos = composePc2OverlayPos(fpc2.pos, fieldPos);
    if (overlayPos === null) continue;
    if (eye !== null && !isWithinLod(overlayPos, fpc2.lodDist, eye)) continue;
    triangulatePc2(overlay, fpc2.pc2, overlayPos, PC2_OVERLAY_Y, eye);
  }

  for (const child of field.fld) {
    if (!child.fld) {
      warnFieldGeometryOnce(`fld:${child.fn}:missing`, `[renderer] Skipping nested field with missing payload (${child.fn}).`, child);
      continue;
    }
    const objPos = composePosAttSafe(child.pos, fieldPos, `fld:${child.fn}`);
    if (objPos === null) continue;
    if (eye !== null && !isWithinLod(objPos, child.lodDist, eye)) continue;
    accumulateFieldGeometry(scene, shadow, overlay, child.fld, objPos, eye, lightDirection);
  }
}


function composePc2OverlayPos(local: PosAtt, parent: PosAtt): PosAtt | null {
  if (!isValidPosAtt(local)) {
    warnFieldGeometryOnce('pc2:invalid-transform', '[renderer] Skipping overlay with invalid transform.', local);
    return null;
  }
  const pitched: PosAtt = {
    p: { ...local.p },
    a: { ...local.a },
  };
  pitchUp(pitched.a, pitched.a, -16384, 0);
  return composePosAttSafe(pitched, parent, 'pc2:overlay');
}

// --- Matrix Construction ---
// All matrices stored in COLUMN-MAJOR order for WebGPU/GLSL mat4.
// GLSL m[col][row] maps to Float32Array[col*4 + row].

function buildModelMatrix(pos: PosAtt): Float32Array {
  const trig = makeTrigonomy(pos.a);
  const right = vec3(0, 0, 0);
  const up = vec3(0, 0, 0);
  const forward = vec3(0, 0, 0);
  rotFastLtoG(right, vec3(1, 0, 0), trig);
  rotFastLtoG(up, vec3(0, 1, 0), trig);
  rotFastLtoG(forward, vec3(0, 0, 1), trig);
  return new Float32Array([
    right.x, right.y, right.z, 0,
    up.x, up.y, up.z, 0,
    forward.x, forward.y, forward.z, 0,
    pos.p.x, pos.p.y, pos.p.z, 1,
  ]);
}

function buildViewProjMatrix(eye: PosAtt, prj: Projection): Float32Array {
  const viewMat = buildViewMatrix(eye);
  const projMat = buildPerspectiveMatrix(prj);
  return mat4Multiply(projMat, viewMat);
}

function buildViewMatrix(eye: PosAtt): Float32Array {
  const t = makeTrigonomy(eye.a);
  const rX = vec3(0, 0, 0);
  const rY = vec3(0, 0, 0);
  const rZ = vec3(0, 0, 0);

  rotFastGtoL(rX, vec3(1, 0, 0), t);
  rotFastGtoL(rY, vec3(0, 1, 0), t);
  rotFastGtoL(rZ, vec3(0, 0, 1), t);

  const m0 = rX.x, m4 = rY.x, m8 = rZ.x;
  const m1 = rX.y, m5 = rY.y, m9 = rZ.y;
  const m2 = rX.z, m6 = rY.z, m10 = rZ.z;

  const tx = -(m0 * eye.p.x + m4 * eye.p.y + m8 * eye.p.z);
  const ty = -(m1 * eye.p.x + m5 * eye.p.y + m9 * eye.p.z);
  const tz = -(m2 * eye.p.x + m6 * eye.p.y + m10 * eye.p.z);

  return new Float32Array([
    m0, m1, m2, 0,
    m4, m5, m6, 0,
    m8, m9, m10, 0,
    tx, ty, tz, 1, // Col 3
  ]);
}

export function debugViewTransform(point: Vec3, eye: PosAtt): Vec3 {
  const view = buildViewMatrix(eye);
  return {
    x: view[0] * point.x + view[4] * point.y + view[8] * point.z + view[12],
    y: view[1] * point.x + view[5] * point.y + view[9] * point.z + view[13],
    z: view[2] * point.x + view[6] * point.y + view[10] * point.z + view[14],
  };
}

function buildPerspectiveMatrix(prj: Projection): Float32Array {
  const left = prj.cx / prj.magx;
  const right = (prj.lx - prj.cx) / prj.magx;
  const up = prj.cy / prj.magy;
  const down = (prj.ly - prj.cy) / prj.magy;
  const near = prj.nearz;
  const far = prj.farz;
  const sx = 2 / (left + right);
  const sy = 2 / (up + down);
  const ox = (left - right) / (left + right);
  const oy = (up - down) / (up + down);

  // Match the original engine's positive-Z-forward perspective in WebGPU clip space.
  return new Float32Array([
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, far / (far - near), 1,
    ox, oy, (-near * far) / (far - near), 0,
  ]);
}

function mat4Multiply(a: Float32Array, b: Float32Array): Float32Array {
  // Standard 4x4 multiply with column-major indexing
  const out = new Float32Array(16);
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      out[j * 4 + i] =
        a[i]      * b[j * 4] +
        a[4 + i]  * b[j * 4 + 1] +
        a[8 + i]  * b[j * 4 + 2] +
        a[12 + i] * b[j * 4 + 3];
    }
  }
  return out;
}
