/** Convert a Blob to a base64 data URL. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image blob."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Downscale a data URL so its longest side is at most `maxDim`.
 * Keeps payloads small enough for vision models and localStorage.
 */
export async function downscaleImage(dataUrl: string, maxDim = 1600): Promise<string> {
  try {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const { naturalWidth: w, naturalHeight: h } = img;
    if (!w || !h || Math.max(w, h) <= maxDim) return dataUrl;

    const scale = maxDim / Math.max(w, h);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch {
    return dataUrl;
  }
}
