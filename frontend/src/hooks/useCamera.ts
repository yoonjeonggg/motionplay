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
  video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
  audio: false,
}

/**
 * Manages a getUserMedia webcam stream bound to a <video> element.
 * All video stays on-device; nothing is uploaded (privacy note in the plan).
 */
export function useCamera(): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setStatus('idle')
  }, [])

  const start = useCallback(async () => {
    if (streamRef.current) return
    setStatus('requesting')
    setError(null)
    try {
      const video = videoRef.current
      if (!video) throw new Error('비디오 요소를 찾을 수 없습니다.')
      const stream = await navigator.mediaDevices.getUserMedia(CONSTRAINTS)
      streamRef.current = stream
      video.srcObject = stream
      await video.play()
      setStatus('streaming')
    } catch (err) {
      // Release whatever was acquired before the failure (e.g. play() was
      // rejected): otherwise the camera stays on and the streamRef guard
      // above blocks every retry.
      stop()
      const name = err instanceof DOMException ? err.name : ''
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setStatus('denied')
        setError('카메라 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요.')
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setStatus('error')
        setError('사용 가능한 카메라를 찾을 수 없습니다.')
      } else {
        setStatus('error')
        setError(err instanceof Error ? err.message : '카메라를 시작하지 못했습니다.')
      }
    }
  }, [stop])

  useEffect(() => stop, [stop])

  return { videoRef, status, error, start, stop }
}
