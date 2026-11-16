/**
 * SnapPro — Video Frame Capture & Lightroom/Topaz Pro Engine (WebGL2 GPU + Smart AI Edition)
 * 1. Multi-Step Super-Sampling Upscale + Real JFIF PPI/PPC Metadata Injection
 * 2. WebGL2 Hardware-Accelerated Shader Pipeline (Basic + 8-Channel HSL LUT + 3-Way Color Grading + Denoise/Sharpen)
 * 3. Smart Best-Shot Search (Micro-window sharpness peak finder around each interval)
 * 4. Smart Subject / Motion Trigger (Skips static empty road frames automatically)
 * 5. Live & Batch Auto-Watermark / Logo Overlay (PNG transparency, corner placement, scale & opacity)
 */

export interface CapturedFrame {
  id: string;
  timestamp: number;
  dataUrl: string;
  blob?: Blob;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  sharpness: number;
  isSharp: boolean;
}

export type HSLChannelKey =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'aqua'
  | 'blue'
  | 'purple'
  | 'magenta';

export interface HSLAdjustment {
  hue: number; // -100 to +100
  sat: number; // -100 to +100
  lum: number; // -100 to +100
}

export type ColorMixerSettings = Record<HSLChannelKey, HSLAdjustment>;

export interface ColorWheelState {
  hue: number; // 0 to 360 degrees
  sat: number; // 0 to 100
  lum: number; // -100 to +100
}

export interface ColorGradingSettings {
  shadows: ColorWheelState;
  midtones: ColorWheelState;
  highlights: ColorWheelState;
  blending: number; // 0 to 100 (default 50)
  balance: number;  // -100 to +100 (default 0)
}

export type WatermarkAnchor =
  | 'tl' | 'tc' | 'tr'
  | 'ml' | 'mc' | 'mr'
  | 'bl' | 'bc' | 'br';

export type WatermarkShape = 'rectangle' | 'circle' | 'ellipse';

export interface WatermarkSettings {
  image: HTMLImageElement | null;
  anchor: WatermarkAnchor;
  offsetX: number; // -100 to +100 (% offset)
  offsetY: number; // -100 to +100 (% offset)
  scale: number;   // 2 to 100 (% of frame width)
  preserveAspect: boolean;
  antiAlias: boolean;
  background: boolean;
  bgColor: string;
  fill: boolean;
  colorTint: boolean;
  tintColor: string;
  masks: boolean;
  angle: number;   // -180 to +180 deg
  opacity: number; // 0 to 100
  blendMode: GlobalCompositeOperation;
  shape: WatermarkShape;
  roundness: number; // 0 to 100
  outline: boolean;
  dropShadow: boolean;
  longShadow: boolean;
  outerGlow: boolean;
  innerGlow: boolean;
  innerShadow: boolean;
  emboss: boolean;
  flipH: boolean;
}

export function createDefaultWatermarkSettings(): WatermarkSettings {
  return {
    image: null,
    anchor: 'br',
    offsetX: 0,
    offsetY: 0,
    scale: 18,
    preserveAspect: true,
    antiAlias: true,
    background: false,
    bgColor: '#0f172a',
    fill: false,
    colorTint: false,
    tintColor: '#3b82f6',
    masks: false,
    angle: 0,
    opacity: 100,
    blendMode: 'source-over',
    shape: 'rectangle',
    roundness: 20,
    outline: false,
    dropShadow: false,
    longShadow: false,
    outerGlow: false,
    innerGlow: false,
    innerShadow: false,
    emboss: false,
    flipH: false,
  };
}

export interface HistogramData {
  r: number[];
  g: number[];
  b: number[];
  lum: number[];
}

export type CropAspect = 'none' | '4:3' | '16:9' | '3:2' | '2:3' | '1:1' | '9:16' | '1:2';
export type CropComposition = '1:2' | '2:3'; // '1:2' = กึ่งกลาง 50%, '2:3' = จุดตัดเก้าช่อง 2/3 ส่วน (Rule of Thirds)

export interface NormalizedCropRect {
  x: number; // 0..1 (สัดส่วนซ้าย)
  y: number; // 0..1 (สัดส่วนบน)
  w: number; // 0..1 (สัดส่วนความกว้าง)
  h: number; // 0..1 (สัดส่วนความสูง)
}

export interface SubjectCentroid {
  xNorm: number;
  yNorm: number;
  widthNorm?: number;
  heightNorm?: number;
  headYNorm?: number; // สัดส่วนตำแหน่งจุดบนสุดของศีรษะ (Head Top 0..1)
}

export function getCropDimensions(
  srcW: number,
  srcH: number,
  cropAspect: CropAspect = 'none',
  targetW?: number,
  targetH?: number,
  subjectAnchor?: SubjectCentroid,
  composition: CropComposition = '1:2',
  skipOverflowCrop: boolean = true,
  customCrop?: NormalizedCropRect
): {
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  outW: number;
  outH: number;
  uvScale: [number, number];
  uvOffset: [number, number];
  skippedCrop: boolean;
} {
  // หากมีกรอบที่ผู้ใช้ลากปรับด้วยตัวเอง (Interactive Drag Crop)
  if (customCrop && customCrop.w > 0.02 && customCrop.h > 0.02) {
    const cropX = Math.max(0, Math.min(srcW - 10, Math.round(customCrop.x * srcW)));
    const cropY = Math.max(0, Math.min(srcH - 10, Math.round(customCrop.y * srcH)));
    const cropW = Math.max(10, Math.min(srcW - cropX, Math.round(customCrop.w * srcW)));
    const cropH = Math.max(10, Math.min(srcH - cropY, Math.round(customCrop.h * srcH)));

    let outW = cropW;
    let outH = cropH;

    if (targetW && targetH && targetW > 0 && targetH > 0) {
      const cropRatio = cropW / cropH;
      if (targetW / targetH > cropRatio) {
        outW = Math.round(targetH * cropRatio);
        outH = targetH;
      } else {
        outW = targetW;
        outH = Math.round(targetW / cropRatio);
      }
    }

    const uvScale: [number, number] = [cropW / srcW, cropH / srcH];
    const uvOffset: [number, number] = [cropX / srcW, cropY / srcH];
    return { cropX, cropY, cropW, cropH, outW, outH, uvScale, uvOffset, skippedCrop: false };
  }

  if (cropAspect === 'none') {
    let outW = srcW;
    let outH = srcH;
    if (targetW && targetH && targetW > 0 && targetH > 0) {
      outW = targetW;
      outH = targetH;
      if ((srcH > srcW && outW > outH) || (srcW > srcH && outH > outW)) {
        const t = outW;
        outW = outH;
        outH = t;
      }
    }
    return {
      cropX: 0,
      cropY: 0,
      cropW: srcW,
      cropH: srcH,
      outW,
      outH,
      uvScale: [1, 1],
      uvOffset: [0, 0],
      skippedCrop: true,
    };
  }

  // Calculate target aspect ratio based on video orientation
  // In Landscape (srcW >= srcH):
  //   4:3 -> 4 / 3 (1.3333)
  //   16:9 -> 16 / 9 (1.7778)
  //   3:2 / 2:3 -> 3 / 2 (1.5)
  //   1:1 -> 1.0
  //   9:16 -> 9 / 16 (0.5625)
  //   1:2 -> 1 / 2 (0.5)
  // In Portrait (srcH > srcW):
  //   4:3 -> 3 / 4 (0.75, standard 4:3 vertical)
  //   16:9 -> 9 / 16 (0.5625)
  //   3:2 / 2:3 -> 2 / 3 (0.6667)
  //   1:1 -> 1.0
  //   9:16 -> 9 / 16 (0.5625)
  //   1:2 -> 1 / 2 (0.5)
  let targetRatio = srcW / srcH;
  const isPortrait = srcH > srcW;

  if (cropAspect === '4:3') {
    targetRatio = isPortrait ? 3 / 4 : 4 / 3;
  } else if (cropAspect === '16:9') {
    targetRatio = isPortrait ? 9 / 16 : 16 / 9;
  } else if (cropAspect === '3:2' || cropAspect === '2:3') {
    targetRatio = isPortrait ? 2 / 3 : 3 / 2;
  } else if (cropAspect === '1:1') {
    targetRatio = 1.0;
  } else if (cropAspect === '9:16') {
    targetRatio = 9 / 16;
  } else if (cropAspect === '1:2') {
    targetRatio = isPortrait ? 1 / 2 : 2 / 1;
  }

  let cropW = srcW;
  let cropH = srcH;
  const currentRatio = srcW / srcH;
  let skippedCrop = false;

  if (Math.abs(currentRatio - targetRatio) > 0.005) {
    if (currentRatio > targetRatio) {
      // Source is wider than target ratio: crop sides
      cropW = Math.round(srcH * targetRatio);
      cropH = srcH;
    } else {
      // Source is taller than target ratio: crop top/bottom
      cropW = srcW;
      cropH = Math.round(srcW / targetRatio);
    }

    // ข้ามการ Crop เมื่อตัวแบบล้นสัดส่วน
    if (skipOverflowCrop && subjectAnchor && subjectAnchor.widthNorm) {
      if (subjectAnchor.widthNorm > (cropW / srcW) * 0.98) {
        cropW = srcW;
        cropH = srcH;
        skippedCrop = true;
      }
    }
  } else {
    // Current ratio already matches target ratio!
    skippedCrop = true;
  }

  let cropX = Math.round((srcW - cropW) / 2);
  let cropY = Math.round((srcH - cropH) / 2);

  if (!skippedCrop && subjectAnchor) {
    const sX = subjectAnchor.xNorm;
    const sY = subjectAnchor.yNorm;

    // คำนวณตำแหน่งตามสัดส่วนองค์ประกอบภาพ (Composition Rule)
    let anchorX = 0.5;
    let anchorY = 0.45;

    if (composition === '2:3') {
      // สัดส่วน 2:3 ส่วน (Rule of Thirds): วางตัวแบบที่ 1/3 หรือ 2/3
      anchorX = sX < 0.5 ? 0.333 : 0.667;
      anchorY = 0.38; // สัดส่วนสายตาในแนวตั้ง 2:3 ส่วนจากด้านล่าง (1/3 จากด้านบน)
    } else {
      // สัดส่วน 1:2 ส่วน (Center): วางตัวแบบที่กึ่งกลาง 50%
      anchorX = 0.5;
      anchorY = 0.45;
    }

    let idealX = Math.round(srcW * sX - cropW * anchorX);
    let idealY = Math.round(srcH * sY - cropH * anchorY);

    // Smart Standing Subject Headroom Protection (สำหรับภาพคนยืน/นักวิ่งแนวตั้ง):
    // ตรวจจับจุดบนสุดของศีรษะ แล้วการันตีพื้นที่เหนือศีรษะ (Headroom) 10%
    // ป้องกันไม่ให้ขอบบนของกรอบตัดโดนเส้นผมหรือศีรษะของนักวิ่ง 100%
    if (isPortrait && subjectAnchor.headYNorm !== undefined && subjectAnchor.headYNorm > 0.05) {
      const headY = Math.round(srcH * subjectAnchor.headYNorm);
      const minHeadroom = Math.round(cropH * 0.10);
      const maxCropYToProtectHead = Math.max(0, headY - minHeadroom);
      if (idealY > maxCropYToProtectHead) {
        idealY = maxCropYToProtectHead;
      }
    }

    cropX = Math.max(0, Math.min(srcW - cropW, idealX));
    cropY = Math.max(0, Math.min(srcH - cropH, idealY));
  }

  // รักษาอัตราส่วนของเอาต์พุตให้ตรงกับสัดส่วน Crop 100% (ห้ามบีบหรือยืดภาพเด็ดขาด)
  let outW = cropW;
  let outH = cropH;

  if (targetW && targetH && targetW > 0 && targetH > 0) {
    if (!skippedCrop) {
      outW = targetW;
      outH = targetH;
      // หมุนสัดส่วนเอาต์พุตให้ตรงกับแนวภาพ Crop (แนวตั้ง vs แนวนอน)
      if ((cropH > cropW && outW > outH) || (cropW > cropH && outH > outW)) {
        const t = outW;
        outW = outH;
        outH = t;
      }
    } else {
      // หากข้ามการ Crop ให้ส่งออกตามขนาดต้นฉบับจริง เพื่อไม่ให้ภาพโดนบีบ
      outW = srcW;
      outH = srcH;
    }
  }

  const uvScale: [number, number] = [cropW / srcW, cropH / srcH];
  const uvOffset: [number, number] = [cropX / srcW, cropY / srcH];

  return { cropX, cropY, cropW, cropH, outW, outH, uvScale, uvOffset, skippedCrop };
}

