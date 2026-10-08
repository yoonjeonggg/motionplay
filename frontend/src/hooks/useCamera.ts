import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraStatus = 'idle' | 'requesting' | 'streaming' | 'denied' | 'error'

type UseCameraResult = {
  videoRef: React.RefObject<HTMLVideoElement | null>
  status: CameraStatus
  error: string | null
  /** Prompt for camera access and start the stream. */
  start: () => Promise<void>
  stop: () => void
}

const CONSTRAINTS: MediaStreamConstraints = {
  // Hand detection downscales to 640px wide anyway (see HandTracker), and the
  // preview is small, so a larger capture only costs decode and copy time.
  video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
  audio: false,
}

function describeError(err: unknown): { status: CameraStatus; message: string } {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      status: 'denied',
      message: '카메라 권한이 거부되었어요. 주소창의 카메라 아이콘에서 허용해 주세요.',
    }
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return { status: 'error', message: '사용할 수 있는 카메라를 찾지 못했어요.' }
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return { status: 'error', message: '다른 앱이 카메라를 쓰고 있어요. 그 앱을 닫고 다시 시도해 주세요.' }
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { status: 'error', message: '이 브라우저(또는 http 주소)에서는 카메라를 쓸 수 없어요.' }
  }
  return { status: 'error', message: '카메라를 시작하지 못했어요.' }
}

/**
 * Manages a getUserMedia webcam stream bound to a <video> element.
 * All video stays on-device; nothing is uploaded.
 */
export function useCamera(): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  // Bumped by stop(): a start() still waiting on the permission prompt sees
  // the change and releases what it gets, instead of switching the camera
  // on after the user (or an unmount) already turned it off.
  const attemptRef = useRef(0)
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const stop = useCallback(() => {
    attemptRef.current++
    release()
    setStatus('idle')
  }, [release])

  const start = useCallback(async () => {
    if (streamRef.current) return
    const attempt = ++attemptRef.current
    setStatus('requesting')
    setError(null)
    try {
      const video = videoRef.current
      if (!video) throw new Error('비디오 요소를 찾을 수 없습니다.')
      const stream = await navigator.mediaDevices.getUserMedia(CONSTRAINTS)
      if (attempt !== attemptRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      video.srcObject = stream
      // Unplugging the camera (or the OS revoking it) ends the track.
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (streamRef.current !== stream) return
        release()
        setStatus('error')
        setError('카메라 연결이 끊어졌어요.')
      })
      await video.play()
      if (attempt !== attemptRef.current) return
      setStatus('streaming')
    } catch (err) {
      if (attempt !== attemptRef.current) return
      // Release whatever was acquired before the failure (e.g. play() was
      // rejected): otherwise the camera stays on and the streamRef guard
      // above blocks every retry.
      release()
      const { status, message } = describeError(err)
      setStatus(status)
      setError(message)
    }
  }, [release])

  useEffect(() => stop, [stop])

  return { videoRef, status, error, start, stop }
}
