/** A canvas's picture as PNG bytes; null when the browser cannot encode it. */
export function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) return resolve(null);
      blob.arrayBuffer().then(
        (buffer) => resolve(new Uint8Array(buffer)),
        () => resolve(null)
      );
    }, 'image/png');
  });
}