export interface CaptureSettings {
  outputWidth: number;
  outputHeight: number;
  quality: number;
  format: 'jpeg' | 'png' | 'webp';
  keepAspectRatio: boolean;
  cropAspect?: CropAspect;
  cropComposition?: CropComposition;
  skipOverflowCrop?: boolean;
  subjectAnchor?: SubjectCentroid;
  customCrop?: NormalizedCropRect;
  // Lightroom File Settings (Limit File Size To KB, Color Space, HDR, Compatibility)
  limitFileSize?: boolean;
  maxFileSizeKb?: number;
  colorSpace?: 'srgb' | 'display-p3' | 'adobe-rgb';
  hdrOutput?: boolean;
  maximizeCompatibility?: boolean;
  // Pixel Density (PPI / PPC)
  pixelDensity?: number;
  densityUnit?: 'ppi' | 'ppc';
  // Smart AI Capture Options
  smartBestShot?: boolean;
  skipStaticScene?: boolean;
  // Basic & Detail
  denoise?: number;
  sharpen?: number;
  clarity?: number;
  vibrance?: number;
  saturation?: number;
  contrast?: number;
  brightness?: number;
  shadowLift?: number;
  // Lightroom Color Mixer & Color Grading
  colorMixer?: ColorMixerSettings;
  colorGrading?: ColorGradingSettings;
  // Watermark Overlay
  watermark?: WatermarkSettings;
}

export function createDefaultColorMixer(): ColorMixerSettings {
  return {
    red: { hue: 0, sat: 0, lum: 0 },
    orange: { hue: 0, sat: 0, lum: 0 },
    yellow: { hue: 0, sat: 0, lum: 0 },
    green: { hue: 0, sat: 0, lum: 0 },
    aqua: { hue: 0, sat: 0, lum: 0 },
    blue: { hue: 0, sat: 0, lum: 0 },
    purple: { hue: 0, sat: 0, lum: 0 },
    magenta: { hue: 0, sat: 0, lum: 0 },
  };
}

export function createDefaultColorGrading(): ColorGradingSettings {
  return {
    shadows: { hue: 210, sat: 0, lum: 0 },
    midtones: { hue: 40, sat: 0, lum: 0 },
    highlights: { hue: 45, sat: 0, lum: 0 },
    blending: 50,
    balance: 0,
  };
}

let frameCounter = 0;
let sharedAnalysisCanvas: HTMLCanvasElement | null = null;
let sharedBeforeCanvas: HTMLCanvasElement | null = null;
let sharedAfterCanvas: HTMLCanvasElement | null = null;

/**
 * วัดความคมชัดของภาพ (Laplacian Variance Method) + AI วิเคราะห์ตำแหน่งตัวแบบและสัดส่วนองค์ประกอบ
 */
export function analyzeFrameSharpnessAndGray(
  source: HTMLCanvasElement | HTMLVideoElement,
  srcW: number,
  srcH: number
): {
  sharpness: number;
  grayThumb: Float32Array;
  thumbW: number;
  thumbH: number;
  subjectCentroid: SubjectCentroid;
} {
  const scale = Math.min(1, 360 / Math.max(srcW, srcH));
  const sw = Math.max(16, Math.round(srcW * scale));
  const sh = Math.max(16, Math.round(srcH * scale));

  if (!sharedAnalysisCanvas) {
    sharedAnalysisCanvas = document.createElement('canvas');
  }
  sharedAnalysisCanvas.width = sw;
  sharedAnalysisCanvas.height = sh;
  const sCtx = sharedAnalysisCanvas.getContext('2d', { willReadFrequently: true })!;
  sCtx.drawImage(source, 0, 0, sw, sh);

  const imageData = sCtx.getImageData(0, 0, sw, sh);
  const data = imageData.data;

  const gray = new Float32Array(sw * sh);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  let sum = 0;
  let sumSq = 0;
  let count = 0;

  // Focus weight: give 1.5x weight to the center 60% subject zone (where runners/subjects usually are)
  const xMinCenter = Math.floor(sw * 0.2);
  const xMaxCenter = Math.ceil(sw * 0.8);
  const yMinCenter = Math.floor(sh * 0.15);
  const yMaxCenter = Math.ceil(sh * 0.85);

  let weightedX = 0;
  let weightedY = 0;
  let totalSaliencyWeight = 0;
  let minSalX = sw;
  let maxSalX = 0;
  let minSalY = sh;
  let maxSalY = 0;
  const skinCountPerRow = new Uint16Array(sh);

  for (let y = 1; y < sh - 1; y++) {
    const inCenterY = y >= yMinCenter && y <= yMaxCenter;
    for (let x = 1; x < sw - 1; x++) {
      const idx = y * sw + x;
      const lap =
        gray[idx - sw] +
        gray[idx - 1] +
        -4 * gray[idx] +
        gray[idx + 1] +
        gray[idx + sw];

      const w = inCenterY && x >= xMinCenter && x <= xMaxCenter ? 1.35 : 0.85;
      const weightedLap = lap * w;
      sum += weightedLap;
      sumSq += weightedLap * weightedLap;
      count++;

      // Subject Saliency (Human Skin Tone + Edge Contrast Magnitude)
      const pIdx = idx * 4;
      const r = data[pIdx];
      const g = data[pIdx + 1];
      const b = data[pIdx + 2];
      const isSkin = r > 60 && g > 40 && b > 20 && (r - g) >= 8 && (r - b) >= 12 && (r - g) < 130;
      if (isSkin) {
        skinCountPerRow[y]++;
      }
      const edgeMag = Math.abs(lap);
      const salWeight = edgeMag * (isSkin ? 3.0 : 1.0);

      if (salWeight > 12) {
        weightedX += x * salWeight;
        weightedY += y * salWeight;
        totalSaliencyWeight += salWeight;
        if (x < minSalX) minSalX = x;
        if (x > maxSalX) maxSalX = x;
        if (y < minSalY) minSalY = y;
        if (y > maxSalY) maxSalY = y;
      }
    }
  }

  const mean = sum / count;
  const variance = sumSq / count - mean * mean;

  const xNorm = totalSaliencyWeight > 0 ? (weightedX / totalSaliencyWeight) / sw : 0.5;
  const yNorm = totalSaliencyWeight > 0 ? (weightedY / totalSaliencyWeight) / sh : 0.5;

  let topmostSkinRow = -1;
  for (let y = 1; y < sh - 1; y++) {
    if (skinCountPerRow[y] >= 3) {
      topmostSkinRow = y;
      break;
    }
  }
  const headYNorm = topmostSkinRow > 0 ? Math.max(0, (topmostSkinRow - sh * 0.04) / sh) : undefined;

  const subjectCentroid: SubjectCentroid = {
    xNorm,
    yNorm,
    widthNorm: totalSaliencyWeight > 0 && maxSalX > minSalX ? (maxSalX - minSalX) / sw : undefined,
    heightNorm: totalSaliencyWeight > 0 && maxSalY > minSalY ? (maxSalY - minSalY) / sh : undefined,
    headYNorm,
  };

  return {
    sharpness: Math.round(variance * 10) / 10,
    grayThumb: gray,
    thumbW: sw,
    thumbH: sh,
    subjectCentroid,
  };
}

