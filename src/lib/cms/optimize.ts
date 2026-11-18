// Browser-side image optimisation before upload: phone photos are resized
// (longest side 2400px), rotated upright and re-encoded as WebP (or JPEG where
// the browser can't write WebP). Typical result: 200–600 KB instead of 5–10 MB.

export type Optimised = { file: File; width: number | null; height: number | null };

const MAX_SIDE = 2400;

export async function optimiseImage(original: File): Promise<Optimised> {
  try {
    const bitmap = await createImageBitmap(original, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    for (const type of ["image/webp", "image/jpeg"]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.82));
      if (blob && blob.type === type) {
        // Keep the original if it was already smaller (e.g. a small PNG logo).
        if (blob.size >= original.size && original.size < 8 * 1024 * 1024 && scale === 1) return { file: original, width, height };
        const name = original.name.replace(/\.[^.]+$/, "") + (type === "image/webp" ? ".webp" : ".jpg");
        return { file: new File([blob], name, { type }), width, height };
      }
    }
    return { file: original, width, height };
  } catch {
    // Unsupported format or browser: send the original and let the server check it.
    return { file: original, width: null, height: null };
  }
}

export const formatBytes = (n: number | null) =>
  n == null ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`;
