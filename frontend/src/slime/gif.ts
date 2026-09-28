import type { Application } from 'pixi.js'
import { applyPalette, GIFEncoder, quantize, type Palette } from 'gifenc'

const GIF_MAX_COLORS = 256

type RecordOptions = {
  durationMs: number
  fps: number
  /** GIFs have no alpha, so frames are flattened onto this colour. */
  background: string
  /** Checked between frames; returning true aborts the recording. */
  cancelled: () => boolean
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Capture the stage for `durationMs` and encode it as a GIF. Resolves to
 * null if cancelled part-way.
 */
export async function recordStageGif(
  app: Application,
  { durationMs, fps, background, cancelled }: RecordOptions,
): Promise<Blob | null> {
  const frameDelay = Math.round(1000 / fps)
  const frameCount = Math.max(2, Math.round(durationMs / frameDelay))
  const gif = GIFEncoder()
  // The slime's colour set barely changes frame to frame, so quantize once
  // from the first frame and reuse it: re-quantizing every frame was the
  // dominant cost of recording and made frame colours drift.
  let palette: Palette | null = null
  for (let i = 0; i < frameCount; i++) {
    const { pixels, width, height } = app.renderer.extract.pixels({
      target: app.stage,
      resolution: 1,
      clearColor: background,
    })
    palette ??= quantize(pixels, GIF_MAX_COLORS)
    gif.writeFrame(applyPalette(pixels, palette), width, height, {
      palette,
      delay: frameDelay,
    })
    if (cancelled()) return null
    if (i < frameCount - 1) await sleep(frameDelay)
  }
  gif.finish()
  return new Blob([gif.bytes()], { type: 'image/gif' })
}

/** Save a blob through a temporary download link. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // Revoking synchronously can cancel the download before the browser has
  // started reading the blob, so give it a moment.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