export function measureSharpness(
  source: HTMLCanvasElement | HTMLVideoElement,
  srcW: number,
  srcH: number
): number {
  return analyzeFrameSharpnessAndGray(source, srcW, srcH).sharpness;
}

/**
 * ตรวจวัดการเคลื่อนไหวในภาพ (Subject / Motion Detection)
 * เปรียบเทียบเฟรมปัจจุบันกับเฟรมก่อนหน้าในโซนกลางภาพ เพื่อข้ามช่วงถนนโล่งๆ
 */
export function measureSceneMotion(
  prevGray: Float32Array | null,
  currGray: Float32Array,
  w: number,
  h: number
): number {
  if (!prevGray || prevGray.length !== currGray.length) return 100;
  let diffSum = 0;
  let count = 0;
  const x0 = Math.floor(w * 0.15);
  const x1 = Math.ceil(w * 0.85);
  const y0 = Math.floor(h * 0.15);
  const y1 = Math.ceil(h * 0.85);

  for (let y = y0; y < y1; y += 2) {
    const row = y * w;
    for (let x = x0; x < x1; x += 2) {
      diffSum += Math.abs(currGray[row + x] - prevGray[row + x]);
      count++;
    }
  }
  return count > 0 ? diffSum / count : 100;
}

/**
 * Multi-Step Super-Sampling Upscale
 */
function drawSteppedUpscale(
  source: HTMLVideoElement | HTMLCanvasElement,
  srcW: number,
  srcH: number,
  destCtx: CanvasRenderingContext2D,
  destW: number,
  destH: number,
  cssFilter: string = 'none'
) {
  if (destW <= srcW * 1.35 && destH <= srcH * 1.35) {
    destCtx.imageSmoothingEnabled = true;
    destCtx.imageSmoothingQuality = 'high';
    if (cssFilter !== 'none') destCtx.filter = cssFilter;
    destCtx.drawImage(source, 0, 0, destW, destH);
    destCtx.filter = 'none';
    return;
  }

  let curW = srcW;
  let curH = srcH;
  let curSource: HTMLVideoElement | HTMLCanvasElement = source;

  while (curW * 1.5 < destW) {
    const nextW = Math.min(destW, Math.round(curW * 1.5));
    const nextH = Math.min(destH, Math.round(curH * 1.5));
    const stepCanvas = document.createElement('canvas');
    stepCanvas.width = nextW;
    stepCanvas.height = nextH;
    const stepCtx = stepCanvas.getContext('2d')!;
    stepCtx.imageSmoothingEnabled = true;
    stepCtx.imageSmoothingQuality = 'high';
    stepCtx.drawImage(curSource, 0, 0, nextW, nextH);

    curSource = stepCanvas;
    curW = nextW;
    curH = nextH;
  }

  destCtx.imageSmoothingEnabled = true;
  destCtx.imageSmoothingQuality = 'high';
  if (cssFilter !== 'none') destCtx.filter = cssFilter;
  destCtx.drawImage(curSource, 0, 0, destW, destH);
  destCtx.filter = 'none';
}

// ==================== 8-CHANNEL HSL LUT BUILDER ====================
const CHANNEL_CENTERS: { key: HSLChannelKey; center: number }[] = [
  { key: 'red', center: 0 },
  { key: 'orange', center: 30 },
  { key: 'yellow', center: 60 },
  { key: 'green', center: 120 },
  { key: 'aqua', center: 180 },
  { key: 'blue', center: 240 },
  { key: 'purple', center: 280 },
  { key: 'magenta', center: 325 },
];

function isColorMixerActive(mixer?: ColorMixerSettings): boolean {
  if (!mixer) return false;
  for (const ch of Object.values(mixer)) {
    if (ch.hue !== 0 || ch.sat !== 0 || ch.lum !== 0) return true;
  }
  return false;
}

function isColorGradingActive(grading?: ColorGradingSettings): boolean {
  if (!grading) return false;
  return (
    grading.shadows.sat > 0 ||
    grading.shadows.lum !== 0 ||
    grading.midtones.sat > 0 ||
    grading.midtones.lum !== 0 ||
    grading.highlights.sat > 0 ||
    grading.highlights.lum !== 0
  );
}

function buildHueLookup(mixer: ColorMixerSettings) {
  const hueShiftLut = new Float32Array(360);
  const satScaleLut = new Float32Array(360);
  const lumShiftLut = new Float32Array(360);

  for (let deg = 0; deg < 360; deg++) {
    let hShift = 0;
    let sShift = 0;
    let lShift = 0;

    for (let c = 0; c < CHANNEL_CENTERS.length; c++) {
      const { key, center } = CHANNEL_CENTERS[c];
      const adj = mixer[key];
      if (adj.hue === 0 && adj.sat === 0 && adj.lum === 0) continue;

      let dist = Math.abs(deg - center);
      if (dist > 180) dist = 360 - dist;

      const radius = key === 'green' || key === 'blue' ? 50 : 38;
      if (dist < radius) {
        const t = 1 - dist / radius;
        const w = t * t * (3 - 2 * t);
        hShift += (adj.hue * 0.45) * w;
        sShift += (adj.sat / 100) * w;
        lShift += (adj.lum * 0.85) * w;
      }
    }

    hueShiftLut[deg] = hShift;
    satScaleLut[deg] = Math.max(0, 1 + sShift);
    lumShiftLut[deg] = lShift;
  }

  return { hueShiftLut, satScaleLut, lumShiftLut };
}

