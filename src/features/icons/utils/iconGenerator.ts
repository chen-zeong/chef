import JSZip from "jszip";

export type PlatformId = "android" | "ios" | "macos" | "windows" | "web";

export type GeneratedAsset = {
  filename: string;
  blob: Blob;
  mime: string;
};

const ANDROID_VARIANTS = [
  { folder: "mipmap-mdpi", size: 48 },
  { folder: "mipmap-hdpi", size: 72 },
  { folder: "mipmap-xhdpi", size: 96 },
  { folder: "mipmap-xxhdpi", size: 144 },
  { folder: "mipmap-xxxhdpi", size: 192 },
  { folder: "play-store", size: 512 }
];

type IosVariant = {
  idiom: "iphone" | "ipad" | "ios-marketing";
  size: number;
  scale: 1 | 2 | 3;
};

const IOS_VARIANTS: IosVariant[] = [
  { idiom: "iphone", size: 20, scale: 2 },
  { idiom: "iphone", size: 20, scale: 3 },
  { idiom: "iphone", size: 29, scale: 2 },
  { idiom: "iphone", size: 29, scale: 3 },
  { idiom: "iphone", size: 40, scale: 2 },
  { idiom: "iphone", size: 40, scale: 3 },
  { idiom: "iphone", size: 60, scale: 2 },
  { idiom: "iphone", size: 60, scale: 3 },
  { idiom: "ipad", size: 20, scale: 1 },
  { idiom: "ipad", size: 20, scale: 2 },
  { idiom: "ipad", size: 29, scale: 1 },
  { idiom: "ipad", size: 29, scale: 2 },
  { idiom: "ipad", size: 40, scale: 1 },
  { idiom: "ipad", size: 40, scale: 2 },
  { idiom: "ipad", size: 76, scale: 1 },
  { idiom: "ipad", size: 76, scale: 2 },
  { idiom: "ipad", size: 83.5, scale: 2 },
  { idiom: "ios-marketing", size: 1024, scale: 1 }
];

const MAC_SIZES = [16, 32, 64, 128, 256, 512, 1024];
const WINDOWS_SIZES = [16, 32, 64, 96, 128, 256];
const WEB_SIZES = [16, 32, 48];

const ICNS_TYPE_MAP: Record<number, string> = {
  16: "icp4",
  32: "icp5",
  64: "icp6",
  128: "ic07",
  256: "ic08",
  512: "ic09",
  1024: "ic10"
};

const sanitizePattern = /[^a-z0-9-_]+/gi;

export const sanitizeFileName = (value: string) => {
  const fallback = "app-icon";
  if (!value) {
    return fallback;
  }
  const trimmed = value.trim().toLowerCase();
  const sanitized = trimmed.replace(sanitizePattern, "-").replace(/^-+|-+$/g, "");
  return sanitized || fallback;
};

const getSquareContext = (size: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("无法创建画布上下文。");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { canvas, ctx };
};

const canvasToPngBytes = (canvas: HTMLCanvasElement) =>
  new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("生成 PNG 失败，请重试。"));
        return;
      }
      blob.arrayBuffer().then(
        (buffer) => resolve(new Uint8Array(buffer)),
        () => reject(new Error("读取 PNG 数据失败。"))
      );
    }, "image/png");
  });

const renderPngBytes = async (image: HTMLImageElement, size: number) => {
  const { canvas, ctx } = getSquareContext(size);
  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sx = (image.naturalWidth - sourceSize) / 2;
  const sy = (image.naturalHeight - sourceSize) / 2;
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(image, sx, sy, sourceSize, sourceSize, 0, 0, size, size);
  return canvasToPngBytes(canvas);
};

const writeAscii = (buffer: Uint8Array, offset: number, text: string) => {
  for (let i = 0; i < text.length; i++) {
    buffer[offset + i] = text.charCodeAt(i);
  }
};

const buildIco = (entries: { size: number; data: Uint8Array }[]): Blob => {
  const count = entries.length;
  const headerSize = 6 + count * 16;
  const totalSize = headerSize + entries.reduce((sum, entry) => sum + entry.data.length, 0);
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, count, true);
  let offset = headerSize;
  entries.forEach((entry, index) => {
    const entryOffset = 6 + index * 16;
    bytes[entryOffset] = entry.size === 256 ? 0 : entry.size;
    bytes[entryOffset + 1] = entry.size === 256 ? 0 : entry.size;
    bytes[entryOffset + 2] = 0;
    bytes[entryOffset + 3] = 0;
    view.setUint16(entryOffset + 4, 1, true);
    view.setUint16(entryOffset + 6, 32, true);
    view.setUint32(entryOffset + 8, entry.data.length, true);
    view.setUint32(entryOffset + 12, offset, true);
    bytes.set(entry.data, offset);
    offset += entry.data.length;
  });
  return new Blob([buffer], { type: "image/x-icon" });
};

