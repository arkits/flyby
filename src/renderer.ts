// FLYBY2 — WebGPU Renderer
// Replaces the OpenGL 1.x backend

import type {
  SrfModel, SrfPolygon, SrfVertex, PosAtt, Color, Vec3,
  Field, Pc2, Pc2Object, Axis, Projection, GpuSrf, GpuField, Terrain, GpuPrimitive,
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
const PC2_OVERLAY_Y = 0.2;
const PC2_LAYER_STEP_Y = 0.01;
const SAMPLE_COUNT = 4;
const BACKDROP_DEPTH_FACTOR = 0.5;
const GROUND_SKY_PITCH_LIMIT = 14563;
const SHOW_DEBUG_GRID = false;
const POLYGON_EPSILON = 1e-5;
type FieldBufferSizeKey =
  | 'sceneLitBufferSize'
  | 'sceneUnlitBufferSize'
  | 'sceneLinesBufferSize'
  | 'scenePointsBufferSize'
  | 'overlayUnlitBufferSize'
  | 'overlayLinesBufferSize'
  | 'overlayPointsBufferSize';

const srfTriangulationCache = new WeakMap<SrfPolygon, number[]>();
const pc2TriangulationCache = new WeakMap<Pc2Object, number[]>();

export class Renderer {
  device!: GPUDevice;
  context!: GPUCanvasContext;
  format!: GPUTextureFormat;
  colorTexture!: GPUTexture;
  depthTexture!: GPUTexture;
  litPipeline!: GPURenderPipeline;
  litCulledPipeline!: GPURenderPipeline;
  smokeLitPipeline!: GPURenderPipeline;
  overlayPipeline!: GPURenderPipeline;
  overlayLinePipeline!: GPURenderPipeline;
  overlayPointPipeline!: GPURenderPipeline;
  unlitPipeline!: GPURenderPipeline;
  gridPipeline!: GPURenderPipeline;
  linePipeline!: GPURenderPipeline;
  smokeLinePipeline!: GPURenderPipeline;
  pointPipeline!: GPURenderPipeline;
  backdropPipeline!: GPURenderPipeline;
  uniformBuffer!: GPUBuffer;
  uniformBindGroup!: GPUBindGroup;

  // Pre-built geometry
  gridBuffer!: GPUBuffer;
  gridVertCount = 0;
  groundBuffer!: GPUBuffer;
  groundVertCount = 0;
  groundBufferSize = { value: 0 };
  backdropBuffer!: GPUBuffer;
  backdropVertCount = 0;
  backdropBufferSize = { value: 0 };

  // Reusable smoke buffers (to prevent memory leak)
  smokeBuffer!: GPUBuffer;
  smokeBufferSize = { value: 0 };
  vaporBuffer!: GPUBuffer;
  vaporBufferSize = { value: 0 };
  aircraftOneSidedBuffer!: GPUBuffer;
  aircraftOneSidedBufferSize = { value: 0 };
  aircraftOneSidedVertCount = 0;
  aircraftTwoSidedBuffer!: GPUBuffer;
  aircraftTwoSidedBufferSize = { value: 0 };
  aircraftTwoSidedVertCount = 0;

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

    // Uniform buffer: mat4 viewProj(64) + mat4 model(64) + vec3 lightPos(12+4pad) + vec3 camPos(12+4pad) = 160
    this.uniformBuffer = this.device.createBuffer({
      size: 160,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      }],
    });

    this.uniformBindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{
        binding: 0,
        resource: { buffer: this.uniformBuffer },
      }],
    });

    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
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
        entryPoint: 'fsLit',
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
        entryPoint: 'fsSmokeUnlit',
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
        entryPoint: 'fsUnlit',
        targets: [{ format: this.format }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      multisample: { count: SAMPLE_COUNT },
      depthStencil: {
        // Field PC2 overlays are drawn as underlays in the original engine.
        depthWriteEnabled: false,
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
        entryPoint: 'fsUnlit',
        targets: [{ format: this.format }],
      },
      primitive: { topology: 'line-list', cullMode: 'none' },
      multisample: { count: SAMPLE_COUNT },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: 'less-equal',
        depthBias: -32,
        depthBiasSlopeScale: -1,
        depthBiasClamp: 0,
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
        entryPoint: 'fsUnlit',
        targets: [{ format: this.format }],
      },
      primitive: { topology: 'point-list', cullMode: 'none' },
      multisample: { count: SAMPLE_COUNT },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: 'less-equal',
        depthBias: -32,
        depthBiasSlopeScale: -1,
        depthBiasClamp: 0,
        format: 'depth24plus',
      },
    });

    this.backdropPipeline = this.device.createRenderPipeline({
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
    this.backdropBuffer = this.createBuffer(new Float32Array([0, 0, 0, 0, 0, 0]));
    this.aircraftOneSidedBuffer = this.createBuffer(new Float32Array([0, 0, 0, 0]));
    this.aircraftTwoSidedBuffer = this.createBuffer(new Float32Array([0, 0, 0, 0]));
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
      size: data.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(buf, 0, data as Float32Array<ArrayBuffer>);
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
      size: byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(buf, 0, data as Float32Array<ArrayBuffer>);
    sizePtr.value = byteLength;
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

  buildFieldGpuBuffer(_field: Field): GpuField {
    return {
      sceneLit: this.createPrimitive(new Float32Array([0, 0, 0, 0]), LIT_STRIDE),
      sceneUnlit: this.createPrimitive(new Float32Array([0, 0, 0, 0]), UNLIT_STRIDE),
      sceneLines: this.createPrimitive(new Float32Array([0, 0, 0, 0]), UNLIT_STRIDE),
      scenePoints: this.createPrimitive(new Float32Array([0, 0, 0, 0]), UNLIT_STRIDE),
      overlayUnlit: this.createPrimitive(new Float32Array([0, 0, 0, 0]), UNLIT_STRIDE),
      overlayLines: this.createPrimitive(new Float32Array([0, 0, 0, 0]), UNLIT_STRIDE),
      overlayPoints: this.createPrimitive(new Float32Array([0, 0, 0, 0]), UNLIT_STRIDE),
      sceneLitBufferSize: 16,
      sceneUnlitBufferSize: 16,
      sceneLinesBufferSize: 16,
      scenePointsBufferSize: 16,
      overlayUnlitBufferSize: 16,
      overlayLinesBufferSize: 16,
      overlayPointsBufferSize: 16,
    };
  }

  private createPrimitive(data: Float32Array, stride: number): GpuPrimitive {
    return {
      buffer: this.createBuffer(data),
      vertexCount: Math.floor(data.length / stride),
    };
  }

  private syncPrimitive(
    primitive: GpuPrimitive,
    data: Float32Array,
    stride: number,
    name: string,
    sizeKey: FieldBufferSizeKey,
    owner: GpuField,
  ): void {
    if (data.length > 0) {
      primitive.buffer = this.updateOrCreateBuffer(
        data,
        primitive.buffer,
        { value: owner[sizeKey] },
        name,
      );
      owner[sizeKey] = Math.max(owner[sizeKey], data.byteLength);
      primitive.vertexCount = data.length / stride;
    } else {
      primitive.vertexCount = 0;
    }
  }

  // --- Uniform Updates ---

  private writeUniforms(viewProj: Float32Array, model: Float32Array, lightPos: Vec3, camPos: Vec3): void {
    const data = new Float32Array(40);
    data.set(viewProj, 0);         // 0..15
    data.set(model, 16);           // 16..31
    data[32] = lightPos.x;         // 32..34 light
    data[33] = lightPos.y;
    data[34] = lightPos.z;
    data[35] = 0;
    data[36] = camPos.x;           // 36..38 camera
    data[37] = camPos.y;
    data[38] = camPos.z;
    data[39] = 0;
    this.device.queue.writeBuffer(this.uniformBuffer, 0, data);
  }

  // --- Drawing ---

  beginFrame(_skyColor: Color): void {
    // clearScreen handled in endFrame via render pass
  }

  render(
    eye: PosAtt,
    cameraZoom: number,
    skyColor: Color,
    groundColor: Color,
    field: Field,
    fieldGpu: GpuField,
    aircraftModel: SrfModel,
    aircraftPos: PosAtt,
    smokeGeometry: { lit: Float32Array; lines: Float32Array },
    vaporGeometry: { lit: Float32Array; lines: Float32Array },
  ): void {
    const prj = getStdProjection(this.width, this.height);
    prj.magx *= 2 * cameraZoom;
    prj.magy *= 2 * cameraZoom;
    const viewProj = buildViewProjMatrix(eye, prj);
    const identity = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    const lightPos: Vec3 = { x: eye.p.x, y: eye.p.y + 1000, z: eye.p.z };
    const camPos = eye.p;

    const commandEncoder = this.device.createCommandEncoder();
    const textureView = this.context.getCurrentTexture().createView();
    const fieldScene = buildFieldSceneGeometry(field, eye);
    const aircraftVerts = buildAircraftGeometry(aircraftModel, aircraftPos);
    const groundPlaneVerts = buildGroundPlaneGeometry(eye, groundColor);
    const backdropVerts = buildGroundSkyGeometry(this.width, this.height, eye, prj, groundColor, skyColor);
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
    if (backdropVerts.length > 0) {
      this.backdropBuffer = this.updateOrCreateBuffer(
        backdropVerts,
        this.backdropBuffer,
        this.backdropBufferSize,
        'backdrop',
      );
      this.backdropVertCount = backdropVerts.length / UNLIT_STRIDE;
    } else {
      this.backdropVertCount = 0;
    }
    if (aircraftVerts.oneSided.length > 0) {
      this.aircraftOneSidedBuffer = this.updateOrCreateBuffer(
        aircraftVerts.oneSided,
        this.aircraftOneSidedBuffer,
        this.aircraftOneSidedBufferSize,
        'aircraft-one-sided',
      );
      this.aircraftOneSidedVertCount = aircraftVerts.oneSided.length / LIT_STRIDE;
    } else {
      this.aircraftOneSidedVertCount = 0;
    }
    if (aircraftVerts.twoSided.length > 0) {
      this.aircraftTwoSidedBuffer = this.updateOrCreateBuffer(
        aircraftVerts.twoSided,
        this.aircraftTwoSidedBuffer,
        this.aircraftTwoSidedBufferSize,
        'aircraft-two-sided',
      );
      this.aircraftTwoSidedVertCount = aircraftVerts.twoSided.length / LIT_STRIDE;
    } else {
      this.aircraftTwoSidedVertCount = 0;
    }
    this.syncPrimitive(fieldGpu.sceneLit, fieldScene.scene.lit, LIT_STRIDE, 'field-scene-lit', 'sceneLitBufferSize', fieldGpu);
    this.syncPrimitive(fieldGpu.sceneUnlit, fieldScene.scene.unlit, UNLIT_STRIDE, 'field-scene-unlit', 'sceneUnlitBufferSize', fieldGpu);
    this.syncPrimitive(fieldGpu.sceneLines, fieldScene.scene.lines, UNLIT_STRIDE, 'field-scene-lines', 'sceneLinesBufferSize', fieldGpu);
    this.syncPrimitive(fieldGpu.scenePoints, fieldScene.scene.points, UNLIT_STRIDE, 'field-scene-points', 'scenePointsBufferSize', fieldGpu);
    this.syncPrimitive(fieldGpu.overlayUnlit, fieldScene.overlay.unlit, UNLIT_STRIDE, 'field-overlay-unlit', 'overlayUnlitBufferSize', fieldGpu);
    this.syncPrimitive(fieldGpu.overlayLines, fieldScene.overlay.lines, UNLIT_STRIDE, 'field-overlay-lines', 'overlayLinesBufferSize', fieldGpu);
    this.syncPrimitive(fieldGpu.overlayPoints, fieldScene.overlay.points, UNLIT_STRIDE, 'field-overlay-points', 'overlayPointsBufferSize', fieldGpu);

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: this.colorTexture.createView(),
        resolveTarget: textureView,
        clearValue: { r: skyColor.r, g: skyColor.g, b: skyColor.b, a: 1 },
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

    if (this.backdropVertCount > 0) {
      this.writeUniforms(viewProj, identity, lightPos, camPos);
      passEncoder.setBindGroup(0, this.uniformBindGroup);
      passEncoder.setPipeline(this.backdropPipeline);
      passEncoder.setVertexBuffer(0, this.backdropBuffer);
      passEncoder.draw(this.backdropVertCount);
    }

    if (this.groundVertCount > 0) {
      this.writeUniforms(viewProj, identity, lightPos, camPos);
      passEncoder.setBindGroup(0, this.uniformBindGroup);
      passEncoder.setPipeline(this.unlitPipeline);
      passEncoder.setVertexBuffer(0, this.groundBuffer);
      passEncoder.draw(this.groundVertCount);
    }

    // --- Draw field overlays before inserted scene objects ---
    if (fieldGpu.overlayUnlit.vertexCount > 0) {
      this.writeUniforms(viewProj, identity, lightPos, camPos);
      passEncoder.setPipeline(this.overlayPipeline);
      passEncoder.setBindGroup(0, this.uniformBindGroup);
      passEncoder.setVertexBuffer(0, fieldGpu.overlayUnlit.buffer);
      passEncoder.draw(fieldGpu.overlayUnlit.vertexCount);
    }
    if (fieldGpu.overlayLines.vertexCount > 0) {
      this.writeUniforms(viewProj, identity, lightPos, camPos);
      passEncoder.setPipeline(this.overlayLinePipeline);
      passEncoder.setBindGroup(0, this.uniformBindGroup);
      passEncoder.setVertexBuffer(0, fieldGpu.overlayLines.buffer);
      passEncoder.draw(fieldGpu.overlayLines.vertexCount);
    }
    if (fieldGpu.overlayPoints.vertexCount > 0) {
      this.writeUniforms(viewProj, identity, lightPos, camPos);
      passEncoder.setPipeline(this.overlayPointPipeline);
      passEncoder.setBindGroup(0, this.uniformBindGroup);
      passEncoder.setVertexBuffer(0, fieldGpu.overlayPoints.buffer);
      passEncoder.draw(fieldGpu.overlayPoints.vertexCount);
    }

    // --- Draw grid (lines) ---
    if (SHOW_DEBUG_GRID) {
      this.writeUniforms(viewProj, identity, lightPos, camPos);
      passEncoder.setBindGroup(0, this.uniformBindGroup);
      passEncoder.setPipeline(this.gridPipeline);
      passEncoder.setVertexBuffer(0, this.gridBuffer);
      passEncoder.draw(this.gridVertCount);
    }

    // --- Draw field objects (lit) ---
    if (fieldGpu.sceneUnlit.vertexCount > 0) {
      this.writeUniforms(viewProj, identity, lightPos, camPos);
      passEncoder.setPipeline(this.unlitPipeline);
      passEncoder.setBindGroup(0, this.uniformBindGroup);
      passEncoder.setVertexBuffer(0, fieldGpu.sceneUnlit.buffer);
      passEncoder.draw(fieldGpu.sceneUnlit.vertexCount);
    }
    if (fieldGpu.sceneLines.vertexCount > 0) {
      this.writeUniforms(viewProj, identity, lightPos, camPos);
      passEncoder.setPipeline(this.linePipeline);
      passEncoder.setBindGroup(0, this.uniformBindGroup);
      passEncoder.setVertexBuffer(0, fieldGpu.sceneLines.buffer);
      passEncoder.draw(fieldGpu.sceneLines.vertexCount);
    }
    if (fieldGpu.scenePoints.vertexCount > 0) {
      this.writeUniforms(viewProj, identity, lightPos, camPos);
      passEncoder.setPipeline(this.pointPipeline);
      passEncoder.setBindGroup(0, this.uniformBindGroup);
      passEncoder.setVertexBuffer(0, fieldGpu.scenePoints.buffer);
      passEncoder.draw(fieldGpu.scenePoints.vertexCount);
    }
    if (fieldGpu.sceneLit.vertexCount > 0) {
      this.writeUniforms(viewProj, identity, lightPos, camPos);
      passEncoder.setPipeline(this.litPipeline);
      passEncoder.setBindGroup(0, this.uniformBindGroup);
      passEncoder.setVertexBuffer(0, fieldGpu.sceneLit.buffer);
      passEncoder.draw(fieldGpu.sceneLit.vertexCount);
    }

    // --- Draw aircraft (lit) ---
    if (this.aircraftTwoSidedVertCount > 0) {
      this.writeUniforms(viewProj, identity, lightPos, camPos);
      passEncoder.setPipeline(this.litPipeline);
      passEncoder.setBindGroup(0, this.uniformBindGroup);
      passEncoder.setVertexBuffer(0, this.aircraftTwoSidedBuffer);
      passEncoder.draw(this.aircraftTwoSidedVertCount);
    }
    if (this.aircraftOneSidedVertCount > 0) {
      this.writeUniforms(viewProj, identity, lightPos, camPos);
      passEncoder.setPipeline(this.litCulledPipeline);
      passEncoder.setBindGroup(0, this.uniformBindGroup);
      passEncoder.setVertexBuffer(0, this.aircraftOneSidedBuffer);
      passEncoder.draw(this.aircraftOneSidedVertCount);
    }

    // --- Draw smoke ---
    if (smokeGeometry.lit.length > 0) {
      this.smokeBuffer = this.updateOrCreateBuffer(
        smokeGeometry.lit,
        this.smokeBuffer,
        this.smokeBufferSize,
        'smoke',
      );
      this.writeUniforms(viewProj, identity, lightPos, camPos);
      passEncoder.setPipeline(this.smokeLitPipeline);
      passEncoder.setBindGroup(0, this.uniformBindGroup);
      passEncoder.setVertexBuffer(0, this.smokeBuffer);
      passEncoder.draw(smokeGeometry.lit.length / LIT_STRIDE);
    }

    if (smokeGeometry.lines.length > 0) {
      this.vaporBuffer = this.updateOrCreateBuffer(
        smokeGeometry.lines,
        this.vaporBuffer,
        this.vaporBufferSize,
        'smoke-lines',
      );
      this.writeUniforms(viewProj, identity, lightPos, camPos);
      passEncoder.setPipeline(this.smokeLinePipeline);
      passEncoder.setBindGroup(0, this.uniformBindGroup);
      passEncoder.setVertexBuffer(0, this.vaporBuffer);
      passEncoder.draw(smokeGeometry.lines.length / UNLIT_STRIDE);
    }

    if (vaporGeometry.lit.length > 0) {
      this.vaporBuffer = this.updateOrCreateBuffer(
        vaporGeometry.lit,
        this.vaporBuffer,
        this.vaporBufferSize,
        'vapor',
      );
      this.writeUniforms(viewProj, identity, lightPos, camPos);
      passEncoder.setPipeline(this.smokeLitPipeline);
      passEncoder.setBindGroup(0, this.uniformBindGroup);
      passEncoder.setVertexBuffer(0, this.vaporBuffer);
      passEncoder.draw(vaporGeometry.lit.length / LIT_STRIDE);
    }

    if (vaporGeometry.lines.length > 0) {
      this.vaporBuffer = this.updateOrCreateBuffer(
        vaporGeometry.lines,
        this.vaporBuffer,
        this.vaporBufferSize,
        'vapor-lines',
      );
      this.writeUniforms(viewProj, identity, lightPos, camPos);
      passEncoder.setPipeline(this.smokeLinePipeline);
      passEncoder.setBindGroup(0, this.uniformBindGroup);
      passEncoder.setVertexBuffer(0, this.vaporBuffer);
      passEncoder.draw(vaporGeometry.lines.length / UNLIT_STRIDE);
    }

    passEncoder.end();
    this.device.queue.submit([commandEncoder.finish()]);
  }
}

// --- Geometry Helpers ---

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

function buildGroundSkyGeometry(
  width: number,
  height: number,
  eye: PosAtt,
  prj: Projection,
  groundColor: Color,
  _skyColor: Color,
): Float32Array {
  const verts: number[] = [];
  if (width <= 0 || height <= 0) {
    return new Float32Array(verts);
  }
  const eyeAxs: Axis = { p: { ...eye.p }, a: { ...eye.a }, t: makeTrigonomy(eye.a) };

  if (eye.a.p > GROUND_SKY_PITCH_LIMIT) {
    return new Float32Array(verts);
  }
  if (eye.a.p < -GROUND_SKY_PITCH_LIMIT) {
    pushScreenQuad(verts, prj, eyeAxs, width, height, groundColor);
    return new Float32Array(verts);
  }

  const horizon = horizonLineScreenPoints(prj, eye);
  const clipped = clipLineToScreen(horizon[0], horizon[1], width, height);
  if (clipped === null) {
    if (eye.a.p <= 0) {
      pushScreenQuad(verts, prj, eyeAxs, width, height, groundColor);
    }
    return new Float32Array(verts);
  }

  const screenRect: ScreenVertex[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  const groundReference = { x: width * 0.5, y: height - 1 };
  const groundArea = clipPolygonByLine(screenRect, clipped[0], clipped[1], groundReference);
  pushScreenPolygon(verts, prj, eyeAxs, groundArea, groundColor);
  return new Float32Array(verts);
}

function buildGroundPlaneGeometry(eye: PosAtt, groundColor: Color): Float32Array {
  const span = 6000;
  const centerX = Math.round(eye.p.x / 1000) * 1000;
  const centerZ = Math.round(eye.p.z / 1000) * 1000;
  const y = -0.05;
  const p0 = vec3(centerX - span, y, centerZ - span);
  const p1 = vec3(centerX + span, y, centerZ - span);
  const p2 = vec3(centerX + span, y, centerZ + span);
  const p3 = vec3(centerX - span, y, centerZ + span);
  const verts: number[] = [];
  pushUnlitTri(verts, p0, p1, p2, groundColor);
  pushUnlitTri(verts, p0, p2, p3, groundColor);
  return new Float32Array(verts);
}

type ScreenVertex = { x: number; y: number };

function angle16ToRadians(angle: number): number {
  return angle * Math.PI / 32768.0;
}

function rotate2d(point: ScreenVertex, radians: number): ScreenVertex {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return {
    x: c * point.x - s * point.y,
    y: s * point.x + c * point.y,
  };
}

function screenToBackdropWorld(prj: Projection, eyeAxs: Axis, p: ScreenVertex): Vec3 {
  const depth = prj.farz * BACKDROP_DEPTH_FACTOR;
  const local = vec3(
    ((p.x - prj.cx) * depth) / prj.magx,
    ((prj.cy - p.y) * depth) / prj.magy,
    depth,
  );
  const world = vec3(0, 0, 0);
  convLtoG(world, local, eyeAxs);
  return world;
}

function snapToScreenBoundary(value: number, max: number): number {
  const eps = 1e-4;
  if (Math.abs(value) < eps) return 0;
  if (Math.abs(value - max) < eps) return max;
  return value;
}

function pushScreenTri(
  verts: number[],
  prj: Projection,
  eyeAxs: Axis,
  p0: ScreenVertex,
  p1: ScreenVertex,
  p2: ScreenVertex,
  color: Color,
): void {
  pushUnlitTri(
    verts,
    screenToBackdropWorld(prj, eyeAxs, p0),
    screenToBackdropWorld(prj, eyeAxs, p1),
    screenToBackdropWorld(prj, eyeAxs, p2),
    color,
  );
}

function pushScreenPolygon(
  verts: number[],
  prj: Projection,
  eyeAxs: Axis,
  polygon: ScreenVertex[],
  color: Color,
): void {
  if (polygon.length < 3) return;
  for (let i = 1; i < polygon.length - 1; i++) {
    pushScreenTri(verts, prj, eyeAxs, polygon[0], polygon[i], polygon[i + 1], color);
  }
}

function pushScreenQuad(
  verts: number[],
  prj: Projection,
  eyeAxs: Axis,
  width: number,
  height: number,
  color: Color,
): void {
  pushScreenPolygon(verts, prj, eyeAxs, [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ], color);
}

function horizonLineScreenPoints(prj: Projection, eye: PosAtt): [ScreenVertex, ScreenVertex] {
  const pitchTan = Math.tan(angle16ToRadians(eye.a.p));
  const centerVector = rotate2d(
    { x: 0, y: -prj.magy * pitchTan },
    -angle16ToRadians(eye.a.b),
  );
  const center = {
    x: prj.cx + centerVector.x,
    y: prj.cy - centerVector.y,
  };

  const leftVectorRotated = rotate2d({ x: 16384, y: 0 }, -angle16ToRadians(eye.a.b));
  const leftVector = {
    x: leftVectorRotated.x,
    y: -leftVectorRotated.y,
  };

  return [
    { x: center.x - leftVector.x, y: center.y - leftVector.y },
    { x: center.x + leftVector.x, y: center.y + leftVector.y },
  ];
}

function clipLineToScreen(
  start: ScreenVertex,
  end: ScreenVertex,
  width: number,
  height: number,
): [ScreenVertex, ScreenVertex] | null {
  const clipMin = { x: 0, y: 0 };
  const clipMax = { x: width, y: height };
  let x0 = start.x;
  let y0 = start.y;
  let x1 = end.x;
  let y1 = end.y;

  const computeOutCode = (x: number, y: number): number => {
    let code = 0;
    if (x < clipMin.x) code |= 1;
    else if (x > clipMax.x) code |= 2;
    if (y < clipMin.y) code |= 4;
    else if (y > clipMax.y) code |= 8;
    return code;
  };

  let out0 = computeOutCode(x0, y0);
  let out1 = computeOutCode(x1, y1);
  while (true) {
    if ((out0 | out1) === 0) {
      return [
        { x: snapToScreenBoundary(x0, width), y: snapToScreenBoundary(y0, height) },
        { x: snapToScreenBoundary(x1, width), y: snapToScreenBoundary(y1, height) },
      ];
    }
    if ((out0 & out1) !== 0) {
      return null;
    }

    const outCode = out0 !== 0 ? out0 : out1;
    let x = 0;
    let y = 0;

    if ((outCode & 8) !== 0) {
      x = x0 + ((x1 - x0) * (clipMax.y - y0)) / (y1 - y0);
      y = clipMax.y;
    } else if ((outCode & 4) !== 0) {
      x = x0 + ((x1 - x0) * (clipMin.y - y0)) / (y1 - y0);
      y = clipMin.y;
    } else if ((outCode & 2) !== 0) {
      y = y0 + ((y1 - y0) * (clipMax.x - x0)) / (x1 - x0);
      x = clipMax.x;
    } else {
      y = y0 + ((y1 - y0) * (clipMin.x - x0)) / (x1 - x0);
      x = clipMin.x;
    }

    if (outCode === out0) {
      x0 = x;
      y0 = y;
      out0 = computeOutCode(x0, y0);
    } else {
      x1 = x;
      y1 = y;
      out1 = computeOutCode(x1, y1);
    }
  }
}

function lineSide(point: ScreenVertex, lineStart: ScreenVertex, lineEnd: ScreenVertex): number {
  return (
    (lineEnd.x - lineStart.x) * (point.y - lineStart.y)
    - (lineEnd.y - lineStart.y) * (point.x - lineStart.x)
  );
}

function intersectSegmentWithLine(
  a: ScreenVertex,
  b: ScreenVertex,
  lineStart: ScreenVertex,
  lineEnd: ScreenVertex,
): ScreenVertex {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const ldx = lineEnd.x - lineStart.x;
  const ldy = lineEnd.y - lineStart.y;
  const denom = abx * ldy - aby * ldx;
  if (Math.abs(denom) < 1e-6) {
    return { ...b };
  }
  const t = ((lineStart.x - a.x) * ldy - (lineStart.y - a.y) * ldx) / denom;
  return {
    x: a.x + abx * t,
    y: a.y + aby * t,
  };
}

function clipPolygonByLine(
  polygon: ScreenVertex[],
  lineStart: ScreenVertex,
  lineEnd: ScreenVertex,
  referencePoint: ScreenVertex,
): ScreenVertex[] {
  const result: ScreenVertex[] = [];
  if (polygon.length === 0) return result;
  const referenceSide = lineSide(referencePoint, lineStart, lineEnd);

  const inside = (point: ScreenVertex): boolean => {
    const side = lineSide(point, lineStart, lineEnd);
    if (referenceSide >= 0) {
      return side >= -1e-4;
    }
    return side <= 1e-4;
  };

  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    const currentInside = inside(current);
    const nextInside = inside(next);

    if (currentInside && nextInside) {
      result.push({ ...next });
    } else if (currentInside && !nextInside) {
      result.push(intersectSegmentWithLine(current, next, lineStart, lineEnd));
    } else if (!currentInside && nextInside) {
      result.push(intersectSegmentWithLine(current, next, lineStart, lineEnd));
      result.push({ ...next });
    }
  }

  return result;
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
  eye: PosAtt,
): void {
  if (plg.nVt < 3) return;

  const axs: Axis = { p: { ...pos.p }, a: { ...pos.a }, t: makeTrigonomy(pos.a) };
  const worldCenter = vec3(0, 0, 0);
  const faceNormal = vec3(0, 0, 0);
  convLtoG(worldCenter, plg.center, axs);
  rotFastLtoG(faceNormal, plg.normal, axs.t);
  const faceDot = (
    (worldCenter.x - eye.p.x) * faceNormal.x
    + (worldCenter.y - eye.p.y) * faceNormal.y
    + (worldCenter.z - eye.p.z) * faceNormal.z
  );
  if (plg.backFaceRemove !== 0 && faceDot > 0) {
    return;
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

function triangulateSrfPolygonWorld(
  oneSidedVerts: number[],
  twoSidedVerts: number[],
  plg: SrfPolygon,
  vertices: SrfVertex[],
  pos: PosAtt,
): void {
  if (plg.nVt < 3) return;

  const dst = plg.backFaceRemove ? oneSidedVerts : twoSidedVerts;
  const axs: Axis = { p: { ...pos.p }, a: { ...pos.a }, t: makeTrigonomy(pos.a) };
  const faceNormal = vec3(0, 0, 0);
  rotFastLtoG(faceNormal, plg.normal, axs.t);

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
      pushLitVert(dst, worldPos, worldNormal, faceNormal, plg.color, plg.bright);
    }
  }
}

function buildAircraftGeometry(model: SrfModel, pos: PosAtt): { oneSided: Float32Array; twoSided: Float32Array } {
  const oneSidedVerts: number[] = [];
  const twoSidedVerts: number[] = [];
  for (const plg of model.polygons) {
    triangulateSrfPolygonWorld(oneSidedVerts, twoSidedVerts, plg, model.vertices, pos);
  }
  return {
    oneSided: new Float32Array(oneSidedVerts),
    twoSided: new Float32Array(twoSidedVerts),
  };
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
  eye: PosAtt,
): void {
  const axs: Axis = { p: { ...pos.p }, a: { ...pos.a }, t: makeTrigonomy(pos.a) };
  const eyeAxs: Axis = { p: { ...eye.p }, a: { ...eye.a }, t: makeTrigonomy(eye.a) };
  for (let objectIndex = 0; objectIndex < pc2.objects.length; objectIndex++) {
    const obj = pc2.objects[objectIndex];
    if (!isPc2ObjectVisible(obj, axs, eyeAxs, layerBase + objectIndex * PC2_LAYER_STEP_Y)) {
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

function isWithinLod(pos: PosAtt, lodDist: number, eye: PosAtt): boolean {
  return distanceSquared(pos.p, eye.p) <= lodDist * lodDist;
}

function createPrimitiveBuckets(): PrimitiveBuckets {
  return { lit: [], unlit: [], lines: [], points: [] };
}

function buildFieldSceneGeometry(field: Field, eye: PosAtt): {
  scene: { lit: Float32Array; unlit: Float32Array; lines: Float32Array; points: Float32Array };
  overlay: { unlit: Float32Array; lines: Float32Array; points: Float32Array };
} {
  const scene = createPrimitiveBuckets();
  const overlay = createPrimitiveBuckets();
  const root: PosAtt = { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } };
  accumulateFieldGeometry(scene, overlay, field, root, eye);
  return {
    scene: {
      lit: new Float32Array(scene.lit),
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
  overlay: PrimitiveBuckets,
  field: Field,
  fieldPos: PosAtt,
  eye: PosAtt,
): void {
  for (const fsrf of field.srf) {
    const objPos = composePosAtt(fsrf.pos, fieldPos);
    if (!isWithinLod(objPos, fsrf.lodDist, eye)) continue;
    for (const plg of fsrf.srf.polygons) {
      triangulateSrfPolygonTransformed(scene.lit, plg, fsrf.srf.vertices, objPos, eye);
    }
  }

  for (const fter of field.ter) {
    const objPos = composePosAtt(fter.pos, fieldPos);
    if (!isWithinLod(objPos, fter.lodDist, eye)) continue;
    triangulateTerrain(scene.lit, fter.ter, objPos);
  }

  for (const fplt of field.plt) {
    const objPos = composePosAtt(fplt.pos, fieldPos);
    if (!isWithinLod(objPos, fplt.lodDist, eye)) continue;
    triangulatePc2(scene, fplt.pc2, objPos, 0, eye);
  }

  for (const fpc2 of field.pc2) {
    const overlayPos = composePc2OverlayPos(fpc2.pos, fieldPos);
    if (!isWithinLod(overlayPos, fpc2.lodDist, eye)) continue;
    triangulatePc2(overlay, fpc2.pc2, overlayPos, PC2_OVERLAY_Y, eye);
  }

  for (const child of field.fld) {
    const objPos = composePosAtt(child.pos, fieldPos);
    if (!isWithinLod(objPos, child.lodDist, eye)) continue;
    accumulateFieldGeometry(scene, overlay, child.fld, objPos, eye);
  }
}


function composePc2OverlayPos(local: PosAtt, parent: PosAtt): PosAtt {
  const pitched: PosAtt = {
    p: { ...local.p },
    a: { ...local.a },
  };
  pitchUp(pitched.a, pitched.a, -16384, 0);
  return composePosAtt(pitched, parent);
}

// --- Matrix Construction ---
// All matrices stored in COLUMN-MAJOR order for WebGPU/GLSL mat4.
// GLSL m[col][row] maps to Float32Array[col*4 + row].

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