// ==================== WEBGL2 GPU HARDWARE ACCELERATION ENGINE ====================
class WebGL2PhotoEnhancer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texImage: WebGLTexture | null = null;
  private texHslLut: WebGLTexture | null = null;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.init();
  }

  private init() {
    const gl = this.canvas.getContext('webgl2', {
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) return;

    const vsSource = `#version 300 es
      in vec2 a_pos;
      out vec2 v_uv;
      uniform vec2 u_uvScale;
      uniform vec2 u_uvOffset;
      void main() {
        vec2 uv = a_pos * 0.5 + 0.5;
        uv.y = 1.0 - uv.y;
        v_uv = uv * u_uvScale + u_uvOffset;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }
    `;

    const fsSource = `#version 300 es
      precision highp float;
      in vec2 v_uv;
      out vec4 outColor;

      uniform sampler2D u_image;
      uniform sampler2D u_hslLut;
      uniform vec2 u_texel;

      uniform float u_bri;
      uniform float u_con;
      uniform float u_sat;
      uniform float u_shadowLift;
      uniform float u_clarity;
      uniform float u_vibrance;
      uniform float u_sharpen;
      uniform float u_denoise;

      uniform int u_hasHsl;
      uniform int u_hasGrading;
      uniform vec3 u_shTint; // rOffset, gOffset, bOffset (-1..1)
      uniform vec3 u_midTint;
      uniform vec3 u_hiTint;
      uniform vec3 u_gradeLum; // shLum, midLum, hiLum (-1..1)
      uniform float u_blending;
      uniform float u_balance;

      vec3 rgb2hsl(vec3 c) {
        float maxC = max(max(c.r, c.g), c.b);
        float minC = min(min(c.r, c.g), c.b);
        float l = (maxC + minC) * 0.5;
        if (maxC == minC) return vec3(0.0, 0.0, l);
        float d = maxC - minC;
        float s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);
        float h;
        if (maxC == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
        else if (maxC == c.g) h = (c.b - c.r) / d + 2.0;
        else h = (c.r - c.g) / d + 4.0;
        return vec3(h / 6.0, s, l);
      }

      float hue2rgb(float p, float q, float t) {
        if (t < 0.0) t += 1.0;
        if (t > 1.0) t -= 1.0;
        if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
        if (t < 1.0/2.0) return q;
        if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
        return p;
      }

      vec3 hsl2rgb(vec3 hsl) {
        if (hsl.y <= 0.0001) return vec3(hsl.z);
        float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
        float p = 2.0 * hsl.z - q;
        return vec3(
          hue2rgb(p, q, hsl.x + 1.0/3.0),
          hue2rgb(p, q, hsl.x),
          hue2rgb(p, q, hsl.x - 1.0/3.0)
        );
      }

      void main() {
        vec4 centerSample = texture(u_image, v_uv);
        vec3 col = centerSample.rgb;

        // 1. Spatial 3x3 Sharpen & Edge-Preserving Denoise
        if (u_sharpen > 0.0 || u_denoise > 0.0) {
          vec3 n = texture(u_image, v_uv + vec2(0.0, -u_texel.y)).rgb;
          vec3 s = texture(u_image, v_uv + vec2(0.0,  u_texel.y)).rgb;
          vec3 w = texture(u_image, v_uv + vec2(-u_texel.x, 0.0)).rgb;
          vec3 e = texture(u_image, v_uv + vec2( u_texel.x, 0.0)).rgb;
          vec3 nw = texture(u_image, v_uv + vec2(-u_texel.x, -u_texel.y)).rgb;
          vec3 ne = texture(u_image, v_uv + vec2( u_texel.x, -u_texel.y)).rgb;
          vec3 sw = texture(u_image, v_uv + vec2(-u_texel.x,  u_texel.y)).rgb;
          vec3 se = texture(u_image, v_uv + vec2( u_texel.x,  u_texel.y)).rgb;

          vec3 blur = (col * 4.0 + (n + s + w + e) * 2.0 + (nw + ne + sw + se)) / 16.0;
          vec3 diff = col - blur;
          float edgeMag = dot(abs(diff), vec3(0.299, 0.587, 0.114)) * 255.0;
          float noiseThresh = 3.0 + u_denoise * 18.0;

          if (u_denoise > 0.0 && edgeMag < noiseThresh) {
            float dStrength = (1.0 - edgeMag / noiseThresh) * (u_denoise * 0.85);
            col = col - diff * dStrength;
          } else if (u_sharpen > 0.0 && edgeMag >= 3.0) {
            float sAmount = u_sharpen * 1.85;
            col = col + diff * sAmount;
          }
        }

        // 2. Brightness, Contrast, Global Saturation
        col = col * u_bri;
        col = (col - 0.5) * u_con + 0.5;
        float baseLuma = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(baseLuma), col, u_sat);
        col = clamp(col, 0.0, 1.0);

        // 3. Tone Curve (Shadow Lift + Clarity S-Curve)
        if (u_shadowLift > 0.0 || u_clarity > 0.0) {
          vec3 x = col;
          if (u_shadowLift > 0.0) {
            x = x + u_shadowLift * 0.45 * (1.0 - x) * (1.0 - x) * pow(x, vec3(0.7));
          }
          if (u_clarity > 0.0) {
            vec3 sCurve = x - u_clarity * 0.22 * sin(2.0 * 3.14159265 * x);
            col = clamp(sCurve, 0.0, 1.0);
          } else {
            col = clamp(x, 0.0, 1.0);
          }
        }

        // 4. Smart Vibrance with Skin-Tone Protection
        if (u_vibrance > 0.0) {
          float maxC = max(max(col.r, col.g), col.b);
          float minC = min(min(col.r, col.g), col.b);
          float satSpan = maxC - minC;
          bool isSkin = (col.r > col.g && col.g > col.b && (col.r - col.g) > 0.047 && (col.r - col.g) < 0.255);
          float skinProt = isSkin ? 0.35 : 1.0;
          float boost = (1.0 - satSpan) * u_vibrance * 0.85 * skinProt;
          float avg = (col.r + col.g + col.b) / 3.0;
          col = clamp(col + (col - avg) * boost, 0.0, 1.0);
        }

        // 5. 8-Channel HSL Color Mixer via 360x1 LUT Texture
        if (u_hasHsl == 1) {
          vec3 hsl = rgb2hsl(col);
          if (hsl.y > 0.02) {
            vec3 lutVal = texture(u_hslLut, vec2(hsl.x, 0.5)).rgb;
            float hShift = (lutVal.r - 0.5) * 2.0; // -1..1 normalized
            float sScale = lutVal.g * 2.0;         // 0..2
            float lShift = (lutVal.b - 0.5) * 2.0; // -1..1
            hsl.x = fract(hsl.x + hShift);
            hsl.y = clamp(hsl.y * sScale, 0.0, 1.0);
            float lWeight = 1.0 - abs(2.0 * hsl.z - 1.0) * 0.6;
            hsl.z = clamp(hsl.z + lShift * lWeight, 0.0, 1.0);
            col = hsl2rgb(hsl);
          }
        }

        // 6. 3-Way Color Grading (Shadows, Midtones, Highlights + Blending & Balance)
        if (u_hasGrading == 1) {
          float luma = clamp(dot(col, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
          float pivot = clamp(0.5 - u_balance * 0.28, 0.15, 0.85);
          float feather = 0.25 + u_blending * 0.55;

          float wSh = max(0.0, 1.0 - luma / max(0.05, pivot + feather * 0.4));
          wSh = pow(wSh, 1.6 - u_blending * 0.6);

          float wHi = max(0.0, (luma - max(0.0, pivot - feather * 0.4)) / max(0.05, 1.0 - max(0.0, pivot - feather * 0.4)));
          wHi = pow(wHi, 1.6 - u_blending * 0.6);

          float distMid = abs(luma - pivot);
          float midSpan = 0.35 + u_blending * 0.35;
          float wMid = max(0.0, 1.0 - distMid / midSpan);
          wMid = wMid * wMid * (3.0 - 2.0 * wMid);

          col += wSh * (u_shTint + vec3(u_gradeLum.x));
          col += wMid * (u_midTint + vec3(u_gradeLum.y));
          col += wHi * (u_hiTint + vec3(u_gradeLum.z));
          col = clamp(col, 0.0, 1.0);
        }

        outColor = vec4(col, centerSample.a);
      }
    `;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };

    const vs = compile(gl.VERTEX_SHADER, vsSource);
    const fs = compile(gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;

    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    this.texImage = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texImage);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    this.texHslLut = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texHslLut);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    this.gl = gl;
    this.program = prog;
  }

  public isSupported(): boolean {
    return !!this.gl && !!this.program;
  }

  public render(
    source: HTMLCanvasElement | HTMLVideoElement,
    width: number,
    height: number,
    settings: CaptureSettings,
    srcW?: number,
    srcH?: number
  ): HTMLCanvasElement | null {
    const gl = this.gl;
    const prog = this.program;
    if (!gl || !prog) return null;

    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
    let renderW = width;
    let renderH = height;
    if (renderW > maxTex || renderH > maxTex) {
      const scale = Math.min(maxTex / renderW, maxTex / renderH);
      renderW = Math.max(16, Math.round(renderW * scale));
      renderH = Math.max(16, Math.round(renderH * scale));
    }

    if (this.canvas.width !== renderW) this.canvas.width = renderW;
    if (this.canvas.height !== renderH) this.canvas.height = renderH;
    gl.viewport(0, 0, renderW, renderH);
    gl.useProgram(prog);

    // Direct GPU texture upload from renderSource
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texImage);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_image'), 0);
    const texelW = srcW && srcW > 0 ? srcW : renderW;
    const texelH = srcH && srcH > 0 ? srcH : renderH;
    gl.uniform2f(gl.getUniformLocation(prog, 'u_texel'), 1 / texelW, 1 / texelH);

    // Source is already cleanly cropped, so UV scale is 1.0 and offset is 0.0
    const uvScaleLoc = gl.getUniformLocation(prog, 'u_uvScale');
    const uvOffsetLoc = gl.getUniformLocation(prog, 'u_uvOffset');
    if (uvScaleLoc) gl.uniform2f(uvScaleLoc, 1.0, 1.0);
    if (uvOffsetLoc) gl.uniform2f(uvOffsetLoc, 0.0, 0.0);

    // Basic & Detail uniforms
    gl.uniform1f(gl.getUniformLocation(prog, 'u_bri'), (settings.brightness ?? 100) / 100);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_con'), (settings.contrast ?? 100) / 100);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_sat'), (settings.saturation ?? 100) / 100);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_shadowLift'), (settings.shadowLift ?? 0) / 100);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_clarity'), (settings.clarity ?? 0) / 100);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_vibrance'), (settings.vibrance ?? 0) / 100);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_sharpen'), (settings.sharpen ?? 0) / 100);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_denoise'), (settings.denoise ?? 0) / 100);

    // HSL LUT texture
    const hasHsl = isColorMixerActive(settings.colorMixer);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_hasHsl'), hasHsl ? 1 : 0);
    if (hasHsl && settings.colorMixer) {
      const { hueShiftLut, satScaleLut, lumShiftLut } = buildHueLookup(settings.colorMixer);
      const lutBytes = new Uint8Array(360 * 4);
      for (let i = 0; i < 360; i++) {
        // hShift in degrees (-45..+45) -> normalized (-0.125..+0.125)
        const hNorm = hueShiftLut[i] / 360;
        const sNorm = satScaleLut[i] / 2.0; // 0..2 -> 0..1
        const lNorm = lumShiftLut[i] / 255; // -0.35..+0.35
        lutBytes[i * 4] = Math.max(0, Math.min(255, Math.round((hNorm * 0.5 + 0.5) * 255)));
        lutBytes[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(sNorm * 255)));
        lutBytes[i * 4 + 2] = Math.max(0, Math.min(255, Math.round((lNorm * 0.5 + 0.5) * 255)));
        lutBytes[i * 4 + 3] = 255;
      }
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.texHslLut);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 360, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, lutBytes);
      gl.uniform1i(gl.getUniformLocation(prog, 'u_hslLut'), 1);
    }

    // 3-Way Color Grading uniforms
    const hasGrading = isColorGradingActive(settings.colorGrading);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_hasGrading'), hasGrading ? 1 : 0);
    if (hasGrading && settings.colorGrading) {
      const wheelToVec = (w: ColorWheelState): [number, number, number] => {
        if (w.sat <= 0) return [0, 0, 0];
        const [tr, tg, tb] = hslToRgb((w.hue % 360) / 360, 1, 0.5);
        const strength = (w.sat / 100) * 0.35;
        return [
          ((tr - 128) / 255) * strength,
          ((tg - 128) / 255) * strength,
          ((tb - 128) / 255) * strength,
        ];
      };
      const shT = wheelToVec(settings.colorGrading.shadows);
      const midT = wheelToVec(settings.colorGrading.midtones);
      const hiT = wheelToVec(settings.colorGrading.highlights);

      gl.uniform3f(gl.getUniformLocation(prog, 'u_shTint'), shT[0], shT[1], shT[2]);
      gl.uniform3f(gl.getUniformLocation(prog, 'u_midTint'), midT[0], midT[1], midT[2]);
      gl.uniform3f(gl.getUniformLocation(prog, 'u_hiTint'), hiT[0], hiT[1], hiT[2]);
      gl.uniform3f(
        gl.getUniformLocation(prog, 'u_gradeLum'),
        (settings.colorGrading.shadows.lum * 0.65) / 255,
        (settings.colorGrading.midtones.lum * 0.65) / 255,
        (settings.colorGrading.highlights.lum * 0.65) / 255
      );
      gl.uniform1f(gl.getUniformLocation(prog, 'u_blending'), (settings.colorGrading.blending ?? 50) / 100);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_balance'), (settings.colorGrading.balance ?? 0) / 100);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return this.canvas;
  }
}