const buildIcns = (entries: { type: string; data: Uint8Array }[]): Blob => {
  const totalSize = 8 + entries.reduce((sum, entry) => sum + 8 + entry.data.length, 0);
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  writeAscii(bytes, 0, "icns");
  view.setUint32(4, totalSize, false);
  let offset = 8;
  entries.forEach((entry) => {
    writeAscii(bytes, offset, entry.type);
    view.setUint32(offset + 4, entry.data.length + 8, false);
    bytes.set(entry.data, offset + 8);
    offset += 8 + entry.data.length;
  });
  return new Blob([buffer], { type: "image/icns" });
};

const generateAndroid = async (image: HTMLImageElement, name: string): Promise<GeneratedAsset> => {
  const zip = new JSZip();
  await Promise.all(
    ANDROID_VARIANTS.map(async (variant) => {
      const data = await renderPngBytes(image, variant.size);
      zip.file(
        `android/${variant.folder}/ic_launcher.png`,
        data,
        {
          binary: true
        }
      );
    })
  );
  const blob = await zip.generateAsync({ type: "blob" });
  return {
    filename: `${name}-android.zip`,
    blob,
    mime: "application/zip"
  };
};

const generateIos = async (image: HTMLImageElement, name: string): Promise<GeneratedAsset> => {
  const zip = new JSZip();
  const images = await Promise.all(
    IOS_VARIANTS.map(async (variant) => {
      const renderedSize = variant.size * variant.scale;
      const data = await renderPngBytes(image, renderedSize);
      const filename = `icon-${variant.size}x${variant.size}@${variant.scale}x.png`;
      zip.file(`ios/AppIcon.appiconset/${filename}`, data, { binary: true });
      return {
        idiom: variant.idiom,
        size: `${variant.size}x${variant.size}`,
        scale: `${variant.scale}x`,
        filename
      };
    })
  );
  const contents = {
    images,
    info: {
      version: 1,
      author: "xcode"
    }
  };
  zip.file("ios/AppIcon.appiconset/Contents.json", JSON.stringify(contents, null, 2));
  const blob = await zip.generateAsync({ type: "blob" });
  return {
    filename: `${name}-ios.zip`,
    blob,
    mime: "application/zip"
  };
};

const generateWindows = async (image: HTMLImageElement, name: string): Promise<GeneratedAsset> => {
  const entries = [];
  for (const size of WINDOWS_SIZES) {
    const data = await renderPngBytes(image, size);
    entries.push({ size, data });
  }
  const blob = buildIco(entries);
  return {
    filename: `${name}-windows.ico`,
    blob,
    mime: "image/x-icon"
  };
};

const generateWeb = async (image: HTMLImageElement, name: string): Promise<GeneratedAsset> => {
  const entries = [];
  for (const size of WEB_SIZES) {
    const data = await renderPngBytes(image, size);
    entries.push({ size, data });
  }
  const blob = buildIco(entries);
  return {
    filename: `${name}-web.ico`,
    blob,
    mime: "image/x-icon"
  };
};

const generateMac = async (image: HTMLImageElement, name: string): Promise<GeneratedAsset> => {
  const entries = [];
  for (const size of MAC_SIZES) {
    const data = await renderPngBytes(image, size);
    const type = ICNS_TYPE_MAP[size];
    if (type) {
      entries.push({ type, data });
    }
  }
  const blob = buildIcns(entries);
  return {
    filename: `${name}-mac.icns`,
    blob,
    mime: "image/icns"
  };
};

export const platformGenerators: Record<
  PlatformId,
  (image: HTMLImageElement, name: string) => Promise<GeneratedAsset>
> = {
  android: generateAndroid,
  ios: generateIos,
  macos: generateMac,
  windows: generateWindows,
  web: generateWeb
};

export const generatePlatformAsset = (platform: PlatformId, image: HTMLImageElement, name: string) => {
  const generator = platformGenerators[platform];
  if (!generator) {
    throw new Error("暂不支持的图标格式。");
  }
  return generator(image, name);
};
