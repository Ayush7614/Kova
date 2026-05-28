import { toJpeg } from 'html-to-image';
import jsPDF from 'jspdf';
import mermaid from 'mermaid';
import { mermaidSvgCache } from './mermaidSvgCache';
import { svgToPngDataUrl } from './svgToPng';
import type { AspectRatio } from '../types';
import type { Theme } from '../theme';

export interface PdfExportResult {
  base64: string;
  warnings: string[];
}

const PDF_W_MM  = 254;
const JPEG_QUALITY = 0.95;
const PIXEL_RATIO  = 2;

// Capture a slide as JPEG then composite each Mermaid diagram on top.
// This avoids modifying the DOM before capture and avoids relying on
// the off-screen SlideRenderer's Mermaid renders completing in time.
async function captureSlide(slideEl: HTMLElement, theme: Theme): Promise<string> {
  // Step 1: base screenshot — Mermaid areas may be placeholders or broken SVG,
  // but all other content (background, text, images) captures correctly.
  const baseJpeg = await toJpeg(slideEl, {
    quality: JPEG_QUALITY,
    pixelRatio: PIXEL_RATIO,
    width: slideEl.offsetWidth,
    height: slideEl.offsetHeight,
  });

  // Step 2: build a canvas from the base JPEG.
  const W = slideEl.offsetWidth  * PIXEL_RATIO;
  const H = slideEl.offsetHeight * PIXEL_RATIO;
  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  await new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => { ctx.drawImage(img, 0, 0, W, H); resolve(); };
    img.src = baseJpeg;
  });

  // Step 3: find every Mermaid container in this slide.
  // [data-mermaid-src] is present on both the loading and rendered states.
  const slideRect = slideEl.getBoundingClientRect();
  const containers = Array.from(slideEl.querySelectorAll<HTMLElement>('[data-mermaid-src]'));

  // Step 4: for each diagram, get its source, rasterise it, and paint it on
  // top of the canvas at the correct position.
  for (const container of containers) {
    const source = container.getAttribute('data-mermaid-src')!;

    let cached = mermaidSvgCache.get(source);
    if (!cached) {
      // Cache miss: render sequentially so Mermaid's global DOM state isn't
      // corrupted by concurrent calls. 15 s timeout mirrors the PPTX exporter.
      try {
        const id = `pdf-mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const result = await Promise.race<{ svg: string }>([
          mermaid.render(id, source),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 15_000),
          ),
        ]);
        mermaidSvgCache.set(source, result.svg);
        cached = result.svg;
      } catch {
        continue; // skip diagrams that fail or time out
      }
    }

    try {
      const { dataUrl, aspectRatio: diagramAR } = await svgToPngDataUrl(cached, theme.colors.background);
      const containerRect = container.getBoundingClientRect();
      const cx = (containerRect.left - slideRect.left) * PIXEL_RATIO;
      const cy = (containerRect.top  - slideRect.top)  * PIXEL_RATIO;
      const cw = containerRect.width  * PIXEL_RATIO;
      const ch = containerRect.height * PIXEL_RATIO;

      // Fit the diagram within the container preserving its natural aspect ratio
      // (object-fit: contain, centred) so tall sequence/pie charts aren't stretched.
      let drawW = cw;
      let drawH = cw / diagramAR;
      if (drawH > ch) { drawH = ch; drawW = ch * diagramAR; }
      const drawX = cx + (cw - drawW) / 2;
      const drawY = cy + (ch - drawH) / 2;

      await new Promise<void>((resolve) => {
        const diagramImg = new Image();
        diagramImg.onload  = () => { ctx.drawImage(diagramImg, drawX, drawY, drawW, drawH); resolve(); };
        diagramImg.onerror = () => resolve();
        diagramImg.src = dataUrl;
      });
    } catch { /* leave whatever the base capture produced */ }
  }

  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

export async function exportToPdf(
  slideElements: HTMLElement[],
  theme: Theme,
  aspectRatio: AspectRatio,
): Promise<PdfExportResult> {
  const warnings: string[] = [];
  const W = PDF_W_MM;
  const H = Math.round((W * (aspectRatio.h / aspectRatio.w)) * 100) / 100;

  const pdf = new jsPDF({ orientation: 'l', unit: 'mm', format: [W, H], compress: true });

  for (let i = 0; i < slideElements.length; i++) {
    if (i > 0) pdf.addPage([W, H], 'l');
    try {
      const dataUrl = await captureSlide(slideElements[i], theme);
      pdf.addImage(dataUrl, 'JPEG', 0, 0, W, H, undefined, 'FAST');
    } catch (err) {
      warnings.push(`Slide ${i + 1}: capture failed — ${String(err)}`);
    }
  }

  const raw = pdf.output('datauristring');
  const base64 = raw.includes(',') ? raw.split(',')[1] : raw;
  return { base64, warnings };
}