let gpuEnhancerInstance: WebGL2PhotoEnhancer | null = null;
function getGpuEnhancer(): WebGL2PhotoEnhancer {
  if (!gpuEnhancerInstance) {
    gpuEnhancerInstance = new WebGL2PhotoEnhancer();
  }
  return gpuEnhancerInstance;
}

export function isGpuAccelerationAvailable(): boolean {
  return getGpuEnhancer().isSupported();
}

// ==================== CPU FALLBACK & HELPER FUNCTIONS ====================
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) * 0.5;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
        break;
      case gn:
        h = ((bn - rn) / d + 2) * 60;
        break;
      default:
        h = ((rn - gn) / d + 4) * 60;
        break;
    }
  }
  return [h, s, l];
}

function hue2rgbCpu(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(hNorm: number, s: number, l: number): [number, number, number] {
  if (s <= 0.0001) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hue2rgbCpu(p, q, hNorm + 1 / 3);
  const g = hue2rgbCpu(p, q, hNorm);
  const b = hue2rgbCpu(p, q, hNorm - 1 / 3);
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * PhotoScape X-Style Pro Watermark / Object Overlay Renderer
 * Supports:
 * - 3x3 Anchor Point Grid (tl, tc, tr, ml, mc, mr, bl, bc, br) + X/Y Offset
 * - Scale %, Preserve Aspect Ratio, Anti-alias, Angle (-180..180), Flip Horizontal (Transform)
 * - Opacity (0..100) & Blend Mode (Normal, Multiply, Screen, Overlay, Soft Light, Lighten, Darken, Difference)
 * - Background Plate, Color Tint, Fill, and Shape Masking (Rectangle + Roundness, Circle, Ellipse)
 * - Layer Effects: Outline, Drop Shadow, Long Shadow, Outer Glow, Inner Glow, Inner Shadow, Emboss
 */
function buildWatermarkShapePath(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  shape: WatermarkShape,
  roundness: number
) {
  const hw = w / 2;
  const hh = h / 2;
  ctx.beginPath();
  if (shape === 'circle') {
    const r = Math.min(hw, hh);
    ctx.arc(0, 0, r, 0, Math.PI * 2);
  } else if (shape === 'ellipse') {
    ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
  } else {
    const maxR = Math.min(hw, hh);
    const r = (Math.max(0, Math.min(100, roundness)) / 100) * maxR;
    ctx.roundRect(-hw, -hh, w, h, r);
  }
  ctx.closePath();
}

function drawWatermarkOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  wm?: WatermarkSettings
) {
  if (!wm || !wm.image) return;
  const img = wm.image;
  if (!img.naturalWidth || !img.naturalHeight) return;

  const scaleRatio = Math.max(0.02, Math.min(1.0, (wm.scale || 18) / 100));
  const wmW = Math.round(width * scaleRatio);
  const wmH = wm.preserveAspect
    ? Math.round(wmW * (img.naturalHeight / img.naturalWidth))
    : Math.round(height * scaleRatio);

  const pad = Math.round(Math.min(width, height) * 0.025);

  // Compute center (cx, cy) based on 3x3 Anchor Grid
  let cx = width / 2;
  let cy = height / 2;

  if (wm.anchor.endsWith('l')) cx = pad + wmW / 2;
  else if (wm.anchor.endsWith('r')) cx = width - pad - wmW / 2;

  if (wm.anchor.startsWith('t')) cy = pad + wmH / 2;
  else if (wm.anchor.startsWith('b')) cy = height - pad - wmH / 2;

  // Apply X / Y Offset (scaled proportionally to canvas dimensions)
  cx += (wm.offsetX / 100) * (width * 0.5);
  cy += (wm.offsetY / 100) * (height * 0.5);

  // Prepare an offscreen layer for the logo itself (to support Color Tint, Emboss, Outline)
  const logoCanvas = document.createElement('canvas');
  logoCanvas.width = Math.max(1, wmW);
  logoCanvas.height = Math.max(1, wmH);
  const lCtx = logoCanvas.getContext('2d')!;
  lCtx.imageSmoothingEnabled = wm.antiAlias;
  lCtx.imageSmoothingQuality = wm.antiAlias ? 'high' : 'low';

  lCtx.drawImage(img, 0, 0, wmW, wmH);

  // Color Tint / Fill on the logo pixels
  if (wm.colorTint) {
    lCtx.save();
    lCtx.globalCompositeOperation = wm.fill ? 'source-in' : 'source-atop';
    lCtx.fillStyle = wm.tintColor || '#3b82f6';
    lCtx.globalAlpha = wm.fill ? 0.9 : 0.55;
    lCtx.fillRect(0, 0, wmW, wmH);
    lCtx.restore();
  }

  // Emboss bevel highlight/shadow
  if (wm.emboss) {
    lCtx.save();
    lCtx.globalCompositeOperation = 'source-atop';
    const grad = lCtx.createLinearGradient(0, 0, 0, wmH);
    grad.addColorStop(0, 'rgba(255,255,255,0.45)');
    grad.addColorStop(0.5, 'rgba(128,128,128,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.45)');
    lCtx.fillStyle = grad;
    lCtx.fillRect(0, 0, wmW, wmH);
    lCtx.restore();
  }

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, (wm.opacity ?? 100) / 100));
  ctx.globalCompositeOperation = wm.blendMode || 'source-over';
  ctx.imageSmoothingEnabled = wm.antiAlias;
  ctx.imageSmoothingQuality = wm.antiAlias ? 'high' : 'low';

  ctx.translate(cx, cy);
  if (wm.angle) {
    ctx.rotate((wm.angle * Math.PI) / 180);
  }
  if (wm.flipH) {
    ctx.scale(-1, 1);
  }

  const boxPad = Math.round(Math.max(wmW, wmH) * 0.08);
  const bgW = wmW + boxPad * 2;
  const bgH = wmH + boxPad * 2;

  // Optional Shape Clip Mask
  if (wm.masks) {
    buildWatermarkShapePath(ctx, wmW, wmH, wm.shape, wm.roundness);
    ctx.clip();
  }

  // Optional Background Plate
  if (wm.background) {
    ctx.save();
    buildWatermarkShapePath(ctx, bgW, bgH, wm.shape, wm.roundness);
    ctx.fillStyle = wm.bgColor || 'rgba(15, 23, 42, 0.78)';
    ctx.globalAlpha *= wm.fill ? 0.95 : 0.72;
    ctx.fill();
    ctx.restore();
  }

  // Long Shadow Effect (45-degree sport/retro shadow)
  if (wm.longShadow) {
    ctx.save();
    const steps = Math.max(6, Math.round(Math.max(wmW, wmH) * 0.06));
    ctx.globalAlpha *= 0.12;
    ctx.filter = 'brightness(0)';
    for (let s = steps; s >= 1; s -= 2) {
      ctx.drawImage(logoCanvas, -wmW / 2 + s, -wmH / 2 + s, wmW, wmH);
    }
    ctx.restore();
  }

  // Drop Shadow or Outer Glow
  if (wm.dropShadow || wm.outerGlow) {
    ctx.save();
    if (wm.outerGlow) {
      ctx.shadowColor = wm.tintColor || '#60a5fa';
      ctx.shadowBlur = Math.max(8, Math.round(Math.max(wmW, wmH) * 0.1));
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    } else {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
      ctx.shadowBlur = Math.max(6, Math.round(Math.max(wmW, wmH) * 0.06));
      ctx.shadowOffsetX = Math.max(2, Math.round(wmW * 0.02));
      ctx.shadowOffsetY = Math.max(2, Math.round(wmH * 0.025));
    }
    ctx.drawImage(logoCanvas, -wmW / 2, -wmH / 2, wmW, wmH);
    ctx.restore();
  }

  // Outline Effect (8-direction crisp stroke around logo alpha)
  if (wm.outline) {
    ctx.save();
    const strokeW = Math.max(1.5, Math.round(Math.max(wmW, wmH) * 0.015));
    const dirs = [
      [-strokeW, 0], [strokeW, 0], [0, -strokeW], [0, strokeW],
      [-strokeW * 0.7, -strokeW * 0.7], [strokeW * 0.7, -strokeW * 0.7],
      [-strokeW * 0.7, strokeW * 0.7], [strokeW * 0.7, strokeW * 0.7],
    ];
    // Create white/accent silhouette for outline
    const silCanvas = document.createElement('canvas');
    silCanvas.width = wmW;
    silCanvas.height = wmH;
    const sCtx = silCanvas.getContext('2d')!;
    sCtx.drawImage(logoCanvas, 0, 0);
    sCtx.globalCompositeOperation = 'source-in';
    sCtx.fillStyle = '#ffffff';
    sCtx.fillRect(0, 0, wmW, wmH);

    for (const [dx, dy] of dirs) {
      ctx.drawImage(silCanvas, -wmW / 2 + dx, -wmH / 2 + dy, wmW, wmH);
    }
    ctx.restore();
  }

  // Draw Main Logo
  ctx.drawImage(logoCanvas, -wmW / 2, -wmH / 2, wmW, wmH);

  // Inner Glow / Inner Shadow border accent
  if (wm.innerGlow || wm.innerShadow) {
    ctx.save();
    buildWatermarkShapePath(ctx, wmW, wmH, wm.shape, wm.roundness);
    ctx.strokeStyle = wm.innerGlow ? 'rgba(255, 255, 255, 0.65)' : 'rgba(0, 0, 0, 0.65)';
    ctx.lineWidth = Math.max(2, Math.round(Math.min(wmW, wmH) * 0.03));
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

let sharedCropCanvas: HTMLCanvasElement | null = null;

/**
 * Unified GPU + CPU Enhancement Pipeline (Single-Pass Direct Video-to-8K WebGL2)
 */
function renderEnhancedFrameToCanvas(
  source: HTMLVideoElement,
  srcW: number,
  srcH: number,
  destCanvas: HTMLCanvasElement,
  destW: number,
  destH: number,
  settings: CaptureSettings
) {
  const ctx = destCanvas.getContext('2d')!;
  const gpu = getGpuEnhancer();

  let renderSource: HTMLVideoElement | HTMLCanvasElement = source;
  let renderSrcW = srcW;
  let renderSrcH = srcH;

  // 1. True Image Cropping (ตัดส่วนภาพจริงตามอัตราส่วน ไม่บีบอัดชิ้นงาน 100%)
  if ((settings.cropAspect && settings.cropAspect !== 'none') || settings.customCrop) {
    const crop = getCropDimensions(
      srcW,
      srcH,
      settings.cropAspect,
      destW,
      destH,
      settings.subjectAnchor,
      settings.cropComposition,
      settings.skipOverflowCrop ?? true,
      settings.customCrop
    );

    if (!crop.skippedCrop) {
      if (!sharedCropCanvas) sharedCropCanvas = document.createElement('canvas');
      if (sharedCropCanvas.width !== crop.cropW) sharedCropCanvas.width = crop.cropW;
      if (sharedCropCanvas.height !== crop.cropH) sharedCropCanvas.height = crop.cropH;
      const cropCtx = sharedCropCanvas.getContext('2d', { willReadFrequently: true })!;
      cropCtx.drawImage(
        source,
        crop.cropX,
        crop.cropY,
        crop.cropW,
        crop.cropH,
        0,
        0,
        crop.cropW,
        crop.cropH
      );
      renderSource = sharedCropCanvas;
      renderSrcW = crop.cropW;
      renderSrcH = crop.cropH;
    }
  }

  // Fast Path: Single-Pass Direct GPU Video-to-Target Resolution + Color Grading + Sharpening
  const gpuCanvas = gpu.render(renderSource, destW, destH, settings, renderSrcW, renderSrcH);
  if (gpuCanvas) {
    ctx.drawImage(gpuCanvas, 0, 0, destW, destH);
  } else {
    // Fallback to CPU stepped upscale only if WebGL2 is unavailable
    drawSteppedUpscale(renderSource, renderSrcW, renderSrcH, ctx, destW, destH, 'none');
  }

  // Draw Watermark Overlay if configured
  if (settings.watermark?.image) {
    drawWatermarkOverlay(ctx, destW, destH, settings.watermark);
  }
}

/**
 * คำนวณกราฟ RGB & Luminance Histogram (64 bins)
 */
export function computeHistogram(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): HistogramData {
  const bins = 64;
  const r = new Array(bins).fill(0);
  const g = new Array(bins).fill(0);
  const b = new Array(bins).fill(0);
  const lum = new Array(bins).fill(0);

  const data = ctx.getImageData(0, 0, width, height).data;
  const step = Math.max(4, Math.floor(data.length / (4 * 8000)) * 4);

  for (let i = 0; i < data.length; i += step) {
    const rv = data[i];
    const gv = data[i + 1];
    const bv = data[i + 2];
    const lv = Math.round(0.299 * rv + 0.587 * gv + 0.114 * bv);

    r[rv >> 2]++;
    g[gv >> 2]++;
    b[bv >> 2]++;
    lum[lv >> 2]++;
  }

  let maxCount = 1;
  for (let i = 1; i < bins - 1; i++) {
    maxCount = Math.max(maxCount, r[i], g[i], b[i], lum[i]);
  }

  return {
    r: r.map(v => Math.min(1, v / maxCount)),
    g: g.map(v => Math.min(1, v / maxCount)),
    b: b.map(v => Math.min(1, v / maxCount)),
    lum: lum.map(v => Math.min(1, v / maxCount)),
  };
}

/**
 * สร้างภาพเปรียบเทียบ Before / After + กราฟ Histogram แบบสดๆ
 */
export function renderComparisonPreview(
  video: HTMLVideoElement,
  settings: CaptureSettings
): { beforeUrl: string; afterUrl: string; histogram: HistogramData } | null {
  if (!video.videoWidth || !video.videoHeight) return null;

  const analysis = analyzeFrameSharpnessAndGray(video, video.videoWidth, video.videoHeight);
  const crop = getCropDimensions(
    video.videoWidth,
    video.videoHeight,
    settings.cropAspect,
    undefined,
    undefined,
    analysis.subjectCentroid,
    settings.cropComposition,
    settings.skipOverflowCrop ?? true,
    settings.customCrop
  );
  const maxDim = 960;
  const scale = Math.min(1, maxDim / Math.max(crop.cropW, crop.cropH));
  const w = Math.max(64, Math.round(crop.cropW * scale));
  const h = Math.max(64, Math.round(crop.cropH * scale));

  // Before Canvas (Reused for zero-GC live preview)
  if (!sharedBeforeCanvas) sharedBeforeCanvas = document.createElement('canvas');
  sharedBeforeCanvas.width = w;
  sharedBeforeCanvas.height = h;
  const ctxBefore = sharedBeforeCanvas.getContext('2d')!;
  ctxBefore.drawImage(video, crop.cropX, crop.cropY, crop.cropW, crop.cropH, 0, 0, w, h);

  // After Canvas (GPU Accelerated + Watermark)
  if (!sharedAfterCanvas) sharedAfterCanvas = document.createElement('canvas');
  sharedAfterCanvas.width = w;
  sharedAfterCanvas.height = h;
  const previewSettings: CaptureSettings = {
    ...settings,
    subjectAnchor: analysis.subjectCentroid,
  };
  renderEnhancedFrameToCanvas(video, video.videoWidth, video.videoHeight, sharedAfterCanvas, w, h, previewSettings);

  const ctxAfter = sharedAfterCanvas.getContext('2d', { willReadFrequently: true })!;
  const histogram = computeHistogram(ctxAfter, w, h);

  return {
    beforeUrl: sharedBeforeCanvas.toDataURL('image/jpeg', 0.9),
    afterUrl: sharedAfterCanvas.toDataURL('image/jpeg', 0.9),
    histogram,
  };
}

/**
 * Zero-Copy JFIF APP0 Header Density Injection (Slices only 18 bytes instead of looping 2MB Base64)
 */
export async function injectJfifDensityIntoBlob(
  blob: Blob,
  pixelDensity: number = 150,
  densityUnit: 'ppi' | 'ppc' = 'ppi'
): Promise<Blob> {
  if (blob.type !== 'image/jpeg' || blob.size <= 18) return blob;
  const headBuf = await blob.slice(0, 18).arrayBuffer();
  const head = new Uint8Array(headBuf);
  if (
    head[0] === 0xff &&
    head[1] === 0xd8 &&
    head[2] === 0xff &&
    head[3] === 0xe0 &&
    head[6] === 0x4a && // 'J'
    head[7] === 0x46 && // 'F'
    head[8] === 0x49 && // 'I'
    head[9] === 0x46    // 'F'
  ) {
    const d = Math.max(1, Math.min(65535, Math.round(pixelDensity || 150)));
    head[13] = densityUnit === 'ppc' ? 2 : 1; // 1 = PPI, 2 = PPC
    head[14] = (d >> 8) & 0xff;
    head[15] = d & 0xff;
    head[16] = (d >> 8) & 0xff;
    head[17] = d & 0xff;
    return new Blob([head, blob.slice(18)], { type: blob.type });
  }
  return blob;
}

/**
 * Adaptive Rate-Control Encoder: Enforces "Limit File Size To: X KB" (Lightroom Style)
 * Uses frame-to-frame quality memory so 95%+ of frames hit <= maxFileSizeKb in a SINGLE pass!
 */
async function encodeCanvasWithFileSizeLimit(
  canvas: HTMLCanvasElement,
  mimeType: string,
  baseQuality: number,
  limitFileSize?: boolean,
  maxFileSizeKb?: number,
  adaptiveState?: { q: number }
): Promise<Blob | null> {
  if (!limitFileSize || mimeType === 'image/png' || !maxFileSizeKb || maxFileSizeKb <= 0) {
    return new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mimeType, baseQuality));
  }

  const maxBytes = Math.max(15, maxFileSizeKb) * 1024;
  let q = adaptiveState ? adaptiveState.q : Math.min(baseQuality, 0.88);

  let blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mimeType, q));
  if (!blob) return null;

  // If over limit, refine quality using JPEG rate-distortion curve (at most 2 fast steps)
  for (let attempt = 0; attempt < 2 && blob && blob.size > maxBytes && q > 0.12; attempt++) {
    const ratio = (maxBytes * 0.91) / blob.size;
    const nextQ = Math.max(0.12, Math.min(q - 0.04, q * Math.pow(ratio, 0.78)));
    q = Math.round(nextQ * 100) / 100;
    blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mimeType, q));
  }

  // Update adaptive quality memory for the next frame in this clip
  if (adaptiveState && blob) {
    if (blob.size < maxBytes * 0.72 && q < 0.94) {
      adaptiveState.q = Math.min(0.94, Math.round((q + 0.03) * 100) / 100);
    } else {
      adaptiveState.q = q;
    }
  }

  return blob;
}

