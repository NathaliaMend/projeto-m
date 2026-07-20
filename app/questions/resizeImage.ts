/**
 * Reduz uma imagem no navegador antes de subir para o Storage: reescala para no
 * máximo `maxDim` px no maior lado e reencoda em JPEG, baixando a qualidade até
 * ficar abaixo de ~1,2 MB. Roda só no cliente (usa canvas). Devolve o Blob JPEG.
 */
export async function resizeImage(file: File, maxDim = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const target = 1_200_000; // ~1,2 MB
  for (const quality of [0.82, 0.7, 0.6, 0.5]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (blob && (blob.size <= target || quality === 0.5)) return blob;
  }
  throw new Error("Não foi possível comprimir a imagem.");
}
