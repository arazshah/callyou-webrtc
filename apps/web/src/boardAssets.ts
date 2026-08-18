import { LIMITS } from '@callyou/shared';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export type PreparedBoardAsset = { name: string; data: string; width: number; height: number };
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_PDF_PAGES = LIMITS.boardAssets;

async function encoded(canvas: HTMLCanvasElement): Promise<string> {
  let quality = 0.84;
  let data = canvas.toDataURL('image/webp', quality);
  while (data.length > LIMITS.boardAssetData && quality > 0.38) {
    quality -= 0.08;
    data = canvas.toDataURL('image/webp', quality);
  }
  if (data.length > LIMITS.boardAssetData) throw new Error('asset_too_large');
  return data;
}

function targetSize(width: number, height: number) {
  const scale = Math.min(1, 1440 / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function imageAsset(file: File): Promise<PreparedBoardAsset> {
  const bitmap = await createImageBitmap(file);
  const size = targetSize(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext('2d', { alpha: false })?.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  return { name: file.name, data: await encoded(canvas), ...size };
}

async function pdfAssets(file: File): Promise<PreparedBoardAsset[]> {
  const { GlobalWorkerOptions, getDocument } = await import('pdfjs-dist');
  GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  if (pdf.numPages > MAX_PDF_PAGES) throw new Error('too_many_pages');
  const assets: PreparedBoardAsset[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const natural = page.getViewport({ scale: 1.5 });
    const scale = Math.min(1, 1440 / Math.max(natural.width, natural.height));
    const viewport = page.getViewport({ scale: 1.5 * scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('canvas_unavailable');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    assets.push({
      name: `${file.name} — ${pageNumber}`,
      data: await encoded(canvas),
      width: canvas.width,
      height: canvas.height,
    });
  }
  return assets;
}

export async function prepareBoardAssets(file: File): Promise<PreparedBoardAsset[]> {
  if (file.size > MAX_SOURCE_BYTES) throw new Error('source_too_large');
  if (file.type === 'application/pdf') return pdfAssets(file);
  if (['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    return [await imageAsset(file)];
  throw new Error('unsupported_file');
}