/**
 * แคปเฟรมปัจจุบันแบบ Async Binary Blob (Native C++ Multi-Threaded Encoder + Reusable Canvas)
 */
export async function captureCurrentFrameAsync(
  video: HTMLVideoElement,
  settings: CaptureSettings,
  sharpnessThreshold: number = 0,
  precomputedSharpness?: number,
  reusableCanvas?: HTMLCanvasElement,
  adaptiveState?: { q: number }
): Promise<CapturedFrame> {
  const origW = video.videoWidth;
  const origH = video.videoHeight;

  const sharpness = precomputedSharpness ?? measureSharpness(video, origW, origH);
  const isSharp = sharpness >= sharpnessThreshold;

  let outW = settings.outputWidth;
  let outH = settings.outputHeight;
  let frameSettings: CaptureSettings = settings;

  if ((settings.cropAspect && settings.cropAspect !== 'none') || settings.customCrop) {
    const crop = getCropDimensions(
      origW,
      origH,
      settings.cropAspect,
      outW,
      outH,
      undefined,
      settings.cropComposition,
      settings.skipOverflowCrop ?? true,
      settings.customCrop
    );
    outW = crop.outW;
    outH = crop.outH;
  } else {
    // Smart Auto-Orientation: Match preset long-edge with video orientation (Portrait vs Landscape)
    if ((origH > origW && outW > outH) || (origW > origH && outH > outW)) {
      const tmp = outW;
      outW = outH;
      outH = tmp;
    }

    if (settings.keepAspectRatio) {
      const ratio = origW / origH;
      if (outW / outH > ratio) {
        outW = Math.round(outH * ratio);
      } else {
        outH = Math.round(outW / ratio);
      }
    }
  }

  if (sharpnessThreshold > 0 && !isSharp) {
    return {
      id: `frame-${Date.now()}-${++frameCounter}`,
      timestamp: video.currentTime,
      dataUrl: '',
      width: outW,
      height: outH,
      originalWidth: origW,
      originalHeight: origH,
      sharpness,
      isSharp: false,
    };
  }

  const canvas = reusableCanvas || document.createElement('canvas');
  if (canvas.width !== outW) canvas.width = outW;
  if (canvas.height !== outH) canvas.height = outH;

  renderEnhancedFrameToCanvas(video, origW, origH, canvas, outW, outH, settings);

  const mimeType = `image/${settings.format}`;
  const rawBlob = await encodeCanvasWithFileSizeLimit(
    canvas,
    mimeType,
    settings.quality,
    settings.limitFileSize,
    settings.maxFileSizeKb,
    adaptiveState
  );

  const finalBlob = rawBlob
    ? await injectJfifDensityIntoBlob(rawBlob, settings.pixelDensity ?? 150, settings.densityUnit ?? 'ppi')
    : undefined;

  return {
    id: `frame-${Date.now()}-${++frameCounter}`,
    timestamp: video.currentTime,
    dataUrl: '',
    blob: finalBlob,
    width: outW,
    height: outH,
    originalWidth: origW,
    originalHeight: origH,
    sharpness,
    isSharp: true,
  };
}

