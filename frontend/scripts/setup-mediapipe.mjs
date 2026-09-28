// Prepares MediaPipe assets under public/mediapipe so the app can run fully
// offline (no CDN dependency, no version drift with the installed package).
//
// - Copies the tasks-vision WASM bundle from node_modules.
// - Downloads the hand_landmarker model once (cached, git-ignored) and checks
//   it against a pinned SHA-256, so a tampered download or cache never ships.
//
// Runs automatically via the `predev` / `prebuild` npm scripts.
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const wasmSrc = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const wasmDest = resolve(root, 'public/mediapipe/wasm')
const modelDest = resolve(root, 'public/mediapipe/models/hand_landmarker.task')
const modelUrl =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
// Update together with modelUrl when moving to a new model version.
const modelSha256 =
  'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1'

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

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
  if (existsSync(modelDest)) {
    if (sha256(await readFile(modelDest)) === modelSha256) {
      console.log('[mediapipe] hand_landmarker model already cached')
      return
    }
    console.warn('[mediapipe] cached model failed integrity check, re-downloading')
    await rm(modelDest)
  }
  await mkdir(dirname(modelDest), { recursive: true })
  console.log('[mediapipe] downloading hand_landmarker model...')
  const res = await fetch(modelUrl)
  if (!res.ok) {
    throw new Error(`model download failed: ${res.status} ${res.statusText}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  const actual = sha256(buf)
  if (actual !== modelSha256) {
    throw new Error(
      `model integrity check failed: expected sha256 ${modelSha256}, got ${actual}`,
    )
  }
  await writeFile(modelDest, buf)
  console.log('[mediapipe] model downloaded and verified')
}

await copyWasm()
await downloadModel()
