import { useEffect } from 'react'
import { Hand, HandFist, HandGrab, type LucideIcon, Move, ShieldCheck, X } from 'lucide-react'
import './Onboarding.css'

const STEPS: { Icon: LucideIcon; text: React.ReactNode }[] = [
  {
    Icon: HandFist,
    text: (
      <>
        주먹을 <b>쥐면</b> 슬라임을 누르고 뭉쳐요
      </>
    ),
  },
  {
    Icon: Hand,
    text: (
      <>
        손을 <b>펴면</b> 슬라임을 늘리고 펴요
      </>
    ),
  },
  {
    Icon: Move,
    text: (
      <>
        손을 <b>움직이면</b> 슬라임을 밀거나 옮겨요
      </>
    ),
  },
  {
    Icon: HandGrab,
    text: (
      <>
        손가락을 <b>집으면</b> 토핑을 들어 슬라임에 붙일 수 있어요
      </>
    ),
  },
]

type Props = {
  onClose: () => void
}

export function Onboarding({ onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="onboarding-backdrop" onClick={onClose}>
      <div
        className="panel onboarding-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="onboarding-header">
          <div>
            <h2 id="onboarding-title" className="onboarding-title">
              모션플레잉 사용법
            </h2>
            <p className="text-muted">
              카메라로 손동작을 인식해 슬라임을 조몰락거리며 놀 수 있어요.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm"
            onClick={onClose}
            aria-label="닫기"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <ol className="onboarding-steps">
          {STEPS.map(({ Icon, text }, i) => (
            <li className="onboarding-step" key={i}>
              <span className="onboarding-step-icon">
                <Icon size={18} aria-hidden />
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ol>

        <p className="onboarding-privacy">
          <ShieldCheck size={14} aria-hidden />
          카메라 영상은 기기에서만 처리되며 서버로 전송되지 않아요. 카메라 없이
          마우스나 터치로도 즐길 수 있어요.
        </p>

        <button type="button" className="btn btn-primary onboarding-start" onClick={onClose}>
          시작하기
        </button>
      </div>
    </div>
  )
}