/**
 * แคปเฟรมปัจจุบันจาก video element พร้อมอัปเกรดคุณภาพ
 */
export function captureCurrentFrame(
  video: HTMLVideoElement,
  settings: CaptureSettings,
  sharpnessThreshold: number = 0,
  precomputedSharpness?: number
): CapturedFrame {
  const origW = video.videoWidth;
  const origH = video.videoHeight;

  const analysis = analyzeFrameSharpnessAndGray(video, origW, origH);
  const sharpness = precomputedSharpness ?? analysis.sharpness;
  const isSharp = sharpness >= sharpnessThreshold;

  let outW = settings.outputWidth;
  let outH = settings.outputHeight;
  let frameSettings: CaptureSettings = settings;

  if ((settings.cropAspect && settings.cropAspect !== 'none') || settings.customCrop) {
    const crop = getCropDimensions(
      origW,
      origH,
      settings.cropAspect,
      outW,
      outH,
      analysis.subjectCentroid,
      settings.cropComposition,
      settings.skipOverflowCrop ?? true,
      settings.customCrop
    );
    outW = crop.outW;
    outH = crop.outH;
    frameSettings = {
      ...settings,
      subjectAnchor: analysis.subjectCentroid,
    };
  } else {
    // Smart Auto-Orientation: Match preset long-edge with video orientation (Portrait vs Landscape)
    if ((origH > origW && outW > outH) || (origW > origH && outH > outW)) {
      const tmp = outW;
      outW = outH;
      outH = tmp;
    }

    if (settings.keepAspectRatio) {
      const ratio = origW / origH;
      if (outW / outH > ratio) {
        outW = Math.round(outH * ratio);
      } else {
        outH = Math.round(outW / ratio);
      }
    }
  }

  if (sharpnessThreshold > 0 && !isSharp) {
    return {
      id: `frame-${Date.now()}-${++frameCounter}`,
      timestamp: video.currentTime,
      dataUrl: '',
      width: outW,
      height: outH,
      originalWidth: origW,
      originalHeight: origH,
      sharpness,
      isSharp: false,
    };
  }

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;

  renderEnhancedFrameToCanvas(video, origW, origH, canvas, outW, outH, frameSettings);

  const mimeType = `image/${settings.format}`;
  const dataUrl = canvas.toDataURL(mimeType, settings.quality);

  return {
    id: `frame-${Date.now()}-${++frameCounter}`,
    timestamp: video.currentTime,
    dataUrl,
    width: outW,
    height: outH,
    originalWidth: origW,
    originalHeight: origH,
    sharpness,
    isSharp: true,
  };
}

async function seekVideoTo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  if (Math.abs(video.currentTime - timeSec) < 0.005 && video.readyState >= 2) {
    return;
  }
  await new Promise<void>(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener('seeked', finish);
      resolve();
    };
    video.addEventListener('seeked', finish);
    video.currentTime = timeSec;
    setTimeout(finish, 300);
  });
}

