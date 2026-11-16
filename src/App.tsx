import React, { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import {
  CapturedFrame,
  CaptureSettings,
  CropAspect,
  CropComposition,
  NormalizedCropRect,
  getCropDimensions,
  analyzeFrameSharpnessAndGray,
  captureCurrentFrameAsync,
  HSLChannelKey,
  ColorMixerSettings,
  ColorGradingSettings,
  ColorWheelState,
  WatermarkAnchor,
  WatermarkShape,
  WatermarkSettings,
  HistogramData,
  createDefaultColorMixer,
  createDefaultColorGrading,
  createDefaultWatermarkSettings,
  isGpuAccelerationAvailable,
  autoCapture,
  downloadAllFrames,
  formatTimestamp,
  formatDuration,
  dataUrlToBlob,
  renderComparisonPreview,
} from './videoCapture';

interface VideoItem {
  id: string;
  file: File;
  url: string;
  name: string;
  size: number;
  duration: number;
  width: number;
  height: number;
  ready: boolean;
  frames: CapturedFrame[];
  sharpFrames: number;
  blurFrames: number;
  status: 'queued' | 'loading' | 'capturing' | 'done' | 'error';
}

interface CustomColorPreset {
  id: string;
  name: string;
  denoise: number;
  sharpen: number;
  clarity: number;
  vibrance: number;
  shadowLift: number;
  sat: number;
  con: number;
  bri: number;
  colorMixer: ColorMixerSettings;
  colorGrading: ColorGradingSettings;
}

type Lang = 'en' | 'th';
type ToolTab = 'basic' | 'mixer' | 'grading';
type HSLMode = 'hue' | 'sat' | 'lum';
export type DuplicateMode = 'skip' | 'overwrite' | 'rename';

const ANCHOR_GRID: WatermarkAnchor[] = [
  'tl', 'tc', 'tr',
  'ml', 'mc', 'mr',
  'bl', 'bc', 'br',
];

const CUSTOM_PRESETS_KEY = 'snappro_custom_presets_v1';
const STUDIO_SETTINGS_KEY = 'snappro_studio_settings_v1';

function loadSavedStudioSettings(): Record<string, any> {
  try {
    const raw = localStorage.getItem(STUDIO_SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const HSL_CHANNELS: { key: HSLChannelKey; label: string; color: string }[] = [
  { key: 'red', label: 'Red', color: '#ef4444' },
  { key: 'orange', label: 'Orange', color: '#f97316' },
  { key: 'yellow', label: 'Yellow', color: '#eab308' },
  { key: 'green', label: 'Green', color: '#22c55e' },
  { key: 'aqua', label: 'Aqua', color: '#06b6d4' },
  { key: 'blue', label: 'Blue', color: '#3b82f6' },
  { key: 'purple', label: 'Purple', color: '#a855f7' },
  { key: 'magenta', label: 'Magenta', color: '#ec4899' },
];

const I18N = {
  en: {
    beforeAfter: 'Before / After',
    videoPlayer: 'Video',
    cropTool: '✂️ Drag-Crop (Preview)',
    downloadAll: 'Download All',
    clearAll: 'Clear',
    dropTitle: 'Drop Videos Here or Click to Browse',
    dropSub: 'Supports MP4, MOV, AVI, WEBM — Multi-file supported',
    beforeTag: 'Before',
    afterTag: 'After',
    addVideo: '＋ Add',
    selectFolder: 'Output Folder',
    autoSaveOn: 'Auto-Save ON',
    chooseFolderSub: 'Select folder',
    doneMsg: 'Done! Sharp:',
    filteredBlur: 'Skipped:',
    savedTo: 'Saved:',
    skippedDuplicates: 'Skipped:',
    duplicateFiles: 'Existing Files',
    dupSkip: '⏭ Skip (Do not re-save)',
    dupOverwrite: '덮 Overwrite existing',
    dupRename: '🔢 Auto-Rename (1, 2)',
    filesUnit: 'files',
    readyEmpty: 'Drop videos ➔ Adjust settings on the right ➔ Select folder & Start',
    readySummary: (vCount: number, fCount: number, intv: number) =>
      `Ready: ${vCount} clip(s) (~${fCount} frames) • Every ${intv}s`,
    stopBtn: '⏹ Stop',
    pauseBtn: '⏸ Pause',
    resumeBtn: '▶ Resume',
    startBtn: '🚀 Start',
    histogram: 'HISTOGRAM',
    captureSettings: 'CAPTURE SETTINGS',
    interval: 'Interval',
    size: 'Size',
    pixelDensity: 'Pixel density',
    blurFilter: 'Blur Filter',
    bestShot: '🎯 Best Shot',
    bestShotTip: 'Probes nearby micro-frames to find the sharpest action shot',
    motionOnly: '🏃 Motion Only',
    motionOnlyTip: 'Automatically skips empty or static background frames',
    low: 'Low',
    med: 'Med',
    high: 'High',
    speedMode: 'Speed',
    format: 'Format',
    watermark: 'Watermark',
    addLogo: '＋ Logo PNG',
    changeLogo: 'Change',
    tabBasic: 'Basic',
    tabMixer: 'HSL',
    tabGrading: 'Grading',
    tabWatermark: 'Logo',
    reset: 'Reset',
    savePresetBtn: '＋ Save Preset',
    presetNamePlaceholder: 'Preset name...',
    saveWord: 'Save',
    brightness: '☀️ Brightness',
    shadows: '🌤️ Shadows',
    contrast: '🌗 Contrast',
    vibrance: '🌈 Vibrance',
    saturation: '🎨 Saturation',
    sharpen: '🔪 Sharpen',
    clarity: '💎 Clarity',
    denoise: '🧹 Denoise',
    browserAlert: 'Please use Google Chrome or Microsoft Edge to select an output folder.',
    originalSize: 'Original Size',
    customSize: 'Custom...',
    wheelShadows: 'Shadows',
    wheelMidtones: 'Midtones',
    wheelHighlights: 'Highlights',
    blending: 'Blending',
    balance: 'Balance',
    wheelHint: 'Drag wheel to tint • Double-click to reset',
  },
  th: {
    beforeAfter: 'ก่อน / หลัง',
    videoPlayer: 'วิดีโอ',
    cropTool: '✂️ ลาก Crop (Preview)',
    downloadAll: 'ดาวน์โหลด',
    clearAll: 'ล้าง',
    dropTitle: 'ลากไฟล์วิดีโอมาวาง หรือคลิกเพื่อเลือกไฟล์',
    dropSub: 'รองรับ MP4, MOV, AVI, WEBM — เลือกหลายไฟล์ได้',
    beforeTag: 'ก่อนแต่ง',
    afterTag: 'หลังแต่ง',
    addVideo: '＋ เพิ่มไฟล์',
    selectFolder: 'โฟลเดอร์บันทึก',
    autoSaveOn: 'Auto-Save เปิดอยู่',
    chooseFolderSub: 'คลิกเลือกโฟลเดอร์',
    doneMsg: 'เสร็จสิ้น! ภาพชัด:',
    filteredBlur: 'คัดออก:',
    savedTo: 'บันทึกแล้ว:',
    skippedDuplicates: 'ข้ามไฟล์เดิม:',
    duplicateFiles: 'ไฟล์ที่มีอยู่แล้ว',
    dupSkip: '⏭ ข้ามไฟล์เดิม (ไม่เซฟซ้ำ)',
    dupOverwrite: '덮 เขียนทับไฟล์เดิม',
    dupRename: '🔢 เปลี่ยนชื่ออัตโนมัติ (1, 2)',
    filesUnit: 'ไฟล์',
    readyEmpty: 'เลือกวิดีโอ ➔ ตั้งค่าแถบขวา ➔ เลือกโฟลเดอร์แล้วกด Start',
    readySummary: (vCount: number, fCount: number, intv: number) =>
      `พร้อม: ${vCount} คลิป (~${fCount} ภาพ) • แคปทุก ${intv} วิ`,
    stopBtn: '⏹ ยกเลิก',
    pauseBtn: '⏸ พักชั่วคราว',
    resumeBtn: '▶ ทำงานต่อ',
    startBtn: '🚀 เริ่ม',
    histogram: 'ฮิสโตแกรม (HISTOGRAM)',
    captureSettings: 'ตั้งค่าการแคป (CAPTURE)',
    interval: 'ความถี่',
    size: 'ขนาดภาพ',
    pixelDensity: 'ความละเอียด (Pixel density)',
    blurFilter: 'คัดเบลอ',
    bestShot: '🎯 หาช็อตชัดสุด',
    bestShotTip: 'สแกนเฟรมใกล้เคียงอัตโนมัติเพื่อดึงจังหวะที่ชัดที่สุด',
    motionOnly: '🏃 เฉพาะมีคน/เคลื่อนไหว',
    motionOnlyTip: 'ข้ามช่วงถนนว่างหรือภาพนิ่งซ้ำๆ อัตโนมัติ',
    low: 'ต่ำ',
    med: 'กลาง',
    high: 'สูง',
    speedMode: 'ความเร็ว',
    format: 'ไฟล์',
    watermark: 'ลายน้ำ/โลโก้',
    addLogo: '＋ เลือกโลโก้',
    changeLogo: 'เปลี่ยน',
    tabBasic: 'Basic',
    tabMixer: 'HSL',
    tabGrading: 'Grading',
    tabWatermark: 'Logo',
    reset: 'รีเซ็ต',
    savePresetBtn: '＋ บันทึกโทนสี',
    presetNamePlaceholder: 'ชื่อโทนสี...',
    saveWord: 'บันทึก',
    brightness: '☀️ ความสว่าง',
    shadows: '🌤️ เปิดเงามืด',
    contrast: '🌗 คอนทราสต์',
    vibrance: '🌈 ความแน่นสี',
    saturation: '🎨 ความสดสี',
    sharpen: '🔪 ความคมชัด',
    clarity: '💎 มิติภาพ',
    denoise: '🧹 ลดนอยส์',
    browserAlert: 'แนะนำให้ใช้ Google Chrome หรือ Microsoft Edge เพื่อเลือกโฟลเดอร์ครับ',
    originalSize: 'ขนาดต้นฉบับ',
    customSize: 'กำหนดเอง...',
    wheelShadows: 'Shadows',
    wheelMidtones: 'Midtones',
    wheelHighlights: 'Highlights',
    blending: 'Blending',
    balance: 'Balance',
    wheelHint: 'ลากในวงล้อเพื่อย้อมสี • ดับเบิลคลิกเพื่อรีเซ็ต',
  },
};

const SIZE_OPTIONS = [
  { id: 'original', labelKey: 'originalSize' as const, w: 0, h: 0 },
  { id: 'crop-4-3-auto', label: '📷 4:3 ขนาดปกติ (ตามต้นฉบับ)', w: 0, h: 0, crop: '4:3' as CropAspect },
  { id: 'crop-4-3-hd', label: '📷 4:3 HD (1440×1080)', w: 1440, h: 1080, crop: '4:3' as CropAspect },
  { id: 'crop-4-3-2k', label: '📷 4:3 2K (2048×1536)', w: 2048, h: 1536, crop: '4:3' as CropAspect },
  { id: 'crop-4-3-4k', label: '📷 4:3 4K (2880×2160)', w: 2880, h: 2160, crop: '4:3' as CropAspect },
  { id: 'crop-4-3-max', label: '📷 4:3 5.7K (5760×4320)', w: 5760, h: 4320, crop: '4:3' as CropAspect },
  { id: 'crop-2-3-auto', label: '📷 2:3 ขนาดปกติ (ตามต้นฉบับ)', w: 0, h: 0, crop: '2:3' as CropAspect },
  { id: 'crop-1-2-auto', label: '📷 1:2 แนวตั้ง (ตามต้นฉบับ)', w: 0, h: 0, crop: '1:2' as CropAspect },
  { id: 'fhd', label: 'Full HD (1920×1080) • 16:9', w: 1920, h: 1080 },
  { id: '4k', label: '4K UHD (3840×2160) • 16:9', w: 3840, h: 2160 },
  { id: '8k', label: '8K UHD (7680×4320) • 16:9', w: 7680, h: 4320 },
  { id: 'nikon-fx-l', label: 'Nikon FX-L (8256×4640) • 16:9', w: 8256, h: 4640 },
  { id: 'nikon-fx-m', label: 'Nikon FX-M (6192×3480) • 16:9', w: 6192, h: 3480 },
  { id: 'nikon-fx-s', label: 'Nikon FX-S (4128×2320) • 16:9', w: 4128, h: 2320 },
  { id: 'nikon-dx-l', label: 'Nikon DX-L (5408×3600) • 3:2', w: 5408, h: 3600 },
  { id: 'nikon-dx-m', label: 'Nikon DX-M (4048×2696) • 3:2', w: 4048, h: 2696 },
  { id: 'nikon-1-1', label: 'Nikon 1:1 (5504×5504) • 1:1', w: 5504, h: 5504, crop: '1:1' as CropAspect },
  { id: 'custom', labelKey: 'customSize' as const, w: -1, h: -1 },
];

const INTERVAL_OPTIONS = [0.5, 1, 2, 3, 5, 10];

const ENHANCE_MODELS = [
  {
    id: 'standard',
    labelEn: '✨ Standard',
    labelTh: '✨ สมดุล',
    denoise: 25, sharpen: 35, clarity: 25, vibrance: 35, shadowLift: 15, sat: 112, con: 105, bri: 100,
  },
  {
    id: 'high-fidelity',
    labelEn: '💎 High Fidelity',
    labelTh: '💎 คมกริบ',
    denoise: 15, sharpen: 60, clarity: 45, vibrance: 30, shadowLift: 10, sat: 110, con: 108, bri: 100,
  },
  {
    id: 'sport-hdr',
    labelEn: '🔥 Sport Vivid',
    labelTh: '🔥 สีสดกีฬา',
    denoise: 20, sharpen: 45, clarity: 40, vibrance: 65, shadowLift: 35, sat: 125, con: 112, bri: 102,
  },
  {
    id: 'lowres-deblock',
    labelEn: '🛠️ Denoise',
    labelTh: '🛠️ ลดนอยส์',
    denoise: 60, sharpen: 45, clarity: 30, vibrance: 30, shadowLift: 20, sat: 110, con: 106, bri: 100,
  },
  {
    id: 'original',
    labelEn: '📷 Original',
    labelTh: '📷 ต้นฉบับ',
    denoise: 0, sharpen: 0, clarity: 0, vibrance: 0, shadowLift: 0, sat: 100, con: 100, bri: 100,
  },
];

// ============ Lightroom-Style Color Wheel Component ============
function ColorWheelControl({
  title,
  value,
  size = 56,
  onChange,
  onReset,
}: {
  title: string;
  value: ColorWheelState;
  size?: number;
  onChange: (next: ColorWheelState) => void;
  onReset: () => void;
}) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const updateFromPointer = (clientX: number, clientY: number) => {
    if (!wheelRef.current) return;
    const rect = wheelRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const radius = rect.width / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.min(radius, Math.sqrt(dx * dx + dy * dy));
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    const sat = Math.round((dist / radius) * 100);
    onChange({ ...value, hue: Math.round(deg), sat });
  };

  const half = size / 2;
  const maxR = half - 5;
  const rad = (value.hue * Math.PI) / 180;
  const normDist = (value.sat / 100) * maxR;
  const dotX = half + Math.cos(rad) * normDist;
  const dotY = half + Math.sin(rad) * normDist;

  return (
    <div className="lr-wheel-unit">
      <div className="lr-wheel-label">{title}</div>
      <div
        ref={wheelRef}
        className="lr-wheel-circle"
        style={{ width: size, height: size }}
        onMouseDown={e => {
          draggingRef.current = true;
          updateFromPointer(e.clientX, e.clientY);
        }}
        onMouseMove={e => {
          if (draggingRef.current) updateFromPointer(e.clientX, e.clientY);
        }}
        onMouseUp={() => { draggingRef.current = false; }}
        onMouseLeave={() => { draggingRef.current = false; }}
        onDoubleClick={onReset}
        title="Drag to tint • Double-click to reset"
      >
        <div className="lr-wheel-center-cross" />
        <div
          className="lr-wheel-handle"
          style={{
            left: `${dotX}px`,
            top: `${dotY}px`,
            background: value.sat > 0 ? `hsl(${value.hue}, 90%, 55%)` : 'transparent',
          }}
        />
      </div>
      <div className="lr-wheel-slider-wrap" style={{ width: size + 12 }}>
        <input
          type="range"
          min={-100}
          max={100}
          value={value.lum}
          onChange={e => onChange({ ...value, lum: Number(e.target.value) })}
          onDoubleClick={() => onChange({ ...value, lum: 0 })}
          title={`Luminance: ${value.lum}`}
        />
      </div>
    </div>
  );
}

// ============ SVG RGB Histogram Component ============
function HistogramGraph({ data }: { data: HistogramData | null }) {
  const buildPath = (arr: number[]) => {
    if (!arr || arr.length === 0) return '';
    const w = 300;
    const h = 60;
    const pts = arr.map((v, i) => {
      const x = (i / (arr.length - 1)) * w;
      const y = h - Math.min(1, v) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M0,${h} L${pts.join(' L')} L${w},${h} Z`;
  };

  return (
    <div className="histogram-box">
      {data ? (
        <svg viewBox="0 0 300 60" className="histogram-svg" preserveAspectRatio="none">
          <line x1="75" y1="0" x2="75" y2="60" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          <line x1="150" y1="0" x2="150" y2="60" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          <line x1="225" y1="0" x2="225" y2="60" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          <path d={buildPath(data.lum)} fill="rgba(255,255,255,0.24)" />
          <path d={buildPath(data.r)} fill="rgba(239,68,68,0.5)" style={{ mixBlendMode: 'screen' }} />
          <path d={buildPath(data.g)} fill="rgba(34,197,94,0.5)" style={{ mixBlendMode: 'screen' }} />
          <path d={buildPath(data.b)} fill="rgba(59,130,246,0.55)" style={{ mixBlendMode: 'screen' }} />
        </svg>
      ) : (
        <div className="histogram-empty">No video signal</div>
      )}
    </div>
  );
}

let _id = 0;
const uid = () => `v-${Date.now()}-${++_id}`;
const fmtSize = (b: number) => b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;

// Background Audio Keep-Alive
// macOS App Nap & WebKit media occlusion throttler suspends canvas/timer decode when minimized.
// Playing inaudible sound marks the WebContent process as an active media session,
// preventing throttling and maintaining 100% processing throughput even when minimized to the Dock.
let keepAliveAudioCtx: AudioContext | null = null;
let keepAliveOsc: OscillatorNode | null = null;

function startKeepAliveEngine() {
  try {
    if (!keepAliveAudioCtx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        keepAliveAudioCtx = new AudioCtx();
        const osc = keepAliveAudioCtx.createOscillator();
        const gain = keepAliveAudioCtx.createGain();
        gain.gain.value = 0.00001; // completely inaudible
        osc.connect(gain);
        gain.connect(keepAliveAudioCtx.destination);
        osc.start();
        keepAliveOsc = osc;
        if (keepAliveAudioCtx.state === 'suspended') {
          keepAliveAudioCtx.resume();
        }
      }
    } else if (keepAliveAudioCtx.state === 'suspended') {
      keepAliveAudioCtx.resume();
    }
  } catch (e) {
    console.warn('Keep-alive engine init error:', e);
  }
}

function stopKeepAliveEngine() {
  try {
    if (keepAliveOsc) {
      keepAliveOsc.stop();
      keepAliveOsc.disconnect();
      keepAliveOsc = null;
    }
    if (keepAliveAudioCtx) {
      keepAliveAudioCtx.close();
      keepAliveAudioCtx = null;
    }
  } catch {}
}

interface InteractiveCropEditorProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  activeVideo: VideoItem;
  customCrop: NormalizedCropRect | null;
  onCropChange: (crop: NormalizedCropRect | null) => void;
  cropAspectLock: '4:3' | '16:9' | '3:2' | '1:1' | 'free';
  onCropAspectLockChange: (mode: '4:3' | '16:9' | '3:2' | '1:1' | 'free') => void;
  cropAspect: CropAspect;
  onCropAspectChange: (aspect: CropAspect) => void;
  cropComposition: CropComposition;
  onCropCompositionChange: (comp: CropComposition) => void;
  settings: CaptureSettings;
  onCaptureTest: () => void;
  onClose: () => void;
  lang: 'th' | 'en';
}

function InteractiveCropEditor({
  videoRef,
  activeVideo,
  customCrop,
  onCropChange,
  cropAspectLock,
  onCropAspectLockChange,
  cropAspect,
  onCropAspectChange,
  cropComposition,
  onCropCompositionChange,
  settings,
  onCaptureTest,
  onClose,
  lang,
}: InteractiveCropEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const [stageDim, setStageDim] = useState<{ w: number; h: number }>({ w: 800, h: 600 });
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isAiScanning, setIsAiScanning] = useState<boolean>(false);

  const vw = activeVideo.width || 1920;
  const vh = activeVideo.height || 1080;
  const isPortrait = vh > vw;

  // คำนวณอัตราส่วนตามโหมดล็อค (Lock Aspect Ratio)
  // สำหรับวิดีโอแนวตั้ง (9:16 เช่น Nikon Z8):
  // 4:3 หมายถึง 3:4 (กว้าง 3 ยาว 4 หรือ 1080x1440) เพื่อให้รับกับแนวตั้ง
  const targetRatio = (() => {
    switch (cropAspectLock) {
      case '4:3':
        return isPortrait ? 3 / 4 : 4 / 3;
      case '16:9':
        return isPortrait ? 9 / 16 : 16 / 9;
      case '3:2':
        return isPortrait ? 2 / 3 : 3 / 2;
      case '1:1':
        return 1.0;
      case 'free':
      default:
        return null;
    }
  })();

  // คำนวณกรอบเริ่มต้น (Default Normalized Crop Box)
  const computeDefaultCrop = useCallback((): NormalizedCropRect => {
    if (targetRatio) {
      // ต้องการอัตราส่วน (w_px / h_px) = targetRatio
      // ในหน่วย normalized: (w_norm * vw) / (h_norm * vh) = targetRatio
      // => h_norm = w_norm * (vw / vh) / targetRatio
      const videoRatio = vw / vh;
      if (targetRatio < videoRatio) {
        // จำกัดด้วยความสูง (สูงเต็ม 1.0)
        const h = 1.0;
        const w = (h * targetRatio) / videoRatio;
        return {
          x: Math.max(0, (1 - w) / 2),
          y: 0,
          w: Math.min(1, w),
          h: 1.0,
        };
      } else {
        // จำกัดด้วยความกว้าง (กว้างเต็ม 1.0)
        const w = 1.0;
        const h = (w * videoRatio) / targetRatio;
        return {
          x: 0,
          y: Math.max(0, (1 - h) / 2),
          w: 1.0,
          h: Math.min(1, h),
        };
      }
    }
    return { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
  }, [targetRatio, vw, vh]);

  const [crop, setCrop] = useState<NormalizedCropRect>(() => {
    return customCrop || computeDefaultCrop();
  });

  // ซิงค์กับ customCrop จากภายนอก
  useEffect(() => {
    if (customCrop) {
      setCrop(customCrop);
    }
  }, [customCrop]);

  // สังเกตขนาด Stage เพื่อคำนวณพื้นที่จัดวาง Canvas ให้พอดี
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 50 && height > 50) {
          setStageDim({ w: width, h: height });
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // คำนวณขนาด Display ของ Canvas ใน Stage โดยรักษาสัดส่วนวิดีโอ (Aspect Ratio Fit)
  const maxW = Math.max(100, stageDim.w - 32);
  const maxH = Math.max(100, stageDim.h - 32);
  const videoRatio = vw / vh;
  let dispW = maxW;
  let dispH = maxH;
  if (maxW / maxH > videoRatio) {
    dispH = maxH;
    dispW = maxH * videoRatio;
  } else {
    dispW = maxW;
    dispH = maxW / videoRatio;
  }

  // วาดเฟรมวิดีโอปัจจุบันลง baseCanvas และตัดส่วนลง previewCanvas
  const renderFrameAndPreview = useCallback(() => {
    const vid = videoRef.current;
    if (!vid || vid.readyState < 2) return;

    // 1. Draw base video frame
    const baseCanvas = baseCanvasRef.current;
    if (baseCanvas) {
      if (baseCanvas.width !== Math.round(dispW) || baseCanvas.height !== Math.round(dispH)) {
        baseCanvas.width = Math.round(dispW);
        baseCanvas.height = Math.round(dispH);
      }
      const bCtx = baseCanvas.getContext('2d');
      if (bCtx) {
        bCtx.drawImage(vid, 0, 0, dispW, dispH);
      }
    }

    // 2. Draw cropped region to Live Preview canvas (100% True Optical Crop, No Distortion)
    const prevCanvas = previewCanvasRef.current;
    if (prevCanvas) {
      const srcCropX = Math.round(crop.x * vw);
      const srcCropY = Math.round(crop.y * vh);
      const srcCropW = Math.max(10, Math.round(crop.w * vw));
      const srcCropH = Math.max(10, Math.round(crop.h * vh));

      // Sizing preview canvas maintaining the cropped aspect ratio
      const prevBoxW = 240;
      const prevBoxH = Math.round((prevBoxW * srcCropH) / srcCropW);

      if (prevCanvas.width !== srcCropW || prevCanvas.height !== srcCropH) {
        prevCanvas.width = srcCropW;
        prevCanvas.height = srcCropH;
      }
      const pCtx = prevCanvas.getContext('2d');
      if (pCtx) {
        pCtx.drawImage(vid, srcCropX, srcCropY, srcCropW, srcCropH, 0, 0, srcCropW, srcCropH);
      }
    }
  }, [crop, dispW, dispH, videoRef, vw, vh]);

  // วาดทันทีเมื่อ crop, dispW, dispH หรือ video time เปลี่ยน
  useEffect(() => {
    renderFrameAndPreview();
  }, [renderFrameAndPreview, currentTime]);

  // Animation Loop ขณะวิดีโอกำลังเล่น
  useEffect(() => {
    let animId: number;
    const loop = () => {
      const vid = videoRef.current;
      if (vid && !vid.paused && !vid.ended) {
        setCurrentTime(vid.currentTime);
        renderFrameAndPreview();
        animId = requestAnimationFrame(loop);
      }
    };
    if (isPlaying) {
      animId = requestAnimationFrame(loop);
    }
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, renderFrameAndPreview, videoRef]);

  // ซิงค์เวลาจากวิดีโอจริง
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const onTime = () => setCurrentTime(vid.currentTime);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    vid.addEventListener('timeupdate', onTime);
    vid.addEventListener('play', onPlay);
    vid.addEventListener('pause', onPause);
    return () => {
      vid.removeEventListener('timeupdate', onTime);
      vid.removeEventListener('play', onPlay);
      vid.removeEventListener('pause', onPause);
    };
  }, [videoRef]);

  // ตำแหน่งพิกเซลของกล่อง Crop บนหน้าจอ
  const boxX = crop.x * dispW;
  const boxY = crop.y * dispH;
  const boxW = Math.max(20, crop.w * dispW);
  const boxH = Math.max(20, crop.h * dispH);

  // คำนวณพิกเซลจริงที่จะถูกตัด
  const realCropW = Math.round(crop.w * vw);
  const realCropH = Math.round(crop.h * vh);

  // Drag & Resize State
  const [dragState, setDragState] = useState<{
    type: 'move' | 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'w' | 'e';
    startX: number;
    startY: number;
    startCrop: NormalizedCropRect;
  } | null>(null);

  const handlePointerDown = (
    e: React.PointerEvent,
    type: 'move' | 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'w' | 'e'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragState({
      type,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: { ...crop },
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState) return;
    e.preventDefault();
    const dxNorm = (e.clientX - dragState.startX) / dispW;
    const dyNorm = (e.clientY - dragState.startY) / dispH;
    const sc = dragState.startCrop;

    let nextCrop = { ...sc };

    if (dragState.type === 'move') {
      const newX = Math.max(0, Math.min(1 - sc.w, sc.x + dxNorm));
      const newY = Math.max(0, Math.min(1 - sc.h, sc.y + dyNorm));
      nextCrop = { ...sc, x: newX, y: newY };
    } else {
      // Handles Resize
      const aspectMult = targetRatio ? (vw / vh) / targetRatio : null;

      if (dragState.type === 'se') {
        let newW = Math.max(0.05, Math.min(1 - sc.x, sc.w + dxNorm));
        let newH = aspectMult ? newW * aspectMult : Math.max(0.05, Math.min(1 - sc.y, sc.h + dyNorm));
        if (sc.y + newH > 1) {
          newH = 1 - sc.y;
          if (aspectMult) newW = newH / aspectMult;
        }
        nextCrop = { ...sc, w: Math.min(1 - sc.x, newW), h: Math.min(1 - sc.y, newH) };
      } else if (dragState.type === 'sw') {
        let newW = Math.max(0.05, Math.min(sc.x + sc.w, sc.w - dxNorm));
        let newH = aspectMult ? newW * aspectMult : Math.max(0.05, Math.min(1 - sc.y, sc.h + dyNorm));
        if (sc.y + newH > 1) {
          newH = 1 - sc.y;
          if (aspectMult) newW = newH / aspectMult;
        }
        const newX = sc.x + (sc.w - newW);
        nextCrop = { x: Math.max(0, newX), y: sc.y, w: newW, h: newH };
      } else if (dragState.type === 'ne') {
        let newW = Math.max(0.05, Math.min(1 - sc.x, sc.w + dxNorm));
        let newH = aspectMult ? newW * aspectMult : Math.max(0.05, Math.min(sc.y + sc.h, sc.h - dyNorm));
        if (sc.y + sc.h - newH < 0) {
          newH = sc.y + sc.h;
          if (aspectMult) newW = newH / aspectMult;
        }
        const newY = sc.y + (sc.h - newH);
        nextCrop = { x: sc.x, y: Math.max(0, newY), w: newW, h: newH };
      } else if (dragState.type === 'nw') {
        let newW = Math.max(0.05, Math.min(sc.x + sc.w, sc.w - dxNorm));
        let newH = aspectMult ? newW * aspectMult : Math.max(0.05, Math.min(sc.y + sc.h, sc.h - dyNorm));
        if (sc.y + sc.h - newH < 0) {
          newH = sc.y + sc.h;
          if (aspectMult) newW = newH / aspectMult;
        }
        const newX = sc.x + (sc.w - newW);
        const newY = sc.y + (sc.h - newH);
        nextCrop = { x: Math.max(0, newX), y: Math.max(0, newY), w: newW, h: newH };
      } else if (dragState.type === 'n') {
        let newH = Math.max(0.05, Math.min(sc.y + sc.h, sc.h - dyNorm));
        let newW = aspectMult ? newH / aspectMult : sc.w;
        const newY = sc.y + (sc.h - newH);
        const newX = aspectMult ? Math.max(0, Math.min(1 - newW, sc.x + (sc.w - newW) / 2)) : sc.x;
        nextCrop = { x: newX, y: Math.max(0, newY), w: newW, h: newH };
      } else if (dragState.type === 's') {
        let newH = Math.max(0.05, Math.min(1 - sc.y, sc.h + dyNorm));
        let newW = aspectMult ? newH / aspectMult : sc.w;
        const newX = aspectMult ? Math.max(0, Math.min(1 - newW, sc.x + (sc.w - newW) / 2)) : sc.x;
        nextCrop = { x: newX, y: sc.y, w: newW, h: newH };
      } else if (dragState.type === 'w') {
        let newW = Math.max(0.05, Math.min(sc.x + sc.w, sc.w - dxNorm));
        let newH = aspectMult ? newW * aspectMult : sc.h;
        const newX = sc.x + (sc.w - newW);
        const newY = aspectMult ? Math.max(0, Math.min(1 - newH, sc.y + (sc.h - newH) / 2)) : sc.y;
        nextCrop = { x: Math.max(0, newX), y: newY, w: newW, h: newH };
      } else if (dragState.type === 'e') {
        let newW = Math.max(0.05, Math.min(1 - sc.x, sc.w + dxNorm));
        let newH = aspectMult ? newW * aspectMult : sc.h;
        const newY = aspectMult ? Math.max(0, Math.min(1 - newH, sc.y + (sc.h - newH) / 2)) : sc.y;
        nextCrop = { x: sc.x, y: newY, w: newW, h: newH };
      }
    }

    setCrop(nextCrop);
    onCropChange(nextCrop);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragState) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      setDragState(null);
    }
  };

  // 🎯 AI Auto-Center Subject: รองรับทั้งโหมด "วัดใบหน้าเป็นหลัก (face)" และ "จัดคนอยู่กึ่งกลางเต็มตัว (body)"
  const handleAiCenterSubject = (aiMode: 'face' | 'body' = 'face') => {
    const vid = videoRef.current;
    if (!vid) return;
    setIsAiScanning(true);
    try {
      const analysis = analyzeFrameSharpnessAndGray(vid, vw, vh);
      if (analysis && analysis.subjectCentroid) {
        const sc = analysis.subjectCentroid;
        const targetX = aiMode === 'face' ? (sc.faceXNorm ?? sc.xNorm) : sc.xNorm;
        const newX = Math.max(0, Math.min(1 - crop.w, targetX - crop.w / 2));
        const headNorm = sc.headYNorm ?? Math.max(0.12, sc.yNorm - 0.34);

        let newY = Math.max(0, Math.min(1 - crop.h, sc.yNorm - crop.h / 2));
        if (isPortrait) {
          if (aiMode === 'face') {
            // 👤 วัดใบหน้าเป็นหลัก: ล็อคพื้นที่เหนือศีรษะ ~7.2% ของความสูงกรอบ Crop
            newY = Math.max(0, Math.min(1 - crop.h, headNorm - crop.h * 0.072));
          } else {
            // 🧍 คนอยู่กึ่งกลางเต็มตัว: คำนวณจุดกึ่งกลางตั้งแต่ศีรษะจรดปลายเท้า
            const estFeetNorm = Math.min(0.89, headNorm + 0.65);
            const bodyCenterNorm = (headNorm + estFeetNorm) * 0.5;
            newY = Math.max(0, Math.min(1 - crop.h, bodyCenterNorm - crop.h * 0.5));
            const maxAllowedY = Math.max(0, headNorm - crop.h * 0.068);
            if (newY > maxAllowedY) newY = maxAllowedY;
          }
        }

        const nextCrop = { ...crop, x: newX, y: newY };
        setCrop(nextCrop);
        onCropChange(nextCrop);
        onCropCompositionChange(aiMode === 'face' ? 'face' : '1:2');
      }
    } catch (e) {
      console.warn('AI detect failed:', e);
    } finally {
      setIsAiScanning(false);
    }
  };

  // ⟲ จัดกึ่งกลางเฟรม
  const handleCenterCrop = () => {
    const nextCrop = {
      ...crop,
      x: Math.max(0, (1 - crop.w) / 2),
      y: Math.max(0, (1 - crop.h) / 2),
    };
    setCrop(nextCrop);
    onCropChange(nextCrop);
  };

  // เปลี่ยนโหมดอัตราส่วน (4:3, 16:9, 3:2, 1:1, Free)
  const handleSelectAspectLock = (mode: '4:3' | '16:9' | '3:2' | '1:1' | 'free') => {
    onCropAspectLockChange(mode);
    if (mode === '4:3') {
      onCropAspectChange('4:3');
    } else if (mode === '16:9') {
      onCropAspectChange('16:9');
    } else if (mode === '3:2') {
      onCropAspectChange('3:2');
    } else if (mode === '1:1') {
      onCropAspectChange('1:1');
    }

    if (mode === 'free') return;

    // คำนวณ ratio ใหม่
    const newRatio = (() => {
      switch (mode) {
        case '4:3': return isPortrait ? 3 / 4 : 4 / 3;
        case '16:9': return isPortrait ? 9 / 16 : 16 / 9;
        case '3:2': return isPortrait ? 2 / 3 : 3 / 2;
        case '1:1': return 1.0;
        default: return 1.0;
      }
    })();

    const videoRatio = vw / vh;
    let newW = crop.w;
    let newH = (newW * videoRatio) / newRatio;
    if (newH > 1) {
      newH = 1.0;
      newW = (newH * newRatio) / videoRatio;
    }
    const newX = Math.max(0, Math.min(1 - newW, crop.x));
    const newY = Math.max(0, Math.min(1 - newH, crop.y));
    const nextCrop = { x: newX, y: newY, w: newW, h: newH };
    setCrop(nextCrop);
    onCropChange(nextCrop);
  };

  // สลับเล่น/หยุด
  const togglePlay = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      vid.play();
    } else {
      vid.pause();
    }
  };

  // ก้าวเฟรมทีละ 1 เฟรม (ประมาณ 1/25 วินาที = 0.04s)
  const stepFrame = (delta: number) => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.pause();
    const frameTime = 1 / 25;
    const newT = Math.max(0, Math.min(vid.duration || 10, vid.currentTime + delta * frameTime));
    vid.currentTime = newT;
    setCurrentTime(newT);
  };

  return (
    <div className="crop-studio-layout">
      {/* 1. TOP TOOLBAR */}
      <div className="crop-top-bar">
        <div className="crop-top-left">
          <div className="crop-title-badge">
            <span>✂️ ลาก Crop (Interactive)</span>
          </div>

          {/* อัตราส่วนล็อค (Lock Aspect Ratio) */}
          <div className="crop-ratio-group">
            <button
              type="button"
              className={`crop-ratio-btn ${cropAspectLock === '4:3' ? 'active' : ''}`}
              onClick={() => handleSelectAspectLock('4:3')}
              title={isPortrait ? 'ล็อค 3:4 (4:3 แนวตั้งสำหรับ Nikon Z8)' : 'ล็อค 4:3'}
            >
              📷 4:3 {isPortrait ? '(3:4 แนวตั้ง)' : ''}
            </button>
            <button
              type="button"
              className={`crop-ratio-btn ${cropAspectLock === '16:9' ? 'active' : ''}`}
              onClick={() => handleSelectAspectLock('16:9')}
            >
              16:9 {isPortrait ? '(9:16)' : ''}
            </button>
            <button
              type="button"
              className={`crop-ratio-btn ${cropAspectLock === '3:2' ? 'active' : ''}`}
              onClick={() => handleSelectAspectLock('3:2')}
            >
              3:2
            </button>
            <button
              type="button"
              className={`crop-ratio-btn ${cropAspectLock === '1:1' ? 'active' : ''}`}
              onClick={() => handleSelectAspectLock('1:1')}
            >
              1:1
            </button>
            <button
              type="button"
              className={`crop-ratio-btn ${cropAspectLock === 'free' ? 'active' : ''}`}
              onClick={() => handleSelectAspectLock('free')}
            >
              🔓 อิสระ
            </button>
          </div>
        </div>

        {/* แอคชันด่วน */}
        <div className="crop-top-actions">
          <button
            type="button"
            className="crop-action-btn ai-btn"
            onClick={() => handleAiCenterSubject('face')}
            disabled={isAiScanning}
            title="AI วัดใบหน้าและศีรษะเป็นหลัก พร้อมเว้นพื้นที่เหนือศีรษะอัตโนมัติ (หัวไม่ขาด 100%)"
          >
            {isAiScanning ? '⏳...' : '👤 AI วัดหน้าเป็นหลัก'}
          </button>
          <button
            type="button"
            className="crop-action-btn ai-btn"
            style={{ background: 'linear-gradient(135deg, #0284c7, #2563eb)', borderColor: '#0284c7' }}
            onClick={() => handleAiCenterSubject('body')}
            disabled={isAiScanning}
            title="AI คำนวณความสูงตั้งแต่ศีรษะจรดปลายเท้า แล้ววางตัวแบบให้อยู่กึ่งกลางเฟรม"
          >
            🧍 AI คนกึ่งกลาง
          </button>
          <button
            type="button"
            className="crop-action-btn"
            onClick={handleCenterCrop}
            title="จัดกรอบไว้กึ่งกลางภาพพอดี"
          >
            ⟲ กึ่งกลางจอ
          </button>
          <button
            type="button"
            className="crop-action-btn"
            onClick={() => {
              const full: NormalizedCropRect = { x: 0, y: 0, w: 1, h: 1 };
              setCrop(full);
              onCropChange(full);
            }}
            title="ขยายกรอบเต็มเฟรม 100%"
          >
            เต็มจอ
          </button>
          <button
            type="button"
            className="crop-action-btn snap-btn"
            onClick={onCaptureTest}
            title="แคปและบันทึกภาพเฟรมนี้ตามกรอบ Crop ทันทีเพื่อตรวจสอบ"
          >
            📸 แคปทดสอบเฟรมนี้
          </button>
          <button
            type="button"
            className="crop-action-btn close-btn"
            onClick={onClose}
            title="เสร็จสิ้นและกลับสู่หน้าเปรียบเทียบ ก่อน/หลัง"
          >
            ✓ นำกรอบนี้ไปใช้ & ปิด
          </button>
        </div>
      </div>

      {/* 2. MAIN WORKSPACE */}
      <div className="crop-workspace" ref={containerRef}>
        <div className="crop-stage">
          <div
            className="crop-canvas-box"
            style={{ width: Math.round(dispW), height: Math.round(dispH) }}
          >
            {/* Base Video Frame Canvas */}
            <canvas ref={baseCanvasRef} className="crop-base-canvas" />

            {/* Dark Mask Outside Crop Area */}
            <svg className="crop-svg-mask">
              <path
                fill="rgba(0, 0, 0, 0.65)"
                fillRule="evenodd"
                d={`M 0 0 L ${dispW} 0 L ${dispW} ${dispH} L 0 ${dispH} Z M ${boxX} ${boxY} L ${boxX} ${boxY + boxH} L ${boxX + boxW} ${boxY + boxH} L ${boxX + boxW} ${boxY} Z`}
              />
            </svg>

            {/* Interactive Crop Box Overlay */}
            <div
              className={`crop-interactive-box ${dragState ? 'dragging' : ''}`}
              style={{
                left: boxX,
                top: boxY,
                width: boxW,
                height: boxH,
              }}
              onPointerDown={e => handlePointerDown(e, 'move')}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              {/* Rule-of-Thirds Grid (เส้นตารางจุดตัดเก้าช่อง 1:2 และ 2:3) */}
              <div className="crop-rule-grid">
                <div className="crop-grid-v1" />
                <div className="crop-grid-v2" />
                <div className="crop-grid-h1" />
                <div className="crop-grid-h2" />
                <div className="crop-center-target" />
              </div>

              {/* 8 Resize Handles */}
              <div className="crop-handle crop-handle-nw" onPointerDown={e => handlePointerDown(e, 'nw')} />
              <div className="crop-handle crop-handle-ne" onPointerDown={e => handlePointerDown(e, 'ne')} />
              <div className="crop-handle crop-handle-se" onPointerDown={e => handlePointerDown(e, 'se')} />
              <div className="crop-handle crop-handle-sw" onPointerDown={e => handlePointerDown(e, 'sw')} />
              <div className="crop-handle crop-handle-n" onPointerDown={e => handlePointerDown(e, 'n')} />
              <div className="crop-handle crop-handle-s" onPointerDown={e => handlePointerDown(e, 's')} />
              <div className="crop-handle crop-handle-w" onPointerDown={e => handlePointerDown(e, 'w')} />
              <div className="crop-handle crop-handle-e" onPointerDown={e => handlePointerDown(e, 'e')} />
            </div>
          </div>
        </div>

        {/* 3. FLOATING / DOCKED REAL-TIME LIVE CROPPED PREVIEW */}
        <div className="crop-preview-dock">
          <div className="crop-preview-header">
            <span>👀 ภาพพรีวิว Crop สด (Live)</span>
            <span className="crop-preview-badge">100% Optical</span>
          </div>

          <div
            className="crop-preview-canvas-box"
            style={{ aspectRatio: `${realCropW} / ${realCropH}` }}
          >
            <canvas ref={previewCanvasRef} />
          </div>

          <div className="crop-preview-meta">
            <div className="crop-preview-meta-row">
              <span className="crop-preview-meta-lbl">ตัดจากต้นฉบับ:</span>
              <span className="crop-preview-meta-val">{realCropW} × {realCropH} px</span>
            </div>
            <div className="crop-preview-meta-row">
              <span className="crop-preview-meta-lbl">อัตราส่วน:</span>
              <span className="crop-preview-meta-val">
                {cropAspectLock === '4:3'
                  ? isPortrait ? '3:4 (4:3 แนวตั้ง)' : '4:3 แนวนอน'
                  : cropAspectLock}
              </span>
            </div>
            <div className="crop-preview-meta-row">
              <span className="crop-preview-meta-lbl">สถานะชิ้นงาน:</span>
              <span className="crop-preview-meta-val" style={{ color: '#10b981' }}>
                ✓ คมชัด ไม่บีบอัด ไม่ยืด
              </span>
            </div>
          </div>

          <button
            type="button"
            className="crop-action-btn snap-btn"
            style={{ width: '100%', justifyContent: 'center', padding: '6px' }}
            onClick={onCaptureTest}
          >
            📸 แคปภาพตามกรอบนี้
          </button>
        </div>
      </div>

      {/* 4. BOTTOM VIDEO TIMELINE SCRUBBER */}
      <div className="crop-bottom-bar">
        <button
          type="button"
          className="crop-action-btn"
          onClick={togglePlay}
          style={{ minWidth: 32, justifyContent: 'center' }}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button
          type="button"
          className="crop-action-btn"
          onClick={() => stepFrame(-1)}
          title="ถอยหลัง 1 เฟรม"
        >
          ⏮
        </button>
        <button
          type="button"
          className="crop-action-btn"
          onClick={() => stepFrame(1)}
          title="เดินหน้า 1 เฟรม"
        >
          ⏭
        </button>

        <input
          type="range"
          className="crop-scrub-slider"
          min={0}
          max={videoRef.current?.duration || activeVideo.duration || 10}
          step={0.04}
          value={currentTime}
          onChange={e => {
            const t = Number(e.target.value);
            setCurrentTime(t);
            if (videoRef.current) {
              videoRef.current.currentTime = t;
            }
          }}
        />

        <div className="crop-timecode">
          {formatTimestamp(currentTime)} / {formatDuration(videoRef.current?.duration || activeVideo.duration || 0)}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const savedInit = useRef<Record<string, any>>(loadSavedStudioSettings()).current;
  const [lang, setLang] = useState<Lang>(() => savedInit.lang || 'en');
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(() =>
    savedInit.autoRefreshEnabled !== undefined ? savedInit.autoRefreshEnabled : true
  );
  const t = I18N[lang];
  const gpuActive = isGpuAccelerationAvailable();

  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [activeVideoId, setActiveVideoId] = useState('');
  const [viewMode, setViewMode] = useState<'Split' | 'Video' | 'Crop'>('Split');
  const [customCrop, setCustomCrop] = useState<NormalizedCropRect | null>(null);
  const [cropAspectLock, setCropAspectLock] = useState<'4:3' | '16:9' | '3:2' | '1:1' | 'free'>('4:3');
  const [toolTab, setToolTab] = useState<ToolTab>('grading');
  const [hslMode, setHslMode] = useState<HSLMode>('sat');

  // Resizable Right Sidebar Width (Default 315px)
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => savedInit.sidebarWidth || 315);
  const isResizingRef = useRef(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const newW = Math.min(440, Math.max(275, window.innerWidth - e.clientX));
      setSidebarWidth(newW);
    };
    const onUp = () => {
      isResizingRef.current = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // Capture & Output Settings (Persisted across refreshes)
  const [sizeMode, setSizeMode] = useState<string>(() => savedInit.sizeMode || 'fhd');
  const [outputWidth, setOutputWidth] = useState<number>(() => savedInit.outputWidth || 1920);
  const [outputHeight, setOutputHeight] = useState<number>(() => savedInit.outputHeight || 1080);
  const [pixelDensity, setPixelDensity] = useState<number>(() => savedInit.pixelDensity || 150);
  const [densityUnit, setDensityUnit] = useState<'ppi' | 'ppc'>(() => savedInit.densityUnit || 'ppi');
  const [quality, setQuality] = useState<number>(() => savedInit.quality ?? 1.0);
  const [format, setFormat] = useState<'jpeg' | 'png' | 'webp'>(() => savedInit.format || 'jpeg');
  const [limitFileSize, setLimitFileSize] = useState<boolean>(() => savedInit.limitFileSize ?? true);
  const [maxFileSizeKb, setMaxFileSizeKb] = useState<number>(() => savedInit.maxFileSizeKb || 1600);
  const [colorSpace, setColorSpace] = useState<'srgb' | 'display-p3' | 'adobe-rgb'>(
    () => savedInit.colorSpace || 'srgb'
  );
  const [hdrOutput, setHdrOutput] = useState<boolean>(() => savedInit.hdrOutput ?? false);
  const [maximizeCompatibility, setMaximizeCompatibility] = useState<boolean>(
    () => savedInit.maximizeCompatibility ?? true
  );
  const [keepAspect] = useState(true);
  const [interval, setInterval_] = useState<number>(() => savedInit.interval ?? 1);
  const [speedConcurrency, setSpeedConcurrency] = useState<1 | 2 | 4>(() => savedInit.speedConcurrency || 2);
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>(
    () => savedInit.duplicateMode || 'skip'
  );
  const [cropAspect, setCropAspect] = useState<CropAspect>(() => savedInit.cropAspect || 'none');
  const [cropComposition, setCropComposition] = useState<CropComposition>(
    () => savedInit.cropComposition || 'face'
  );
  const [skipOverflowCrop, setSkipOverflowCrop] = useState<boolean>(
    () => savedInit.skipOverflowCrop ?? true
  );

  // Smart AI Capture Features (Best-Shot Search & Motion Trigger)
  const [filterBlur, setFilterBlur] = useState<boolean>(() => savedInit.filterBlur ?? true);
  const [sharpnessThreshold, setSharpnessThreshold] = useState<number>(() => savedInit.sharpnessThreshold ?? 15);
  const [smartBestShot, setSmartBestShot] = useState<boolean>(() => savedInit.smartBestShot ?? true);
  const [skipStaticScene, setSkipStaticScene] = useState<boolean>(() => savedInit.skipStaticScene ?? false);

  // Watermark / Logo Overlay (PhotoScape X Style)
  const [watermark, setWatermark] = useState<WatermarkSettings>(createDefaultWatermarkSettings);
  const [watermarkName, setWatermarkName] = useState<string>('');
  const [shapesExpanded, setShapesExpanded] = useState<boolean>(true);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Basic Enhancer Sliders
  const [enhanceModel, setEnhanceModel] = useState<string>(() => savedInit.enhanceModel || 'standard');
  const [brightness, setBrightness] = useState<number>(() => savedInit.brightness ?? 100);
  const [shadowLift, setShadowLift] = useState<number>(() => savedInit.shadowLift ?? 15);
  const [contrast, setContrast] = useState<number>(() => savedInit.contrast ?? 105);
  const [vibrance, setVibrance] = useState<number>(() => savedInit.vibrance ?? 35);
  const [saturation, setSaturation] = useState<number>(() => savedInit.saturation ?? 112);
  const [sharpen, setSharpen] = useState<number>(() => savedInit.sharpen ?? 35);
  const [clarity, setClarity] = useState<number>(() => savedInit.clarity ?? 25);
  const [denoise, setDenoise] = useState<number>(() => savedInit.denoise ?? 25);

  // Lightroom Color Mixer & Color Grading
  const [colorMixer, setColorMixer] = useState<ColorMixerSettings>(
    () => savedInit.colorMixer || createDefaultColorMixer()
  );
  const [colorGrading, setColorGrading] = useState<ColorGradingSettings>(
    () => savedInit.colorGrading || createDefaultColorGrading()
  );

  // Collapsible studio sidebar sections
  const [isHistogramOpen, setIsHistogramOpen] = useState(true);
  const [isCaptureOpen, setIsCaptureOpen] = useState(true);
  const [isColorToolsOpen, setIsColorToolsOpen] = useState(true);
  const [isWatermarkOpen, setIsWatermarkOpen] = useState<boolean>(() =>
    savedInit.isWatermarkOpen !== undefined ? savedInit.isWatermarkOpen : false
  );

  // Persist Studio Settings to localStorage so Auto-Refresh never loses user's configuration
  useEffect(() => {
    try {
      localStorage.setItem(
        STUDIO_SETTINGS_KEY,
        JSON.stringify({
          lang,
          autoRefreshEnabled,
          sidebarWidth,
          sizeMode,
          outputWidth,
          outputHeight,
          pixelDensity,
          densityUnit,
          quality,
          format,
          limitFileSize,
          maxFileSizeKb,
          colorSpace,
          hdrOutput,
          maximizeCompatibility,
          interval,
          speedConcurrency,
          duplicateMode,
          cropAspect,
          cropComposition,
          skipOverflowCrop,
          filterBlur,
          sharpnessThreshold,
          smartBestShot,
          skipStaticScene,
          enhanceModel,
          brightness,
          shadowLift,
          contrast,
          vibrance,
          saturation,
          sharpen,
          clarity,
          denoise,
          colorMixer,
          colorGrading,
          isWatermarkOpen,
        })
      );
    } catch {
      /* ignore quota errors */
    }
  }, [
    lang,
    autoRefreshEnabled,
    sidebarWidth,
    sizeMode,
    outputWidth,
    outputHeight,
    pixelDensity,
    densityUnit,
    quality,
    format,
    limitFileSize,
    maxFileSizeKb,
    colorSpace,
    hdrOutput,
    maximizeCompatibility,
    interval,
    speedConcurrency,
    duplicateMode,
    cropAspect,
    cropComposition,
    skipOverflowCrop,
    filterBlur,
    sharpnessThreshold,
    smartBestShot,
    skipStaticScene,
    enhanceModel,
    brightness,
    shadowLift,
    contrast,
    vibrance,
    saturation,
    sharpen,
    clarity,
    denoise,
    colorMixer,
    colorGrading,
    isWatermarkOpen,
  ]);

  // Custom Color Presets (persisted in localStorage)
  const [customPresets, setCustomPresets] = useState<CustomColorPreset[]>(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  // Save Folder
  const [saveDirHandle, setSaveDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [saveDirName, setSaveDirName] = useState('');

  // Working State
  const [isWorking, setIsWorking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [savedCount, setSavedCount] = useState(0);
  const [skippedDuplicates, setSkippedDuplicates] = useState(0);
  const [liveSharpCount, setLiveSharpCount] = useState(0);
  const [, setTotalScanned] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string>('');

  // UI & Compare + Histogram
  const [dragging, setDragging] = useState(false);
  const [compareData, setCompareData] = useState<{
    beforeUrl: string;
    afterUrl: string;
    histogram: HistogramData;
  } | null>(null);

  // Refs
  const workVideoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef({ aborted: false });
  const pauseRef = useRef({ paused: false });
  const startTimeRef = useRef(0);
  const pauseStartRef = useRef(0);
  const pausedAccumRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const activeVideo = videos.find(v => v.id === activeVideoId) || videos[0];
  const totalFrames = videos.reduce((sum, v) => sum + v.frames.length, 0);
  const totalSharp = isWorking ? liveSharpCount : videos.reduce((sum, v) => sum + v.sharpFrames, 0);
  const totalBlur = videos.reduce((sum, v) => sum + v.blurFrames, 0);

  // Only create 1 ObjectURL for the currently selected preview video!
  // Prevents creating hundreds of concurrent decoders/ObjectURLs when 200+ videos are added.
  useEffect(() => {
    if (!activeVideo?.file) {
      setPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(activeVideo.file);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [activeVideo?.id, activeVideo?.file]);

  const buildCurrentSettings = useCallback(
    (targetW = outputWidth, targetH = outputHeight): CaptureSettings => ({
      outputWidth: targetW,
      outputHeight: targetH,
      quality,
      format,
      limitFileSize,
      maxFileSizeKb,
      colorSpace,
      hdrOutput,
      maximizeCompatibility,
      keepAspectRatio: keepAspect,
      cropAspect,
      cropComposition,
      skipOverflowCrop,
      customCrop: customCrop || undefined,
      pixelDensity,
      densityUnit,
      smartBestShot,
      skipStaticScene,
      denoise,
      sharpen,
      clarity,
      vibrance,
      shadowLift,
      saturation,
      contrast,
      brightness,
      colorMixer,
      colorGrading,
      watermark: watermark.image ? watermark : undefined,
    }),
    [
      outputWidth,
      outputHeight,
      quality,
      format,
      keepAspect,
      cropAspect,
      cropComposition,
      skipOverflowCrop,
      customCrop,
      pixelDensity,
      densityUnit,
      smartBestShot,
      skipStaticScene,
      denoise,
      sharpen,
      clarity,
      vibrance,
      shadowLift,
      saturation,
      contrast,
      brightness,
      colorMixer,
      colorGrading,
      watermark,
    ]
  );

  // Load Watermark Logo PNG
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setWatermark(prev => ({ ...prev, image: img }));
      setWatermarkName(file.name);
      setIsWatermarkOpen(true);
    };
    img.src = url;
    e.target.value = '';
  };

  // Save & Load Custom Color Presets
  const handleSaveCustomPreset = () => {
    const name = newPresetName.trim() || `Preset ${customPresets.length + 1}`;
    const preset: CustomColorPreset = {
      id: `custom-${Date.now()}`,
      name,
      denoise,
      sharpen,
      clarity,
      vibrance,
      shadowLift,
      sat: saturation,
      con: contrast,
      bri: brightness,
      colorMixer: JSON.parse(JSON.stringify(colorMixer)),
      colorGrading: JSON.parse(JSON.stringify(colorGrading)),
    };
    const next = [...customPresets, preset];
    setCustomPresets(next);
    try {
      localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(next));
    } catch { /* ignore */ }
    setEnhanceModel(preset.id);
    setNewPresetName('');
    setShowSavePreset(false);
  };

  const handleApplyCustomPreset = (p: CustomColorPreset) => {
    setEnhanceModel(p.id);
    setDenoise(p.denoise);
    setSharpen(p.sharpen);
    setClarity(p.clarity);
    setVibrance(p.vibrance);
    setShadowLift(p.shadowLift);
    setSaturation(p.sat);
    setContrast(p.con);
    setBrightness(p.bri);
    if (p.colorMixer) setColorMixer(p.colorMixer);
    if (p.colorGrading) setColorGrading(p.colorGrading);
  };

  const handleDeleteCustomPreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = customPresets.filter(p => p.id !== id);
    setCustomPresets(next);
    try {
      localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(next));
    } catch { /* ignore */ }
  };

  // Timer & Pause Controls
  const startTimer = () => {
    startTimeRef.current = Date.now();
    pausedAccumRef.current = 0;
    pauseStartRef.current = 0;
    setElapsedTime(0);
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
    }
    timerRef.current = window.setInterval(() => {
      if (!pauseRef.current.paused) {
        const totalPaused = pausedAccumRef.current + (pauseStartRef.current > 0 ? (Date.now() - pauseStartRef.current) : 0);
        setElapsedTime(Math.max(0, Math.floor((Date.now() - startTimeRef.current - totalPaused) / 1000)));
      }
    }, 500);
  };

  const stopTimer = () => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const togglePause = () => {
    if (!isWorking) return;
    if (!pauseRef.current.paused) {
      // Pause work
      pauseRef.current.paused = true;
      pauseStartRef.current = Date.now();
      setIsPaused(true);
    } else {
      // Resume work
      if (pauseStartRef.current > 0) {
        pausedAccumRef.current += (Date.now() - pauseStartRef.current);
        pauseStartRef.current = 0;
      }
      pauseRef.current.paused = false;
      setIsPaused(false);
    }
  };

  useEffect(() => () => stopTimer(), []);

  const formatElapsed = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  // Add Videos — Zero upfront decoder allocation! Supports 250+ or 1000+ videos instantaneously.
  const addVideos = useCallback((files: FileList | File[]) => {
    const vFiles = Array.from(files).filter(
      f => f.type.startsWith('video/') || /\.(mp4|mov|avi|webm|mkv|m4v|mts|m2ts|ts|flv|3gp|wmv|mpg|mpeg)$/i.test(f.name)
    );
    if (vFiles.length === 0) return;

    const items: VideoItem[] = vFiles.map(f => ({
      id: uid(),
      file: f,
      url: '',
      name: f.name,
      size: f.size,
      duration: 0,
      width: 0,
      height: 0,
      ready: false,
      frames: [],
      sharpFrames: 0,
      blurFrames: 0,
      status: 'queued' as const,
    }));

    setVideos(prev => {
      const next = [...prev, ...items];
      if (!activeVideoId && next.length > 0) {
        setActiveVideoId(next[0].id);
      }
      return next;
    });
    setIsDone(false);
  }, [activeVideoId]);

  const removeVideo = (id: string) => {
    setVideos(prev => {
      const next = prev.filter(v => v.id !== id);
      if (activeVideoId === id) setActiveVideoId(next[0]?.id || '');
      return next;
    });
  };

  // Smart Recursive Drag & Drop (Supports both direct files and whole folders of videos)
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);

    try {
      const items = e.dataTransfer.items;
      if (items && items.length > 0 && typeof (items[0] as any).webkitGetAsEntry === 'function') {
        const fileList: File[] = [];
        const entries: any[] = [];
        for (let i = 0; i < items.length; i++) {
          const entry = (items[i] as any).webkitGetAsEntry();
          if (entry) entries.push(entry);
        }

        const readEntry = async (entry: any): Promise<void> => {
          if (entry.isFile) {
            return new Promise<void>(resolve => {
              entry.file((f: File) => {
                fileList.push(f);
                resolve();
              }, () => resolve());
            });
          } else if (entry.isDirectory) {
            const dirReader = entry.createReader();
            const readAll = async (): Promise<any[]> => {
              const all: any[] = [];
              while (true) {
                const batch: any[] = await new Promise(resolve => {
                  dirReader.readEntries((ents: any[]) => resolve(ents || []), () => resolve([]));
                });
                if (!batch || batch.length === 0) break;
                all.push(...batch);
              }
              return all;
            };
            const subEntries = await readAll();
            for (const sub of subEntries) {
              await readEntry(sub);
            }
          }
        };

        for (const ent of entries) {
          await readEntry(ent);
        }

        if (fileList.length > 0) {
          addVideos(fileList);
          return;
        }
      }
    } catch (err) {
      console.warn('Folder recursive drag extraction fallback:', err);
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addVideos(e.dataTransfer.files);
    }
  }, [addVideos]);

  // Size change
  const handleSizeChange = (id: string) => {
    setSizeMode(id);
    const opt = SIZE_OPTIONS.find(o => o.id === id);
    if (!opt) return;
    if ((opt as any).crop) {
      setCropAspect((opt as any).crop);
    } else if (id !== 'custom') {
      setCropAspect('none');
    }
    const firstReady = videos.find(v => v.width > 0);
    const isPortrait = firstReady ? firstReady.height > firstReady.width : false;
    const vw = firstReady ? firstReady.width : 1920;
    const vh = firstReady ? firstReady.height : 1080;

    if (id === 'crop-4-3-auto') {
      if (isPortrait) {
        setOutputWidth(vw);
        setOutputHeight(Math.round(vw / (3 / 4)));
      } else {
        setOutputWidth(Math.round(vh * (4 / 3)));
        setOutputHeight(vh);
      }
    } else if (id === 'crop-2-3-auto') {
      if (isPortrait) {
        setOutputWidth(vw);
        setOutputHeight(Math.round(vw / (2 / 3)));
      } else {
        setOutputWidth(Math.round(vh * (3 / 2)));
        setOutputHeight(vh);
      }
    } else if (id === 'crop-1-2-auto') {
      if (isPortrait) {
        setOutputWidth(vw);
        setOutputHeight(Math.round(vw * 2));
      } else {
        setOutputWidth(Math.round(vh * 2));
        setOutputHeight(vh);
      }
    } else if (id === 'original') {
      setOutputWidth(vw);
      setOutputHeight(vh);
    } else if (opt.w > 0) {
      if (isPortrait && opt.w > opt.h) {
        setOutputWidth(opt.h);
        setOutputHeight(opt.w);
      } else {
        setOutputWidth(opt.w);
        setOutputHeight(opt.h);
      }
    }
  };

  // Crop Aspect change (e.g. 4:3, 2:3, 1:2, 16:9, 1:1)
  const handleCropAspectChange = (crop: CropAspect) => {
    setCropAspect(crop);
    const firstReady = videos.find(v => v.width > 0);
    const isPortrait = firstReady ? firstReady.height > firstReady.width : false;
    const vw = firstReady ? firstReady.width : 1920;
    const vh = firstReady ? firstReady.height : 1080;

    if (crop === '4:3') {
      if (sizeMode === 'fhd') {
        setSizeMode('crop-4-3-hd');
        setOutputWidth(isPortrait ? 1080 : 1440);
        setOutputHeight(isPortrait ? 1440 : 1080);
      } else if (sizeMode === '4k') {
        setSizeMode('crop-4-3-4k');
        setOutputWidth(isPortrait ? 2160 : 2880);
        setOutputHeight(isPortrait ? 2880 : 2160);
      } else if (sizeMode === '8k') {
        setSizeMode('crop-4-3-max');
        setOutputWidth(isPortrait ? 4320 : 5760);
        setOutputHeight(isPortrait ? 5760 : 4320);
      } else {
        setSizeMode('crop-4-3-auto');
        if (isPortrait) {
          setOutputWidth(vw);
          setOutputHeight(Math.round(vw / (3 / 4)));
        } else {
          setOutputWidth(Math.round(vh * (4 / 3)));
          setOutputHeight(vh);
        }
      }
    } else if (crop === '2:3') {
      setSizeMode('crop-2-3-auto');
      if (isPortrait) {
        setOutputWidth(vw);
        setOutputHeight(Math.round(vw / (2 / 3)));
      } else {
        setOutputWidth(Math.round(vh * (3 / 2)));
        setOutputHeight(vh);
      }
    } else if (crop === '1:2') {
      setSizeMode('crop-1-2-auto');
      if (isPortrait) {
        setOutputWidth(vw);
        setOutputHeight(Math.round(vw * 2));
      } else {
        setOutputWidth(Math.round(vh * 2));
        setOutputHeight(vh);
      }
    } else if (crop === 'none') {
      if (sizeMode.startsWith('crop-')) {
        setSizeMode('fhd');
        setOutputWidth(isPortrait ? 1080 : 1920);
        setOutputHeight(isPortrait ? 1920 : 1080);
      }
    }
  };

  // Enhance Model change
  const handleSelectEnhanceModel = (m: typeof ENHANCE_MODELS[0]) => {
    setEnhanceModel(m.id);
    if (m.denoise >= 0) {
      setDenoise(m.denoise);
      setSharpen(m.sharpen);
      setClarity(m.clarity);
      setVibrance(m.vibrance);
      setShadowLift(m.shadowLift);
      setSaturation(m.sat);
      setContrast(m.con);
      setBrightness(m.bri);
    }
  };

  const resetCurrentTab = () => {
    if (toolTab === 'basic') {
      handleSelectEnhanceModel(ENHANCE_MODELS[0]);
    } else if (toolTab === 'mixer') {
      setColorMixer(createDefaultColorMixer());
    } else if (toolTab === 'grading') {
      setColorGrading(createDefaultColorGrading());
    }
  };

  const updateHslChannel = (ch: HSLChannelKey, field: HSLMode, val: number) => {
    setColorMixer(prev => ({
      ...prev,
      [ch]: { ...prev[ch], [field]: val },
    }));
  };

  // Live Comparison + Histogram Update
  const updateComparison = useCallback(() => {
    if (!previewVideoRef.current || isWorking) return;
    const vid = previewVideoRef.current;
    if (vid.readyState >= 2) {
      const res = renderComparisonPreview(vid, buildCurrentSettings());
      if (res) setCompareData(res);
    }
  }, [isWorking, buildCurrentSettings]);

  useEffect(() => {
    const tId = setTimeout(updateComparison, 30);
    return () => clearTimeout(tId);
  }, [updateComparison, activeVideo?.id]);

  // Native macOS + Browser Unified Directory Picker
  const pickOutputDirectory = async (): Promise<FileSystemDirectoryHandle | null> => {
    if ('showDirectoryPicker' in window) {
      return await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    }
    // Native macOS WKWebView App Bridge (calls NSOpenPanel + C fwrite via local embedded server)
    const res = await fetch(`/__pick_folder?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('AbortError');
    const data = await res.json();
    if (!data.ok || !data.name) {
      const err: any = new Error('User cancelled');
      err.name = 'AbortError';
      throw err;
    }
    const fakeHandle: any = {
      name: data.name,
      getFileHandle: async (fileName: string, opts?: { create?: boolean }) => {
        if (opts && opts.create === false) {
          const res = await fetch(`/__file_exists?name=${encodeURIComponent(fileName)}`, { cache: 'no-store' });
          const chk = await res.json();
          if (!chk.exists) {
            const err = new Error('NotFoundError');
            err.name = 'NotFoundError';
            throw err;
          }
        }
        return {
          createWritable: async () => {
            let pendingBlob: Blob | null = null;
            return {
              write: async (b: Blob) => {
                pendingBlob = b;
              },
              close: async () => {
                if (pendingBlob) {
                  await fetch(`/__save_file?name=${encodeURIComponent(fileName)}`, {
                    method: 'POST',
                    body: pendingBlob,
                  });
                }
              },
            };
          },
        };
      },
      listExistingFiles: async (): Promise<string[]> => {
        try {
          const res = await fetch(`/__list_files?t=${Date.now()}`, { cache: 'no-store' });
          const dat = await res.json();
          return dat.files || [];
        } catch {
          return [];
        }
      },
    };
    return fakeHandle as FileSystemDirectoryHandle;
  };

  // Helper: Retrieve all existing filenames in destination folder for O(1) duplicate checks
  const getExistingFileNames = async (dirHandle: FileSystemDirectoryHandle | null): Promise<Set<string>> => {
    const set = new Set<string>();
    if (!dirHandle) return set;
    try {
      if (typeof (dirHandle as any).listExistingFiles === 'function') {
        const files: string[] = await (dirHandle as any).listExistingFiles();
        for (const f of files) set.add(f);
        return set;
      }
      // Chrome / Edge / Electron FileSystemDirectoryHandle async iterator
      // @ts-ignore
      if (typeof dirHandle.keys === 'function') {
        // @ts-ignore
        for await (const name of dirHandle.keys()) {
          set.add(name);
        }
      } else if (typeof (dirHandle as any).values === 'function') {
        for await (const entry of (dirHandle as any).values()) {
          if (entry.kind === 'file') {
            set.add(entry.name);
          }
        }
      }
    } catch (err) {
      console.warn('Could not list directory files:', err);
    }
    return set;
  };

  // Select Folder
  const selectFolder = async () => {
    try {
      const handle = await pickOutputDirectory();
      if (handle) {
        setSaveDirHandle(handle);
        setSaveDirName(handle.name);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') alert(t.browserAlert);
    }
  };

  const saveFrameToHandle = async (
    dirHandle: FileSystemDirectoryHandle | null,
    frame: CapturedFrame,
    idx: number,
    videoName: string,
    existingFilesSet: Set<string>,
    mode: DuplicateMode
  ) => {
    if (!dirHandle) return;
    try {
      const ext = format === 'png' ? 'png' : format === 'webp' ? 'webp' : 'jpg';
      const prefix = videoName.replace(/\.[^.]+$/, '');
      const baseFn = `${prefix}_${String(idx + 1).padStart(4, '0')}_${formatTimestamp(frame.timestamp)}_${frame.width}x${frame.height}`;
      let fn = `${baseFn}.${ext}`;

      const exists = existingFilesSet.has(fn);

      if (exists) {
        if (mode === 'skip') {
          setSkippedDuplicates(c => c + 1);
          return;
        }
        if (mode === 'rename') {
          let count = 1;
          let candidate = `${baseFn} (${count}).${ext}`;
          while (existingFilesSet.has(candidate)) {
            count++;
            candidate = `${baseFn} (${count}).${ext}`;
          }
          fn = candidate;
        }
        // mode === 'overwrite' proceeds with standard fn
      }

      const fh = await dirHandle.getFileHandle(fn, { create: true });
      const w = await (fh as any).createWritable();
      const blobToWrite = frame.blob || dataUrlToBlob(frame.dataUrl, pixelDensity, densityUnit);
      await w.write(blobToWrite);
      await w.close();
      existingFilesSet.add(fn);
      setSavedCount(c => c + 1);
    } catch { /* skip */ }
  };

  // แคปทดสอบเฟรมปัจจุบันตามกรอบ Crop และบันทึก/แสดงผลทันที
  const handleCaptureCurrentCropTest = async () => {
    if (!previewVideoRef.current || !activeVideo) return;
    const vid = previewVideoRef.current;
    try {
      const settings = buildCurrentSettings();
      const frame = await captureCurrentFrameAsync(vid, settings);
      const existingFilesSet = await getExistingFileNames(saveDirHandle);
      await saveFrameToHandle(
        saveDirHandle,
        frame,
        activeVideo.sharpFrames,
        activeVideo.name,
        existingFilesSet,
        duplicateMode
      );
      setVideos(prev =>
        prev.map(v =>
          v.id === activeVideo.id
            ? { ...v, frames: [frame, ...v.frames], sharpFrames: v.sharpFrames + 1 }
            : v
        )
      );
    } catch (e) {
      console.error('Failed to capture test crop frame:', e);
    }
  };

  // Start Processing — Optimized Parallel Worker Pool for Massive Batches (200–1000+ videos)
  const startWork = async () => {
    if (!workVideoRef.current || videos.length === 0) return;

    // If batch has > 5 videos and no folder is selected yet, prompt for folder so RAM stays at ~0 MB!
    let targetDirHandle = saveDirHandle;
    if (!targetDirHandle && videos.length > 5) {
      try {
        const handle = await pickOutputDirectory();
        if (handle) {
          targetDirHandle = handle;
          setSaveDirHandle(handle);
          setSaveDirName(handle.name);
        }
      } catch {
        // User cancelled directory picker; continue anyway
      }
    }

    setIsWorking(true);
    setIsPaused(false);
    pauseRef.current = { paused: false };
    setIsDone(false);
    setProgress(0);
    setSavedCount(0);
    setSkippedDuplicates(0);
    setLiveSharpCount(0);
    setTotalScanned(0);
    abortRef.current = { aborted: false };
    startKeepAliveEngine();
    startTimer();

    // Pre-load existing filenames in destination folder once for instant O(1) duplicate checks
    const existingFilesSet = await getExistingFileNames(targetDirHandle);

    setVideos(prev => prev.map(v => ({ ...v, frames: [], sharpFrames: 0, blurFrames: 0, status: 'queued' as const })));

    const threshold = filterBlur ? sharpnessThreshold : 0;
    const total = videos.length;
    let globalScanned = 0;
    let globalSharp = 0;
    let completedClips = 0;
    let nextClipIdx = 0;
    let lastUiUpdate = 0;

    const workerCount = Math.min(speedConcurrency, total);

    const runWorker = async (workerIdx: number) => {
      const video =
        workerIdx === 0 && workVideoRef.current
          ? workVideoRef.current
          : Object.assign(document.createElement('video'), {
              muted: true,
              playsInline: true,
              preload: 'auto',
            });

      try {
        while (!abortRef.current.aborted) {
          while (pauseRef.current.paused && !abortRef.current.aborted) {
            await new Promise(r => setTimeout(r, 150));
          }
          if (abortRef.current.aborted) break;

          const vi = nextClipIdx++;
          if (vi >= total) break;
          const item = videos[vi];

          setProgressText(
            workerCount > 1
              ? `[${vi + 1}/${total} • ⚡${workerCount}x] ${item.name}`
              : `[${vi + 1}/${total}] ${item.name}`
          );
          setVideos(prev => prev.map((v, idx) => (idx === vi ? { ...v, status: 'capturing' } : v)));

          const clipUrl = URL.createObjectURL(item.file);
          video.src = clipUrl;

          await new Promise<void>(resolve => {
            let resolved = false;
            const done = () => {
              if (resolved) return;
              resolved = true;
              video.removeEventListener('loadedmetadata', done);
              video.removeEventListener('error', done);
              resolve();
            };
            video.addEventListener('loadedmetadata', done);
            video.addEventListener('error', done);
            setTimeout(done, 8000);
          });

          if (abortRef.current.aborted) {
            video.removeAttribute('src');
            video.load();
            URL.revokeObjectURL(clipUrl);
            break;
          }
          video.pause();

          const dur = video.duration;
          const vw = video.videoWidth;
          const vh = video.videoHeight;

          if (!dur || dur === Infinity || isNaN(dur) || !vw || !vh) {
            video.removeAttribute('src');
            video.load();
            URL.revokeObjectURL(clipUrl);
            completedClips++;
            setVideos(prev => prev.map((v, idx) => (idx === vi ? { ...v, status: 'error' } : v)));
            continue;
          }

          const targetW = sizeMode === 'original' ? vw : outputWidth;
          const targetH = sizeMode === 'original' ? vh : outputHeight;
          const settings = buildCurrentSettings(targetW, targetH);

          let sharpCount = 0;
          const clipFrames: CapturedFrame[] = [];
          const estFrames = Math.floor(dur / interval) + 1;
          const pendingSaves: Promise<void>[] = [];

          await autoCapture(
            video,
            settings,
            interval,
            0,
            dur,
            async (frame, prog) => {
              sharpCount++;
              globalSharp++;
              globalScanned++;

              if (targetDirHandle) {
                pendingSaves.push(
                  saveFrameToHandle(
                    targetDirHandle,
                    frame,
                    sharpCount - 1,
                    item.name,
                    existingFilesSet,
                    duplicateMode
                  )
                );
                if (pendingSaves.length >= 6) {
                  await Promise.all(pendingSaves);
                  pendingSaves.length = 0;
                }
              } else if (videos.length <= 20) {
                clipFrames.push(frame);
              } else {
                saveFrameToHandle(null, frame, sharpCount - 1, item.name, existingFilesSet, duplicateMode);
              }

              const now = performance.now();
              if (now - lastUiUpdate > 120 || prog >= 99) {
                lastUiUpdate = now;
                const overallProg = Math.min(99.5, ((completedClips + prog / 100) / total) * 100);
                setProgress(overallProg);
                setLiveSharpCount(globalSharp);
                setTotalScanned(globalScanned);
              }
            },
            () => {},
            abortRef.current,
            threshold,
            () => {
              globalScanned++;
            },
            pauseRef.current
          );

          if (pendingSaves.length > 0) {
            await Promise.all(pendingSaves);
          }

          // Immediately release video decoder & Blob URL memory before next clip!
          video.removeAttribute('src');
          video.load();
          URL.revokeObjectURL(clipUrl);

          completedClips++;
          const blurCount = Math.max(0, estFrames - sharpCount);
          setLiveSharpCount(globalSharp);
          setProgress((completedClips / total) * 100);
          setVideos(prev =>
            prev.map((v, idx) =>
              idx === vi
                ? {
                    ...v,
                    ready: true,
                    duration: dur,
                    width: vw,
                    height: vh,
                    frames: clipFrames,
                    status: 'done',
                    sharpFrames: sharpCount,
                    blurFrames: blurCount,
                  }
                : v
            )
          );
        }
      } finally {
        if (workerIdx > 0) {
          video.removeAttribute('src');
          video.load();
        }
      }
    };

    await Promise.all(Array.from({ length: workerCount }, (_, idx) => runWorker(idx)));

    stopKeepAliveEngine();
    stopTimer();
    setIsWorking(false);
    setIsPaused(false);
    pauseRef.current = { paused: false };
    setIsDone(true);
    setProgress(100);
    setProgressText(abortRef.current.aborted ? 'Stopped' : 'Done!');
  };

  const stopWork = () => {
    abortRef.current.aborted = true;
    pauseRef.current.paused = false;
    setIsPaused(false);
    stopKeepAliveEngine();
    stopTimer();
    setIsWorking(false);
    setIsDone(true);
  };

  const serverVersionRef = useRef<string>('');

  // Auto-Refresh Watcher: Automatically reloads when app is reopened/updated while idle
  useEffect(() => {
    if (!autoRefreshEnabled) return;

    let cancelled = false;
    const checkVersion = async () => {
      if (cancelled || isWorking || videos.length > 0) return;
      try {
        const res = await fetch(`/__version?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const ver = (await res.text()).trim();
        if (!ver) return;
        if (!serverVersionRef.current) {
          serverVersionRef.current = ver;
        } else if (serverVersionRef.current !== ver) {
          window.location.reload();
        }
      } catch {
        /* ignore on dev server if /__version not mounted */
      }
    };

    checkVersion();
    const timer = window.setInterval(checkVersion, 3500);
    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        checkVersion();
      }
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted && !isWorking) {
        window.location.reload();
      }
    };

    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    window.addEventListener('pageshow', onPageShow);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [autoRefreshEnabled, isWorking, videos.length]);

  const resetAll = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (workVideoRef.current) {
      workVideoRef.current.removeAttribute('src');
      workVideoRef.current.load();
    }
    setPreviewUrl('');
    setVideos([]);
    setActiveVideoId('');
    setIsDone(false);
    setProgress(0);
    setProgressText('');
    setSavedCount(0);
    setLiveSharpCount(0);
    setTotalScanned(0);
    setElapsedTime(0);
    setCompareData(null);
    if (autoRefreshEnabled) {
      setTimeout(() => window.location.reload(), 40);
    }
  };

  const estimateTotalFrames = () => {
    const firstDur = videos.find(v => v.duration > 0)?.duration || 10;
    return videos.reduce((sum, v) => {
      const d = v.duration || firstDur;
      return sum + (d > 0 ? Math.floor(d / interval) + 1 : 0);
    }, 0);
  };

  // Virtualized window for file strip so 250+ or 1000+ videos never lag the DOM
  const MAX_STRIP_CHIPS = 24;
  const focusIdx = Math.max(
    0,
    videos.findIndex(v => (isWorking ? v.status === 'capturing' : v.id === activeVideo?.id))
  );
  const stripStart = Math.max(
    0,
    Math.min(focusIdx - 6, Math.max(0, videos.length - MAX_STRIP_CHIPS))
  );
  const visibleStripVideos = videos.slice(stripStart, stripStart + MAX_STRIP_CHIPS);

  return (
    <div className="studio-app">
      {/* Hidden elements */}
      <video ref={workVideoRef} style={{ display: 'none' }} muted />
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,.mp4,.mov,.m4v,.mkv,.avi,.webm,.ts,.mts,.m2ts,.flv,.3gp,.wmv,*/*"
        multiple
        style={{ display: 'none' }}
        onChange={e => { if (e.target.files) addVideos(e.target.files); e.target.value = ''; }}
      />
      <input
        ref={folderInputRef}
        type="file"
        {...({ webkitdirectory: '', directory: '' } as any)}
        multiple
        style={{ display: 'none' }}
        onChange={e => { if (e.target.files) addVideos(e.target.files); e.target.value = ''; }}
      />
      <input
        ref={logoInputRef}
        type="file"
        accept="image/png,image/webp,image/jpeg,image/svg+xml"
        style={{ display: 'none' }}
        onChange={handleLogoUpload}
      />

      {/* ==================== TOP HEADER BAR ==================== */}
      <header className="studio-topbar">
        <div className="studio-brand">
          <span className="studio-logo-badge">📸</span>
          <span className="studio-title">SnapPro</span>
          <div className="studio-top-pills">
            <span className="top-summary-badge accent">
              {gpuActive ? '⚡ WebGL2 Pro' : 'Studio Engine'}
            </span>
            <span className="top-summary-badge">
              {pixelDensity} {densityUnit.toUpperCase()}
              {limitFileSize && format !== 'png' ? ` • ≤ ${maxFileSizeKb.toLocaleString()} K` : ''}
            </span>
            {videos.length > 0 && (
              <span className="top-summary-badge">
                🎬 {videos.length.toLocaleString()} {lang === 'th' ? 'คลิป' : 'Clips'}
              </span>
            )}
          </div>
        </div>

        {/* Far Top-Right Controls + Language Switch */}
        <div className="studio-header-right">
          {videos.length > 0 && (
            <div className="view-switch">
              <button
                className={`view-switch-btn ${viewMode === 'Split' ? 'active' : ''}`}
                onClick={() => setViewMode('Split')}
              >
                {t.beforeAfter}
              </button>
              <button
                className={`view-switch-btn ${viewMode === 'Crop' ? 'active' : ''}`}
                onClick={() => setViewMode('Crop')}
                title="ลากกรอบตัด Crop บนวิดีโอสด พร้อมดูตัวอย่างแบบเรียลไทม์"
              >
                {t.cropTool}
              </button>
              <button
                className={`view-switch-btn ${viewMode === 'Video' ? 'active' : ''}`}
                onClick={() => setViewMode('Video')}
              >
                {t.videoPlayer}
              </button>
            </div>
          )}

          {isDone && totalFrames > 0 && !saveDirHandle && (
            <button
              className="btn-xs btn-success"
              onClick={() => downloadAllFrames(videos.flatMap(v => v.frames), 'snappro', pixelDensity, densityUnit)}
            >
              {t.downloadAll} ({totalFrames})
            </button>
          )}
          {videos.length > 0 && !isWorking && (
            <button className="btn-xs btn-ghost" onClick={resetAll}>
              {t.clearAll}
            </button>
          )}

          <button
            type="button"
            className={`mini-pill ${autoRefreshEnabled ? 'active' : ''}`}
            style={{ padding: '4px 8px', fontSize: 11 }}
            onClick={() => setAutoRefreshEnabled(v => !v)}
            title={
              lang === 'th'
                ? 'เปิด/ปิด การรีเฟรชตัวเองอัตโนมัติทุกครั้งที่เปิด-ปิดแอปหรือกดล้างงาน'
                : 'Toggle Auto-Refresh on app open/close and batch clear'
            }
          >
            🔄 {lang === 'th' ? `รีเฟรชอัตโนมัติ: ${autoRefreshEnabled ? 'เปิด' : 'ปิด'}` : `Auto-Refresh: ${autoRefreshEnabled ? 'ON' : 'OFF'}`}
          </button>

          <div className="view-switch">
            <button
              className={`view-switch-btn ${lang === 'en' ? 'active' : ''}`}
              onClick={() => setLang('en')}
            >
              EN
            </button>
            <button
              className={`view-switch-btn ${lang === 'th' ? 'active' : ''}`}
              onClick={() => setLang('th')}
            >
              TH
            </button>
          </div>
        </div>
      </header>

      {/* ==================== MAIN 2-COLUMN WORKSPACE ==================== */}
      <div className="studio-body">
        {/* ---------- LEFT COLUMN: PREVIEW + FILE STRIP + BOTTOM ACTION BAR ---------- */}
        <div
          className={`studio-left ${dragging ? 'dragging' : ''}`}
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
        >
          {/* 1. Preview Stage */}
          <div className="studio-stage">
            {videos.length === 0 ? (
              <div className="empty-dropzone" onClick={() => fileInputRef.current?.click()}>
                <div className="dropzone-icon-orb">🎬</div>
                <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.2px' }}>
                  {t.dropTitle}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 520, lineHeight: 1.45 }}>
                  {t.dropSub}
                </div>

                <div className="dropzone-actions" onClick={e => e.stopPropagation()}>
                  <button
                    type="button"
                    className="btn-dropzone btn-dropzone-primary"
                    onClick={() => fileInputRef.current?.click()}
                    title="เลือกไฟล์หลายไฟล์พร้อมกัน — สามารถกด Cmd+A เพื่อเลือกทั้งหมดได้ทันที"
                  >
                    🎬 {lang === 'th' ? 'เลือกไฟล์วิดีโอ (Cmd+A ทั้งหมด)' : 'Select Files (Cmd+A All)'}
                  </button>
                  <button
                    type="button"
                    className="btn-dropzone btn-dropzone-secondary"
                    onClick={() => folderInputRef.current?.click()}
                    title="เลือกทั้งโฟลเดอร์ — สแกนคลิปทั้งหมดในโฟลเดอร์ทันที"
                  >
                    📁 {lang === 'th' ? 'เลือกทั้งโฟลเดอร์ (Folder)' : 'Select Entire Folder'}
                  </button>
                </div>

                <div className="dropzone-feature-pills">
                  <span className="dropzone-feature-pill">⚡ WebGL2 8K GPU</span>
                  <span className="dropzone-feature-pill">🎯 AI Best-Shot</span>
                  <span className="dropzone-feature-pill">🎨 3-Way Color Grading</span>
                  <span className="dropzone-feature-pill">📏 Real {pixelDensity} {densityUnit.toUpperCase()}</span>
                  {limitFileSize && (
                    <span className="dropzone-feature-pill">📦 Limit ≤ {maxFileSizeKb.toLocaleString()} KB</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="stage-content">
                <video
                  ref={previewVideoRef}
                  src={previewUrl || undefined}
                  controls={viewMode !== 'Crop'}
                  muted
                  onLoadedMetadata={e => {
                    const vid = e.currentTarget;
                    if (activeVideo && !activeVideo.ready && vid.duration > 0) {
                      setVideos(prev =>
                        prev.map(v =>
                          v.id === activeVideo.id
                            ? {
                                ...v,
                                duration: vid.duration,
                                width: vid.videoWidth,
                                height: vid.videoHeight,
                                ready: true,
                              }
                            : v
                        )
                      );
                    }
                  }}
                  onLoadedData={updateComparison}
                  onSeeked={updateComparison}
                  style={{
                    width: '100%',
                    display: viewMode === 'Crop' ? 'none' : 'block',
                    maxHeight: viewMode === 'Video' ? 'calc(100vh - 180px)' : 36,
                    height: viewMode === 'Video' ? '100%' : 36,
                    borderRadius: 6,
                    background: '#000',
                    objectFit: 'contain',
                  }}
                />

                {viewMode === 'Crop' && activeVideo && (
                  <InteractiveCropEditor
                    videoRef={previewVideoRef}
                    activeVideo={activeVideo}
                    customCrop={customCrop}
                    onCropChange={setCustomCrop}
                    cropAspectLock={cropAspectLock}
                    onCropAspectLockChange={setCropAspectLock}
                    cropAspect={cropAspect}
                    onCropAspectChange={handleCropAspectChange}
                    cropComposition={cropComposition}
                    onCropCompositionChange={setCropComposition}
                    settings={buildCurrentSettings()}
                    onCaptureTest={handleCaptureCurrentCropTest}
                    onClose={() => setViewMode('Split')}
                    lang={lang}
                  />
                )}

                {viewMode === 'Split' && compareData && (
                  <div className="compare-split">
                    <div className="compare-pane">
                      <span className="compare-tag">{t.beforeTag}</span>
                      <img src={compareData.beforeUrl} alt="Before" />
                    </div>
                    <div className="compare-pane after-pane">
                      <span className="compare-tag tag-accent">{t.afterTag}</span>
                      <span className="compare-meta-tag">
                        {format.toUpperCase()} • {pixelDensity} {densityUnit.toUpperCase()}
                        {limitFileSize && format !== 'png' ? ` • ≤ ${maxFileSizeKb}K` : ` • Q${Math.round(quality * 100)}`}
                      </span>
                      <img src={compareData.afterUrl} alt="After" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. Compact Virtualized File Strip (Supports 1000+ videos smoothly) */}
          {videos.length > 0 && (
            <div className="file-strip">
              <div className="file-strip-list">
                {stripStart > 0 && (
                  <span className="file-chip" style={{ opacity: 0.7 }}>
                    +{stripStart} earlier
                  </span>
                )}
                {visibleStripVideos.map((v, idx) => {
                  const i = stripStart + idx;
                  return (
                    <div
                      key={v.id}
                      className={`file-chip ${v.id === activeVideo?.id ? 'active' : ''} ${v.status === 'done' ? 'done' : ''} ${v.status === 'capturing' ? 'capturing' : ''}`}
                      onClick={() => !isWorking && setActiveVideoId(v.id)}
                    >
                      <span className="chip-num">
                        {v.status === 'done' ? '✅' : v.status === 'capturing' ? '⏳' : i + 1}
                      </span>
                      <span className="chip-name">{v.name}</span>
                      <span className="chip-meta">
                        {v.status === 'done' || v.status === 'capturing'
                          ? `📸${v.sharpFrames}`
                          : v.ready
                          ? `${formatDuration(v.duration)}`
                          : fmtSize(v.size)}
                      </span>
                      {!isWorking && (
                        <button
                          className="chip-close"
                          onClick={e => { e.stopPropagation(); removeVideo(v.id); }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
                {stripStart + MAX_STRIP_CHIPS < videos.length && (
                  <span className="file-chip" style={{ opacity: 0.8, color: '#93c5fd' }}>
                    +{videos.length - (stripStart + MAX_STRIP_CHIPS)} more clips (Total: {videos.length})
                  </span>
                )}
              </div>
              {!isWorking && (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    type="button"
                    className="btn-xs btn-outline"
                    onClick={() => fileInputRef.current?.click()}
                    title="เพิ่มไฟล์วิดีโอ (กด Cmd+A เลือกทั้งหมดได้)"
                  >
                    🎬 {t.addVideo}
                  </button>
                  <button
                    type="button"
                    className="btn-xs btn-outline"
                    onClick={() => folderInputRef.current?.click()}
                    title="เพิ่มวิดีโอทั้งโฟลเดอร์"
                  >
                    📁 {lang === 'th' ? '＋ โฟลเดอร์' : '＋ Folder'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 3. Bottom Action Bar */}
          <div className="bottom-bar">
            <button
              className={`folder-btn-compact ${saveDirName ? 'selected' : ''}`}
              onClick={selectFolder}
              disabled={isWorking}
            >
              <span>{saveDirName ? '📂' : '📁'}</span>
              <div className="folder-btn-text">
                <div className="folder-btn-title">
                  {saveDirName ? saveDirName : t.selectFolder}
                </div>
                <div className="folder-btn-sub">
                  {saveDirName ? t.autoSaveOn : t.chooseFolderSub}
                </div>
              </div>
            </button>

            <div className="bottom-status">
              {isWorking ? (
                <div className="working-inline">
                  <div className="working-inline-top">
                    <span className="truncate-text" style={{ color: isPaused ? '#fcd34d' : undefined, fontWeight: isPaused ? 600 : undefined }}>
                      {isPaused ? (lang === 'th' ? '⏸ [หยุดพักชั่วคราว] พักเครื่องชั่วคราว — กด "ทำงานต่อ" ได้ตลอดเวลา' : '⏸ [PAUSED] Processing paused — Click Resume anytime') : progressText}
                    </span>
                    <span>
                      {Math.round(progress)}% • 📸 {totalSharp}
                      {saveDirHandle && ` • 💾 ${savedCount}`}
                      {skippedDuplicates > 0 && ` • ⏭ ${lang === 'th' ? 'ข้าม' : 'Skip'} ${skippedDuplicates}`}
                      {` • ⏱ ${formatElapsed(elapsedTime)}`}
                    </span>
                  </div>
                  <div className="progress-bar" style={{ height: 5, margin: 0 }}>
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${progress}%`,
                        background: isPaused ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' : undefined,
                      }}
                    />
                  </div>
                </div>
              ) : isDone ? (
                <div className="done-inline">
                  ✅ <strong>{t.doneMsg} {totalSharp}</strong>
                  {totalBlur > 0 && ` (${t.filteredBlur} ${totalBlur})`}
                  {savedCount > 0 && ` • ${t.savedTo} 📂 ${saveDirName} (${savedCount} ${t.filesUnit})`}
                  {skippedDuplicates > 0 && ` • ⏭ ${t.skippedDuplicates} ${skippedDuplicates} ${t.filesUnit}`}
                  {` • ⏱ ${formatElapsed(elapsedTime)}`}
                </div>
              ) : (
                <div className="ready-inline">
                  {videos.length === 0
                    ? t.readyEmpty
                    : t.readySummary(videos.length, estimateTotalFrames(), interval)}
                </div>
              )}
            </div>

            {isWorking ? (
              <div className="bottom-actions-group">
                <button
                  type="button"
                  className={`start-btn-compact ${isPaused ? 'resume-mode' : 'pause-mode'}`}
                  onClick={togglePause}
                  title={isPaused ? (lang === 'th' ? 'คลิกเพื่อทำงานต่อ' : 'Resume processing') : (lang === 'th' ? 'พักเครื่องชั่วคราว' : 'Pause processing')}
                >
                  {isPaused ? t.resumeBtn : t.pauseBtn}
                </button>
                <button type="button" className="start-btn-compact stop-mode" onClick={stopWork}>
                  {t.stopBtn}
                </button>
              </div>
            ) : (
              <div className="bottom-actions-group">
                {isDone && totalFrames > 0 && !saveDirHandle && (
                  <button
                    type="button"
                    className="btn-xs btn-success"
                    style={{ padding: '6px 12px', fontSize: 12 }}
                    onClick={() => downloadAllFrames(videos.flatMap(v => v.frames), 'snappro', pixelDensity, densityUnit)}
                  >
                    ⬇️ {t.downloadAll} ({totalFrames})
                  </button>
                )}
                {isDone && (
                  <button
                    type="button"
                    className="clear-done-btn"
                    onClick={resetAll}
                    title="Clear finished videos and start a new batch"
                  >
                    🗑️ {t.clearAll}
                  </button>
                )}
                <button
                  className="start-btn-compact"
                  disabled={videos.length === 0}
                  onClick={startWork}
                >
                  {t.startBtn} ({videos.length})
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ---------- DRAGGABLE RESIZE HANDLE ---------- */}
        <div
          className="sidebar-resizer"
          onMouseDown={() => { isResizingRef.current = true; }}
          title="Drag to resize panel"
        />

        {/* ---------- RIGHT COLUMN: UNIFIED STUDIO SIDEBAR ---------- */}
        <aside className="studio-sidebar" style={{ width: sidebarWidth }}>
          {/* SECTION 1: Live RGB Histogram */}
          <div className="panel-section">
            <div className="panel-header-line clickable" onClick={() => setIsHistogramOpen(v => !v)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="collapse-arrow">{isHistogramOpen ? '▼' : '▶'}</span>
                <span className="panel-title">{t.histogram}</span>
              </div>
              <span className="gpu-badge" title="WebGL2 Hardware Shader Acceleration Active">
                {gpuActive ? '⚡ GPU WebGL2' : 'CPU'} • RGB
              </span>
            </div>
            {isHistogramOpen && <HistogramGraph data={compareData?.histogram || null} />}
          </div>

          {/* SECTION 2: Capture Settings */}
          <div className="panel-section">
            <div className="panel-header-line clickable" onClick={() => setIsCaptureOpen(v => !v)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="collapse-arrow">{isCaptureOpen ? '▼' : '▶'}</span>
                <span className="panel-title">{t.captureSettings}</span>
              </div>
              {!isCaptureOpen && (
                <span className="panel-collapsed-badge">
                  {interval}s • {sizeMode === 'original' ? 'Orig' : `${outputWidth}×${outputHeight}`} • {pixelDensity}{densityUnit.toUpperCase()}
                  {duplicateMode === 'skip' ? ' • Skip Dup' : duplicateMode === 'rename' ? ' • Auto-Rename' : ' • Overwrite'}
                </span>
              )}
            </div>

            {isCaptureOpen && (
              <div className="capture-settings-grid">
              {/* Row 1: Interval */}
              <div className="cap-row">
                <span className="cap-lbl">{t.interval}</span>
                <div className="mini-pills" style={{ flex: 1, justifyContent: 'flex-end' }}>
                  {INTERVAL_OPTIONS.map(v => (
                    <button
                      key={v}
                      className={`mini-pill ${interval === v ? 'active' : ''}`}
                      onClick={() => setInterval_(v)}
                    >
                      {v}s
                    </button>
                  ))}
                  <input
                    type="number"
                    className="mini-input"
                    value={interval}
                    min={0.1}
                    step={0.1}
                    onChange={e => setInterval_(Math.max(0.1, Number(e.target.value)))}
                  />
                </div>
              </div>

              {/* Row 2: Output Size */}
              <div className="cap-row">
                <span className="cap-lbl">{t.size}</span>
                <select
                  className="compact-select"
                  style={{ flex: 1, minWidth: 0 }}
                  value={sizeMode}
                  onChange={e => handleSizeChange(e.target.value)}
                >
                  {SIZE_OPTIONS.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.labelKey ? t[o.labelKey] : o.label}
                    </option>
                  ))}
                </select>
              </div>

              {sizeMode === 'custom' && (
                <div className="cap-row">
                  <span className="cap-lbl">W × H</span>
                  <div className="custom-wh" style={{ flex: 1, justifyContent: 'flex-end' }}>
                    <input
                      type="number"
                      className="mini-input"
                      style={{ width: 64 }}
                      value={outputWidth}
                      onChange={e => setOutputWidth(Number(e.target.value) || 100)}
                    />
                    <span>×</span>
                    <input
                      type="number"
                      className="mini-input"
                      style={{ width: 64 }}
                      value={outputHeight}
                      onChange={e => setOutputHeight(Number(e.target.value) || 100)}
                    />
                  </div>
                </div>
              )}

              {/* Row 2.5: Crop Aspect & AI Smart Composition (1:2 ส่วน / 2:3 ส่วน / ข้ามหากเกินอัตราส่วน) */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  padding: '7px 9px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.07)',
                  borderRadius: 6,
                  margin: '4px 0',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="cap-lbl" style={{ margin: 0, fontWeight: 600 }}>อัตราส่วน Crop</span>
                  <div className="mini-pills">
                    {(['none', '4:3', '2:3', '1:2', '1:1', '16:9'] as CropAspect[]).map(aspect => (
                      <button
                        key={aspect}
                        type="button"
                        className={`mini-pill ${cropAspect === aspect ? 'active' : ''}`}
                        onClick={() => handleCropAspectChange(aspect)}
                      >
                        {aspect === 'none' ? 'ไม่ Crop' : aspect}
                      </button>
                    ))}
                  </div>
                </div>

                {cropAspect !== 'none' && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2 }}>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>AI จับบุคคล</span>
                      <div className="mini-pills">
                        <button
                          type="button"
                          className={`mini-pill ${cropComposition === 'face' ? 'active' : ''}`}
                          onClick={() => {
                            setCropComposition('face');
                            setCustomCrop(null);
                          }}
                          title="AI วัดใบหน้าและศีรษะเป็นหลัก เว้นระยะเหนือศีรษะอัตโนมัติ (หัวไม่ขาด 100%)"
                        >
                          👤 วัดหน้าเป็นหลัก
                        </button>
                        <button
                          type="button"
                          className={`mini-pill ${cropComposition === '1:2' ? 'active' : ''}`}
                          onClick={() => {
                            setCropComposition('1:2');
                            setCustomCrop(null);
                          }}
                          title="AI จัดตัวแบบคนยืนเต็มตัวให้อยู่กึ่งกลาง 50% (1:2 ส่วน)"
                        >
                          🧍 คนกึ่งกลาง (1:2)
                        </button>
                        <button
                          type="button"
                          className={`mini-pill ${cropComposition === '2:3' ? 'active' : ''}`}
                          onClick={() => {
                            setCropComposition('2:3');
                            setCustomCrop(null);
                          }}
                          title="จัดองค์ประกอบตัวแบบตามส่วน 2:3 (จุดตัดเก้าช่อง Rule of Thirds)"
                        >
                          📐 2:3 ส่วน
                        </button>
                      </div>
                    </div>

                    <label
                      className="compact-check"
                      style={{
                        margin: 0,
                        paddingTop: 3,
                        cursor: 'pointer',
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={skipOverflowCrop}
                        onChange={e => setSkipOverflowCrop(e.target.checked)}
                      />
                      <span style={{ color: skipOverflowCrop ? '#38bdf8' : '#94a3b8' }}>
                        ⚡ เกินอัตราส่วนไม่ต้อง Crop (ข้ามไปปล่อยภาพปกติ)
                      </span>
                    </label>
                  </>
                )}

                {/* Quick Action: Open Interactive Drag Crop Editor */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <button
                    type="button"
                    style={{
                      background: customCrop ? 'linear-gradient(135deg, #0284c7, #0369a1)' : 'rgba(56, 189, 248, 0.12)',
                      color: customCrop ? '#fff' : '#38bdf8',
                      border: '1px solid #0284c7',
                      padding: '5px 8px',
                      borderRadius: 5,
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                    onClick={() => setViewMode('Crop')}
                  >
                    ✂️ {customCrop
                      ? `กรอบ Crop ผู้ใช้: ${Math.round(customCrop.w * 100)}%×${Math.round(customCrop.h * 100)}% (ปรับแต่ง)`
                      : 'เปิดเครื่องมือลาก Crop บนหน้าจอ + พรีวิวสด'}
                  </button>
                  {customCrop && (
                    <button
                      type="button"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#ef4444',
                        fontSize: '10.5px',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        padding: '1px 0',
                        textAlign: 'center',
                      }}
                      onClick={() => setCustomCrop(null)}
                    >
                      ✕ ปิดกรอบลาก Crop (กลับเป็น Crop อัตโนมัติ)
                    </button>
                  )}
                </div>
              </div>

              {/* Row 3: Pixel Density (Topaz / Lightroom Style) */}
              <div className="pixel-density-box">
                <span className="pixel-density-label">{t.pixelDensity}</span>
                <div className="pixel-density-right">
                  <div className="density-quick-pills">
                    {[72, 150, 300].map(d => (
                      <button
                        key={d}
                        type="button"
                        className={`density-pill ${pixelDensity === d ? 'active' : ''}`}
                        onClick={() => setPixelDensity(d)}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    className="pixel-density-input"
                    min={1}
                    max={2400}
                    value={pixelDensity}
                    onChange={e => setPixelDensity(Math.max(1, Number(e.target.value) || 150))}
                  />
                  <select
                    className="pixel-density-unit"
                    value={densityUnit}
                    onChange={e => setDensityUnit(e.target.value as 'ppi' | 'ppc')}
                  >
                    <option value="ppi">PPI</option>
                    <option value="ppc">PPC</option>
                  </select>
                </div>
              </div>

              {/* Row 4: Blur Filter + Smart AI Toggles (Best Shot & Motion Trigger) */}
              <div className="cap-row">
                <label className="compact-check">
                  <input
                    type="checkbox"
                    checked={filterBlur}
                    onChange={e => setFilterBlur(e.target.checked)}
                  />
                  <span>{t.blurFilter}</span>
                </label>
                {filterBlur && (
                  <div className="mini-pills">
                    <button
                      className={`mini-pill ${sharpnessThreshold === 5 ? 'active' : ''}`}
                      onClick={() => setSharpnessThreshold(5)}
                    >
                      {t.low}
                    </button>
                    <button
                      className={`mini-pill ${sharpnessThreshold === 15 ? 'active' : ''}`}
                      onClick={() => setSharpnessThreshold(15)}
                    >
                      {t.med}
                    </button>
                    <button
                      className={`mini-pill ${sharpnessThreshold === 30 ? 'active' : ''}`}
                      onClick={() => setSharpnessThreshold(30)}
                    >
                      {t.high}
                    </button>
                  </div>
                )}
              </div>

              {/* Row 5: Smart AI Pills (Best-Shot Search & Motion Trigger) */}
              <div className="smart-ai-row">
                <button
                  type="button"
                  className={`smart-toggle-pill ${smartBestShot ? 'active' : ''}`}
                  onClick={() => setSmartBestShot(v => !v)}
                  title={t.bestShotTip}
                >
                  {t.bestShot}
                </button>
                <button
                  type="button"
                  className={`smart-toggle-pill ${skipStaticScene ? 'active' : ''}`}
                  onClick={() => setSkipStaticScene(v => !v)}
                  title={t.motionOnlyTip}
                >
                  {t.motionOnly}
                </button>
              </div>

              {/* Row 5.5: Parallel Engine Speed Selector (1x Eco / 2x Fast / 4x Turbo) */}
              <div className="cap-row">
                <span className="cap-lbl">{t.speedMode}</span>
                <div className="mini-pills" style={{ flex: 1, justifyContent: 'flex-end' }}>
                  {([
                    { v: 1 as const, label: '1x Eco', tip: '1 clip at a time (~30% CPU, lowest RAM)' },
                    { v: 2 as const, label: '⚡ 2x Fast', tip: '2 clips in parallel (Balanced for M1 Pro)' },
                    { v: 4 as const, label: '🚀 4x Turbo', tip: '4 clips in parallel (Max throughput)' },
                  ]).map(opt => (
                    <button
                      key={opt.v}
                      type="button"
                      className={`mini-pill ${speedConcurrency === opt.v ? 'active' : ''}`}
                      onClick={() => setSpeedConcurrency(opt.v)}
                      disabled={isWorking}
                      title={opt.tip}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 6: Lightroom-Style File Settings Box (Image Format, Quality, Limit File Size To KB, Color Space) */}
              <div className="lr-file-settings-box">
                <div className="lr-fs-row">
                  <span className="lr-fs-label">Image Format:</span>
                  <select
                    className="compact-select"
                    style={{ flex: 1 }}
                    value={format}
                    onChange={e => setFormat(e.target.value as any)}
                  >
                    <option value="jpeg">JPEG</option>
                    <option value="webp">WebP</option>
                    <option value="png">PNG</option>
                  </select>
                </div>

                {format !== 'png' && (
                  <>
                    <div className={`lr-fs-row ${limitFileSize ? 'dimmed' : ''}`}>
                      <span className="lr-fs-label">Quality:</span>
                      <input
                        type="range"
                        min={10}
                        max={100}
                        step={1}
                        disabled={limitFileSize}
                        value={Math.round(quality * 100)}
                        onChange={e => setQuality(Math.max(0.1, Math.min(1, Number(e.target.value) / 100)))}
                        style={{ flex: 1 }}
                      />
                      <input
                        type="number"
                        className="lr-fs-num-box"
                        min={10}
                        max={100}
                        disabled={limitFileSize}
                        value={Math.round(quality * 100)}
                        onChange={e =>
                          setQuality(Math.max(0.1, Math.min(1, (Number(e.target.value) || 95) / 100)))
                        }
                      />
                    </div>

                    <div className="lr-fs-row">
                      <label className="compact-check" style={{ flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={limitFileSize}
                          onChange={e => setLimitFileSize(e.target.checked)}
                        />
                        <span>Limit File Size To:</span>
                      </label>
                      <input
                        type="number"
                        className="lr-fs-kb-input"
                        min={50}
                        max={50000}
                        step={100}
                        disabled={!limitFileSize}
                        value={maxFileSizeKb}
                        onChange={e => setMaxFileSizeKb(Math.max(50, Number(e.target.value) || 1600))}
                      />
                      <span className="lr-fs-unit">K</span>
                      <span
                        className="lr-fs-info"
                        title="Automatically adjusts JPEG/WebP compression so each exported photo never exceeds this file size in KB (e.g. 1,600 K = ~1.6 MB)."
                      >
                        ⓘ
                      </span>
                    </div>
                  </>
                )}

                <div className="lr-fs-row">
                  <span className="lr-fs-label">Color Space:</span>
                  <select
                    className="compact-select"
                    style={{ flex: 1 }}
                    value={colorSpace}
                    onChange={e => setColorSpace(e.target.value as any)}
                  >
                    <option value="srgb">sRGB IEC61966-2.1</option>
                    <option value="display-p3">Display P3</option>
                    <option value="adobe-rgb">Adobe RGB (1998)</option>
                  </select>
                </div>

                <div className="lr-fs-row lr-fs-subrow">
                  <span className="lr-fs-bitdepth">
                    Bit Depth: <strong>{format === 'png' ? '16 bits/component' : '8 bits/component'}</strong>
                  </span>
                </div>

                <div className="lr-fs-row">
                  <span className="lr-fs-label">{t.duplicateFiles}:</span>
                  <select
                    className="compact-select"
                    style={{ flex: 1 }}
                    value={duplicateMode}
                    onChange={e => setDuplicateMode(e.target.value as DuplicateMode)}
                  >
                    <option value="skip">{t.dupSkip}</option>
                    <option value="overwrite">{t.dupOverwrite}</option>
                    <option value="rename">{t.dupRename}</option>
                  </select>
                </div>

                <div className="lr-fs-checks-row">
                  <label className="compact-check" style={{ fontSize: 10.5 }}>
                    <input
                      type="checkbox"
                      checked={hdrOutput}
                      onChange={e => setHdrOutput(e.target.checked)}
                    />
                    <span>HDR Output</span>
                  </label>
                  <label className="compact-check" style={{ fontSize: 10.5, opacity: 0.85 }}>
                    <input
                      type="checkbox"
                      checked={maximizeCompatibility}
                      onChange={e => setMaximizeCompatibility(e.target.checked)}
                    />
                    <span>Maximize Compatibility</span>
                  </label>
                </div>
              </div>
            </div>
            )}
          </div>

                              {/* SECTION 3: Tabbed Color & Detail Tools (Basic | HSL | Grading) */}
          <div className={`panel-section sidebar-color-section ${!isColorToolsOpen ? 'collapsed' : ''}`}>
            <div
              className="panel-header-line clickable"
              onClick={() => setIsColorToolsOpen(v => !v)}
              style={{ marginBottom: isColorToolsOpen ? 4 : 0 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="collapse-arrow">{isColorToolsOpen ? '▼' : '▶'}</span>
                <span className="panel-title">{lang === 'th' ? 'การปรับแต่งสี (Color Grading)' : 'Color Grading & Details'}</span>
              </div>
              {!isColorToolsOpen && (
                <span className="panel-collapsed-badge">
                  {toolTab.toUpperCase()}
                </span>
              )}
            </div>

            {isColorToolsOpen && (
              <>
                <div className="tool-tabs-bar">
                  <button
                    className={`tool-tab-btn ${toolTab === 'basic' ? 'active' : ''}`}
                    onClick={() => setToolTab('basic')}
                  >
                    {t.tabBasic}
                  </button>
                  <button
                    className={`tool-tab-btn ${toolTab === 'mixer' ? 'active' : ''}`}
                    onClick={() => setToolTab('mixer')}
                  >
                    {t.tabMixer}
                  </button>
                  <button
                    className={`tool-tab-btn ${toolTab === 'grading' ? 'active' : ''}`}
                    onClick={() => setToolTab('grading')}
                  >
                    {t.tabGrading}
                  </button>
                  <button className="reset-link" onClick={resetCurrentTab} title="Reset current tab">
                    {t.reset}
                  </button>
                </div>

            {/* ---------- TAB 1: BASIC & DETAIL + CUSTOM PRESETS ---------- */}
            {toolTab === 'basic' && (
              <div className="tab-card">
                <div className="preset-grid-compact">
                  {ENHANCE_MODELS.map(m => (
                    <button
                      key={m.id}
                      className={`preset-chip ${enhanceModel === m.id ? 'active' : ''}`}
                      onClick={() => handleSelectEnhanceModel(m)}
                    >
                      {lang === 'en' ? m.labelEn : m.labelTh}
                    </button>
                  ))}

                  {/* User Custom Saved Presets */}
                  {customPresets.map(cp => (
                    <button
                      key={cp.id}
                      className={`preset-chip custom-preset-chip ${enhanceModel === cp.id ? 'active' : ''}`}
                      onClick={() => handleApplyCustomPreset(cp)}
                    >
                      <span className="truncate-preset">⭐ {cp.name}</span>
                      <span
                        className="del-preset-btn"
                        onClick={e => handleDeleteCustomPreset(cp.id, e)}
                        title="Delete preset"
                      >
                        ×
                      </span>
                    </button>
                  ))}

                  {!showSavePreset ? (
                    <button
                      type="button"
                      className="preset-chip save-preset-trigger"
                      onClick={() => setShowSavePreset(true)}
                    >
                      {t.savePresetBtn}
                    </button>
                  ) : (
                    <div className="save-preset-inline">
                      <input
                        type="text"
                        className="save-preset-input"
                        placeholder={t.presetNamePlaceholder}
                        value={newPresetName}
                        onChange={e => setNewPresetName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveCustomPreset(); }}
                        autoFocus
                      />
                      <button type="button" className="mini-pill active" onClick={handleSaveCustomPreset}>
                        {t.saveWord}
                      </button>
                    </div>
                  )}
                </div>

                <div className="sliders-stack">
                  <div className="c-slider-row">
                    <span className="c-slider-lbl">{t.brightness}</span>
                    <input type="range" min={60} max={150} value={brightness}
                      onChange={e => { setBrightness(Number(e.target.value)); setEnhanceModel('custom'); }} />
                    <span className="c-slider-val">{brightness}%</span>
                  </div>
                  <div className="c-slider-row">
                    <span className="c-slider-lbl">{t.shadows}</span>
                    <input type="range" min={0} max={100} value={shadowLift}
                      onChange={e => { setShadowLift(Number(e.target.value)); setEnhanceModel('custom'); }} />
                    <span className="c-slider-val">{shadowLift}%</span>
                  </div>
                  <div className="c-slider-row">
                    <span className="c-slider-lbl">{t.contrast}</span>
                    <input type="range" min={70} max={150} value={contrast}
                      onChange={e => { setContrast(Number(e.target.value)); setEnhanceModel('custom'); }} />
                    <span className="c-slider-val">{contrast}%</span>
                  </div>

                  <div className="stack-divider" />

                  <div className="c-slider-row">
                    <span className="c-slider-lbl">{t.vibrance}</span>
                    <input type="range" min={0} max={100} value={vibrance}
                      onChange={e => { setVibrance(Number(e.target.value)); setEnhanceModel('custom'); }} />
                    <span className="c-slider-val">{vibrance}%</span>
                  </div>
                  <div className="c-slider-row">
                    <span className="c-slider-lbl">{t.saturation}</span>
                    <input type="range" min={60} max={180} value={saturation}
                      onChange={e => { setSaturation(Number(e.target.value)); setEnhanceModel('custom'); }} />
                    <span className="c-slider-val">{saturation}%</span>
                  </div>

                  <div className="stack-divider" />

                  <div className="c-slider-row">
                    <span className="c-slider-lbl">{t.sharpen}</span>
                    <input type="range" min={0} max={100} value={sharpen}
                      onChange={e => { setSharpen(Number(e.target.value)); setEnhanceModel('custom'); }} />
                    <span className="c-slider-val">{sharpen}%</span>
                  </div>
                  <div className="c-slider-row">
                    <span className="c-slider-lbl">{t.clarity}</span>
                    <input type="range" min={0} max={100} value={clarity}
                      onChange={e => { setClarity(Number(e.target.value)); setEnhanceModel('custom'); }} />
                    <span className="c-slider-val">{clarity}%</span>
                  </div>
                  <div className="c-slider-row">
                    <span className="c-slider-lbl">{t.denoise}</span>
                    <input type="range" min={0} max={100} value={denoise}
                      onChange={e => { setDenoise(Number(e.target.value)); setEnhanceModel('custom'); }} />
                    <span className="c-slider-val">{denoise}%</span>
                  </div>
                </div>
              </div>
            )}

            {/* ---------- TAB 2: 8-CHANNEL HSL COLOR MIXER ---------- */}
            {toolTab === 'mixer' && (
              <div className="tab-card">
                <div className="hsl-subtabs">
                  <button
                    className={`hsl-subtab ${hslMode === 'hue' ? 'active' : ''}`}
                    onClick={() => setHslMode('hue')}
                  >
                    Hue
                  </button>
                  <button
                    className={`hsl-subtab ${hslMode === 'sat' ? 'active' : ''}`}
                    onClick={() => setHslMode('sat')}
                  >
                    Saturation
                  </button>
                  <button
                    className={`hsl-subtab ${hslMode === 'lum' ? 'active' : ''}`}
                    onClick={() => setHslMode('lum')}
                  >
                    Luminance
                  </button>
                </div>

                <div className="sliders-stack">
                  {HSL_CHANNELS.map(ch => {
                    const val = colorMixer[ch.key][hslMode];
                    return (
                      <div className="c-slider-row" key={ch.key}>
                        <span className="c-slider-lbl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="color-dot" style={{ background: ch.color }} />
                          {ch.label}
                        </span>
                        <input
                          type="range"
                          min={-100}
                          max={100}
                          value={val}
                          onChange={e => updateHslChannel(ch.key, hslMode, Number(e.target.value))}
                          onDoubleClick={() => updateHslChannel(ch.key, hslMode, 0)}
                        />
                        <span className="c-slider-val">{val > 0 ? `+${val}` : val}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ---------- TAB 3: LIGHTROOM PYRAMID COLOR GRADING WHEELS ---------- */}
            {toolTab === 'grading' && (
              <div className="tab-card lr-grading-card">
                {/* Top Center Wheel: Midtones */}
                <div className="lr-pyramid-top">
                  <ColorWheelControl
                    title={t.wheelMidtones}
                    value={colorGrading.midtones}
                    size={56}
                    onChange={midtones => setColorGrading(p => ({ ...p, midtones }))}
                    onReset={() => setColorGrading(p => ({ ...p, midtones: { hue: 40, sat: 0, lum: 0 } }))}
                  />
                </div>

                {/* Bottom 2 Wheels: Shadows (Left) & Highlights (Right) */}
                <div className="lr-pyramid-bottom">
                  <ColorWheelControl
                    title={t.wheelShadows}
                    value={colorGrading.shadows}
                    size={56}
                    onChange={shadows => setColorGrading(p => ({ ...p, shadows }))}
                    onReset={() => setColorGrading(p => ({ ...p, shadows: { hue: 210, sat: 0, lum: 0 } }))}
                  />
                  <ColorWheelControl
                    title={t.wheelHighlights}
                    value={colorGrading.highlights}
                    size={56}
                    onChange={highlights => setColorGrading(p => ({ ...p, highlights }))}
                    onReset={() => setColorGrading(p => ({ ...p, highlights: { hue: 45, sat: 0, lum: 0 } }))}
                  />
                </div>

                {/* Blending & Balance Footer */}
                <div className="lr-grading-footer">
                  <div className="c-slider-row">
                    <span className="c-slider-lbl" style={{ width: 64 }}>{t.blending}</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={colorGrading.blending}
                      onChange={e => setColorGrading(p => ({ ...p, blending: Number(e.target.value) }))}
                      onDoubleClick={() => setColorGrading(p => ({ ...p, blending: 50 }))}
                    />
                    <span className="c-slider-val">{colorGrading.blending}</span>
                  </div>

                  <div className="c-slider-row">
                    <span className="c-slider-lbl" style={{ width: 64 }}>{t.balance}</span>
                    <input
                      type="range"
                      min={-100}
                      max={100}
                      value={colorGrading.balance}
                      onChange={e => setColorGrading(p => ({ ...p, balance: Number(e.target.value) }))}
                      onDoubleClick={() => setColorGrading(p => ({ ...p, balance: 0 }))}
                    />
                    <span className="c-slider-val">
                      {colorGrading.balance > 0 ? `+${colorGrading.balance}` : colorGrading.balance}
                    </span>
                  </div>

                  <div className="wheel-hint">{t.wheelHint}</div>
                </div>
              </div>
            )}

              </>
            )}
          </div>

          {/* SECTION 4: Dedicated Watermark & Logo Branding Panel */}
          <div className={`panel-section ${!isWatermarkOpen ? 'collapsed' : ''}`}>
            <div
              className="panel-header-line clickable"
              onClick={() => setIsWatermarkOpen(v => !v)}
              style={{ marginBottom: isWatermarkOpen ? 3 : 0 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="collapse-arrow">{isWatermarkOpen ? '▼' : '▶'}</span>
                <span className="panel-title">{lang === 'th' ? 'ลายน้ำและโลโก้' : 'Watermark & Logo'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                {watermark.image ? (
                  <span
                    className="panel-collapsed-badge"
                    style={{
                      color: '#6ee7b7',
                      borderColor: 'rgba(16, 185, 129, 0.45)',
                      background: 'rgba(16, 185, 129, 0.12)',
                    }}
                  >
                    🟢 🏷️ {watermarkName ? watermarkName.slice(0, 10) : 'Logo'} • {watermark.anchor.toUpperCase()} ({watermark.scale}%)
                  </span>
                ) : (
                  <span className="panel-collapsed-badge">
                    {lang === 'th' ? 'ปิดอยู่' : 'Off'}
                  </span>
                )}
              </div>
            </div>

            {isWatermarkOpen && (
              <div className="tab-card psx-watermark-panel">
                {/* 1. Top Action Bar (Delete, Upload, Flip, Rotate CCW, Rotate CW, Reset) */}
                <div className="psx-top-actions">
                  <button
                    type="button"
                    className="psx-icon-btn"
                    onClick={() => {
                      setWatermark(prev => ({ ...prev, image: null }));
                      setWatermarkName('');
                    }}
                    disabled={!watermark.image}
                    title="Remove Logo"
                  >
                    🗑️
                  </button>
                  <button
                    type="button"
                    className="psx-icon-btn primary"
                    onClick={() => logoInputRef.current?.click()}
                    title="Upload / Change Logo PNG"
                  >
                    ➕
                  </button>
                  <button
                    type="button"
                    className={`psx-icon-btn ${watermark.flipH ? 'active' : ''}`}
                    onClick={() => setWatermark(p => ({ ...p, flipH: !p.flipH }))}
                    title="Flip Horizontal"
                  >
                    ⇄
                  </button>
                  <button
                    type="button"
                    className="psx-icon-btn"
                    onClick={() => setWatermark(p => ({ ...p, angle: ((p.angle - 90 + 540) % 360) - 180 }))}
                    title="Rotate 90° Counter-Clockwise"
                  >
                    ↺
                  </button>
                  <button
                    type="button"
                    className="psx-icon-btn"
                    onClick={() => setWatermark(p => ({ ...p, angle: ((p.angle + 90 + 540) % 360) - 180 }))}
                    title="Rotate 90° Clockwise"
                  >
                    ↻
                  </button>
                  <button
                    type="button"
                    className="psx-icon-btn"
                    onClick={() => setWatermark(p => ({ ...createDefaultWatermarkSettings(), image: p.image }))}
                    title="Reset Watermark Settings"
                  >
                    ⋯
                  </button>
                </div>

                {!watermark.image && (
                  <div className="psx-upload-banner" onClick={() => logoInputRef.current?.click()}>
                    <span>🏷️ Click <strong>➕</strong> or here to load a Logo / Watermark (.PNG)</span>
                  </div>
                )}

                {/* 2. 3x3 Anchor Point Grid + X / Y Offset */}
                <div className="psx-anchor-section">
                  <div className="psx-anchor-grid">
                    {ANCHOR_GRID.map(pt => (
                      <button
                        key={pt}
                        type="button"
                        className={`psx-anchor-dot ${watermark.anchor === pt ? 'active' : ''}`}
                        onClick={() => setWatermark(p => ({ ...p, anchor: pt }))}
                        title={`Anchor: ${pt.toUpperCase()}`}
                      />
                    ))}
                  </div>

                  <div className="psx-anchor-xy">
                    <div className="psx-anchor-title">Anchor Point</div>
                    <div className="psx-xy-row">
                      <span>X:</span>
                      <input
                        type="number"
                        className="psx-num-input"
                        min={-100}
                        max={100}
                        value={watermark.offsetX}
                        onChange={e => setWatermark(p => ({ ...p, offsetX: Number(e.target.value) || 0 }))}
                      />
                    </div>
                    <div className="psx-xy-row">
                      <span>Y:</span>
                      <input
                        type="number"
                        className="psx-num-input"
                        min={-100}
                        max={100}
                        value={watermark.offsetY}
                        onChange={e => setWatermark(p => ({ ...p, offsetY: Number(e.target.value) || 0 }))}
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Preserve Aspect Ratio + Scale Badge + Scale Slider */}
                <div className="psx-row-between">
                  <label className="psx-check">
                    <input
                      type="checkbox"
                      checked={watermark.preserveAspect}
                      onChange={e => setWatermark(p => ({ ...p, preserveAspect: e.target.checked }))}
                    />
                    <span>Preserve Aspect Ratio</span>
                  </label>
                  <div className="psx-scale-badge">Scale: {watermark.scale}%</div>
                </div>

                <div className="c-slider-row">
                  <span className="c-slider-lbl" style={{ width: 52 }}>Scale</span>
                  <input
                    type="range"
                    min={2}
                    max={80}
                    value={watermark.scale}
                    onChange={e => setWatermark(p => ({ ...p, scale: Number(e.target.value) }))}
                  />
                  <input
                    type="number"
                    className="psx-num-sm"
                    min={2}
                    max={100}
                    value={watermark.scale}
                    onChange={e => setWatermark(p => ({ ...p, scale: Math.max(2, Number(e.target.value) || 18) }))}
                  />
                </div>

                <label className="psx-check">
                  <input
                    type="checkbox"
                    checked={watermark.antiAlias}
                    onChange={e => setWatermark(p => ({ ...p, antiAlias: e.target.checked }))}
                  />
                  <span>Anti-alias</span>
                </label>

                {/* 4. 2x2 Checkboxes: Background, Fill, Color, Masks */}
                <div className="psx-check-grid">
                  <div className="psx-check-with-color">
                    <label className="psx-check">
                      <input
                        type="checkbox"
                        checked={watermark.background}
                        onChange={e => setWatermark(p => ({ ...p, background: e.target.checked }))}
                      />
                      <span>Background</span>
                    </label>
                    {watermark.background && (
                      <input
                        type="color"
                        className="psx-color-swatch"
                        value={watermark.bgColor}
                        onChange={e => setWatermark(p => ({ ...p, bgColor: e.target.value }))}
                      />
                    )}
                  </div>

                  <label className="psx-check">
                    <input
                      type="checkbox"
                      checked={watermark.fill}
                      onChange={e => setWatermark(p => ({ ...p, fill: e.target.checked }))}
                    />
                    <span>Fill</span>
                  </label>

                  <div className="psx-check-with-color">
                    <label className="psx-check">
                      <input
                        type="checkbox"
                        checked={watermark.colorTint}
                        onChange={e => setWatermark(p => ({ ...p, colorTint: e.target.checked }))}
                      />
                      <span>Color</span>
                    </label>
                    {watermark.colorTint && (
                      <input
                        type="color"
                        className="psx-color-swatch"
                        value={watermark.tintColor}
                        onChange={e => setWatermark(p => ({ ...p, tintColor: e.target.value }))}
                      />
                    )}
                  </div>

                  <label className="psx-check">
                    <input
                      type="checkbox"
                      checked={watermark.masks}
                      onChange={e => setWatermark(p => ({ ...p, masks: e.target.checked }))}
                    />
                    <span>Masks</span>
                  </label>
                </div>

                {/* 5. Angle, Opacity & Blend Mode */}
                <div className="c-slider-row">
                  <span className="c-slider-lbl" style={{ width: 52 }}>Angle</span>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    value={watermark.angle}
                    onChange={e => setWatermark(p => ({ ...p, angle: Number(e.target.value) }))}
                    onDoubleClick={() => setWatermark(p => ({ ...p, angle: 0 }))}
                  />
                  <input
                    type="number"
                    className="psx-num-sm"
                    min={-180}
                    max={180}
                    value={watermark.angle}
                    onChange={e => setWatermark(p => ({ ...p, angle: Number(e.target.value) || 0 }))}
                  />
                </div>

                <div className="c-slider-row">
                  <span className="c-slider-lbl" style={{ width: 52 }}>Opacity</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={watermark.opacity}
                    onChange={e => setWatermark(p => ({ ...p, opacity: Number(e.target.value) }))}
                  />
                  <input
                    type="number"
                    className="psx-num-sm"
                    min={0}
                    max={100}
                    value={watermark.opacity}
                    onChange={e => setWatermark(p => ({ ...p, opacity: Math.min(100, Math.max(0, Number(e.target.value) || 0)) }))}
                  />
                </div>

                <div className="c-slider-row">
                  <span className="c-slider-lbl" style={{ width: 68 }}>Blend Mode</span>
                  <select
                    className="compact-select"
                    style={{ flex: 1 }}
                    value={watermark.blendMode}
                    onChange={e => setWatermark(p => ({ ...p, blendMode: e.target.value as GlobalCompositeOperation }))}
                  >
                    <option value="source-over">Normal</option>
                    <option value="multiply">Multiply</option>
                    <option value="screen">Screen</option>
                    <option value="overlay">Overlay</option>
                    <option value="soft-light">Soft Light</option>
                    <option value="lighten">Lighten</option>
                    <option value="darken">Darken</option>
                    <option value="difference">Difference</option>
                  </select>
                </div>

                {/* 6. Shapes Box (Rectangle, Circle, Ellipse, Roundness) */}
                <div className="psx-shapes-box">
                  <button
                    type="button"
                    className="psx-shapes-toggle"
                    onClick={() => setShapesExpanded(v => !v)}
                  >
                    <span>{shapesExpanded ? '—' : '＋'}</span>
                    <span className="psx-shapes-title">Shapes</span>
                  </button>

                  {shapesExpanded && (
                    <div className="psx-shapes-body">
                      <div className="psx-radio-row">
                        {(['rectangle', 'circle', 'ellipse'] as WatermarkShape[]).map(sh => (
                          <label key={sh} className="psx-radio">
                            <input
                              type="radio"
                              name="wm-shape"
                              checked={watermark.shape === sh}
                              onChange={() => setWatermark(p => ({ ...p, shape: sh }))}
                            />
                            <span>{sh.charAt(0).toUpperCase() + sh.slice(1)}</span>
                          </label>
                        ))}
                      </div>

                      {watermark.shape === 'rectangle' && (
                        <div className="c-slider-row">
                          <span className="c-slider-lbl" style={{ width: 64 }}>Roundness</span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={watermark.roundness}
                            onChange={e => setWatermark(p => ({ ...p, roundness: Number(e.target.value) }))}
                          />
                          <input
                            type="number"
                            className="psx-num-sm"
                            min={0}
                            max={100}
                            value={watermark.roundness}
                            onChange={e => setWatermark(p => ({ ...p, roundness: Number(e.target.value) || 0 }))}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 7. Bottom Layer Effects Checkboxes (Outline, Drop Shadow, Long Shadow, Glows, Emboss) */}
                <div className="psx-effects-grid">
                  <label className="psx-check">
                    <input
                      type="checkbox"
                      checked={watermark.outline}
                      onChange={e => setWatermark(p => ({ ...p, outline: e.target.checked }))}
                    />
                    <span>Outline</span>
                  </label>
                  <label className="psx-check">
                    <input
                      type="checkbox"
                      checked={watermark.longShadow}
                      onChange={e => setWatermark(p => ({ ...p, longShadow: e.target.checked }))}
                    />
                    <span>Long Shadow</span>
                  </label>

                  <label className="psx-check">
                    <input
                      type="checkbox"
                      checked={watermark.dropShadow}
                      onChange={e => setWatermark(p => ({ ...p, dropShadow: e.target.checked }))}
                    />
                    <span>Drop Shadow</span>
                  </label>
                  <label className="psx-check">
                    <input
                      type="checkbox"
                      checked={watermark.outerGlow}
                      onChange={e => setWatermark(p => ({ ...p, outerGlow: e.target.checked }))}
                    />
                    <span>Outer Glow</span>
                  </label>

                  <label className="psx-check">
                    <input
                      type="checkbox"
                      checked={watermark.innerGlow}
                      onChange={e => setWatermark(p => ({ ...p, innerGlow: e.target.checked }))}
                    />
                    <span>Inner Glow</span>
                  </label>
                  <label className="psx-check">
                    <input
                      type="checkbox"
                      checked={watermark.innerShadow}
                      onChange={e => setWatermark(p => ({ ...p, innerShadow: e.target.checked }))}
                    />
                    <span>Inner Shadow</span>
                  </label>

                  <label className="psx-check">
                    <input
                      type="checkbox"
                      checked={watermark.emboss}
                      onChange={e => setWatermark(p => ({ ...p, emboss: e.target.checked }))}
                    />
                    <span>Emboss</span>
                  </label>
                  <label className="psx-check">
                    <input
                      type="checkbox"
                      checked={watermark.flipH}
                      onChange={e => setWatermark(p => ({ ...p, flipH: e.target.checked }))}
                    />
                    <span>Transform</span>
                  </label>
                </div>
              </div>
            )}
          </div>

        </aside>
      </div>
    </div>
  );
}
