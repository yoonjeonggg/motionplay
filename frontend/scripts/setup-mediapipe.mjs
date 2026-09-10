// Prepares MediaPipe assets under public/mediapipe so the app can run fully
// offline (no CDN dependency, no version drift with the installed package).
//
// - Copies the tasks-vision WASM bundle from node_modules.
// - Downloads the hand_landmarker model once (cached, git-ignored).
//
// Runs automatically via the `predev` / `prebuild` npm scripts.
import { existsSync } from 'node:fs'
import { cp, mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const wasmSrc = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const wasmDest = resolve(root, 'public/mediapipe/wasm')
const modelDest = resolve(root, 'public/mediapipe/models/hand_landmarker.task')
const modelUrl =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

async function copyWasm() {
  if (!existsSync(wasmSrc)) {
    throw new Error(
      `MediaPipe WASM not found at ${wasmSrc}. Run "npm install" first.`,
    )
  }
  await mkdir(wasmDest, { recursive: true })
  await cp(wasmSrc, wasmDest, { recursive: true })
  console.log('[mediapipe] WASM bundle ready')
}

async function downloadModel() {
  if (existsSync(modelDest) && (await stat(modelDest)).size > 0) {
    console.log('[mediapipe] hand_landmarker model already cached')
    return
  }
  await mkdir(dirname(modelDest), { recursive: true })
  console.log('[mediapipe] downloading hand_landmarker model...')
  const res = await fetch(modelUrl)
  if (!res.ok) {
    throw new Error(`model download failed: ${res.status} ${res.statusText}`)
  }
  await writeFile(modelDest, Buffer.from(await res.arrayBuffer()))
  console.log('[mediapipe] model downloaded')
}

await copyWasm()
await downloadModel()