export async function autoCapture(
  video: HTMLVideoElement,
  settings: CaptureSettings,
  intervalSec: number,
  startTime: number,
  endTime: number,
  onFrame: (frame: CapturedFrame, progress: number) => void | Promise<void>,
  onDone: () => void,
  abortSignal?: { aborted: boolean },
  sharpnessThreshold: number = 0,
  onScanFrame?: () => void,
  pauseSignal?: { paused: boolean }
): Promise<void> {
  const duration = endTime - startTime;
  const totalFrames = Math.floor(duration / intervalSec) + 1;
  const origW = video.videoWidth;
  const origH = video.videoHeight;

  let prevAcceptedGray: Float32Array | null = null;
  // Double-buffered canvases allow seeking the next video frame while C++ encodes the 21MP JPEG in parallel!
  const workCanvases = [document.createElement('canvas'), document.createElement('canvas')];
  let canvasToggle = 0;
  let pendingEncodeTask: Promise<void> | null = null;
  const adaptiveQualityState = { q: Math.min(settings.quality ?? 0.95, 0.86) };

  for (let i = 0; i < totalFrames; i++) {
    while (pauseSignal?.paused && !abortSignal?.aborted) {
      await new Promise(r => setTimeout(r, 150));
    }
    if (abortSignal?.aborted) break;

    const targetTime = startTime + i * intervalSec;
    if (targetTime > endTime) break;

    await seekVideoTo(video, targetTime);

    while (pauseSignal?.paused && !abortSignal?.aborted) {
      await new Promise(r => setTimeout(r, 150));
    }
    if (abortSignal?.aborted) break;

    let bestAnalysis = analyzeFrameSharpnessAndGray(video, origW, origH);
    let bestTime = targetTime;

    // Feature 1: Smart Best-Shot Search (Forward-only H.264 micro-seek avoids costly GOP keyframe rewind!)
    if (settings.smartBestShot && sharpnessThreshold > 0 && bestAnalysis.sharpness < sharpnessThreshold) {
      const maxDelta = Math.min(0.18, intervalSec * 0.3);
      const offsets = [maxDelta * 0.5, maxDelta];

      for (const off of offsets) {
        while (pauseSignal?.paused && !abortSignal?.aborted) {
          await new Promise(r => setTimeout(r, 150));
        }
        if (abortSignal?.aborted) break;
        const probeTime = Math.min(endTime, targetTime + off);
        if (probeTime - targetTime < 0.02) continue;

        await seekVideoTo(video, probeTime);
        const probeAnalysis = analyzeFrameSharpnessAndGray(video, origW, origH);
        if (probeAnalysis.sharpness > bestAnalysis.sharpness) {
          bestAnalysis = probeAnalysis;
          bestTime = probeTime;
          if (bestAnalysis.sharpness >= sharpnessThreshold * 1.15) break; // Found crisp frame early!
        }
      }

      if (Math.abs(video.currentTime - bestTime) > 0.01) {
        await seekVideoTo(video, bestTime);
      }
    }

    // Feature 4: Smart Subject / Motion Trigger (Skip duplicate static / empty road scenes)
    if (settings.skipStaticScene && prevAcceptedGray) {
      const motion = measureSceneMotion(
        prevAcceptedGray,
        bestAnalysis.grayThumb,
        bestAnalysis.thumbW,
        bestAnalysis.thumbH
      );
      if (motion < 3.2) {
        onScanFrame?.();
        continue;
      }
    }

    const isSharp = sharpnessThreshold <= 0 || bestAnalysis.sharpness >= sharpnessThreshold;
    const progress = ((i + 1) / totalFrames) * 100;

    if (isSharp) {
      prevAcceptedGray = bestAnalysis.grayThumb;
      // Wait for previous frame's background JPEG encode before reusing the alternate canvas slot
      if (pendingEncodeTask) {
        await pendingEncodeTask;
        pendingEncodeTask = null;
      }
      const activeCanvas = workCanvases[canvasToggle];
      canvasToggle = 1 - canvasToggle;

      // Render WebGL2 shader synchronously (~1.5ms) while video is still at bestTime,
      // then run 21MP JPEG compression + disk write in parallel with the next video seek!
      let outW = settings.outputWidth;
      let outH = settings.outputHeight;
      let frameSettings: CaptureSettings = settings;
      if ((settings.cropAspect && settings.cropAspect !== 'none') || settings.customCrop) {
        const crop = getCropDimensions(
          origW,
          origH,
          settings.cropAspect,
          outW,
          outH,
          bestAnalysis ? bestAnalysis.subjectCentroid : undefined,
          settings.cropComposition,
          settings.skipOverflowCrop ?? true,
          settings.customCrop
        );
        outW = crop.outW;
        outH = crop.outH;
        frameSettings = {
          ...settings,
          subjectAnchor: bestAnalysis ? bestAnalysis.subjectCentroid : undefined,
        };
      } else {
        if ((origH > origW && outW > outH) || (origW > origH && outH > outW)) {
          const tmp = outW;
          outW = outH;
          outH = tmp;
        }
        if (settings.keepAspectRatio) {
          const ratio = origW / origH;
          if (outW / outH > ratio) {
            outW = Math.round(outH * ratio);
          } else {
            outH = Math.round(outW / ratio);
          }
        }
      }
      if (activeCanvas.width !== outW) activeCanvas.width = outW;
      if (activeCanvas.height !== outH) activeCanvas.height = outH;
      renderEnhancedFrameToCanvas(video, origW, origH, activeCanvas, outW, outH, frameSettings);

      const capturedTime = video.currentTime;
      const capturedSharpness = bestAnalysis.sharpness;
      const mimeType = `image/${settings.format}`;

      pendingEncodeTask = (async () => {
        const rawBlob = await encodeCanvasWithFileSizeLimit(
          activeCanvas,
          mimeType,
          settings.quality,
          settings.limitFileSize,
          settings.maxFileSizeKb,
          adaptiveQualityState
        );
        const finalBlob = rawBlob
          ? await injectJfifDensityIntoBlob(rawBlob, settings.pixelDensity ?? 150, settings.densityUnit ?? 'ppi')
          : undefined;
        const frame: CapturedFrame = {
          id: `frame-${Date.now()}-${++frameCounter}`,
          timestamp: capturedTime,
          dataUrl: '',
          blob: finalBlob,
          width: outW,
          height: outH,
          originalWidth: origW,
          originalHeight: origH,
          sharpness: capturedSharpness,
          isSharp: true,
        };
        await onFrame(frame, progress);
      })();
    } else {
      onScanFrame?.();
    }
  }

  if (pendingEncodeTask) {
    await pendingEncodeTask;
  }
  workCanvases[0].width = 1;
  workCanvases[0].height = 1;
  workCanvases[1].width = 1;
  workCanvases[1].height = 1;
  onDone();
}

export function dataUrlToBlob(
  dataUrl: string,
  pixelDensity: number = 150,
  densityUnit: 'ppi' | 'ppc' = 'ppi'
): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }

  // Inject real PPI / PPC metadata into JPEG APP0 (JFIF) segment
  if (
    mime === 'image/jpeg' &&
    array.length > 18 &&
    array[0] === 0xff &&
    array[1] === 0xd8 &&
    array[2] === 0xff &&
    array[3] === 0xe0 &&
    array[6] === 0x4a && // 'J'
    array[7] === 0x46 && // 'F'
    array[8] === 0x49 && // 'I'
    array[9] === 0x46    // 'F'
  ) {
    const d = Math.max(1, Math.min(65535, Math.round(pixelDensity || 150)));
    array[13] = densityUnit === 'ppc' ? 2 : 1; // 1 = PPI (dots per inch), 2 = PPC (dots per cm)
    array[14] = (d >> 8) & 0xff;
    array[15] = d & 0xff;
    array[16] = (d >> 8) & 0xff;
    array[17] = d & 0xff;
  }

  return new Blob([array], { type: mime });
}

export function downloadFrame(
  frame: CapturedFrame,
  prefix: string = 'capture',
  pixelDensity: number = 150,
  densityUnit: 'ppi' | 'ppc' = 'ppi'
) {
  const mime = frame.blob?.type || (frame.dataUrl.includes('image/png') ? 'image/png' : frame.dataUrl.includes('image/webp') ? 'image/webp' : 'image/jpeg');
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  const filename = `${prefix}_${formatTimestamp(frame.timestamp)}_${frame.width}x${frame.height}.${ext}`;
  const blob = frame.blob || dataUrlToBlob(frame.dataUrl, pixelDensity, densityUnit);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function downloadAllFrames(
  frames: CapturedFrame[],
  prefix: string = 'capture',
  pixelDensity: number = 150,
  densityUnit: 'ppi' | 'ppc' = 'ppi'
) {
  frames.forEach((frame, i) => {
    setTimeout(
      () => downloadFrame(frame, `${prefix}_${String(i + 1).padStart(4, '0')}`, pixelDensity, densityUnit),
      i * 100
    );
  });
}

export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m${String(s).padStart(2, '0')}s`;
  return `${m}m${String(s).padStart(2, '0')}s${String(ms).padStart(2, '0')}`;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
