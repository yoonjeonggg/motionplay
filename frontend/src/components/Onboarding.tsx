import { useEffect, useRef } from 'react'
import {
  Hand,
  HandFist,
  HandGrab,
  type LucideIcon,
  MousePointer2,
  ShieldCheck,
  Star,
  Video,
  X,
} from 'lucide-react'
import './Onboarding.css'

type Step = { Icon: LucideIcon; text: React.ReactNode }

// Keep in sync with what the code actually does: handControl.ts for hands,
// useSlimePointer.ts for the mouse.
const MOUSE_STEPS: Step[] = [
  {
    Icon: MousePointer2,
    text: (
      <>
        슬라임을 <b>드래그</b>하면 잡아서 늘리고 옮겨요
      </>
    ),
  },
  {
    Icon: Star,
    text: (
      <>
        아래에서 <b>토핑</b>을 고르고 슬라임을 <b>클릭</b>하면 붙어요
      </>
    ),
  },
]

const HAND_STEPS: Step[] = [
  {
    Icon: HandFist,
    text: (
      <>
        <b>주먹</b>을 쥐고 움직이면 슬라임을 잡아 끌어요
      </>
    ),
  },
  {
    Icon: Hand,
    text: (
      <>
        <b>편 손</b>을 휙 움직이면 슬라임을 꾹 눌러요
      </>
    ),
  },
  {
    Icon: HandGrab,
    text: (
      <>
        엄지와 검지로 <b>집었다 놓으면</b> 그 자리에 토핑이 붙어요
      </>
    ),
  },
]

type Props = {
  onClose: () => void
  onStartCamera: () => void
}

export function Onboarding({ onClose, onStartCamera }: Props) {
  const startRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    startRef.current?.focus()
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
              말랑한 슬라임을 주물러 보세요
            </h2>
            <p className="text-muted">마우스로도, 카메라 앞에서 손으로도 놀 수 있어요.</p>
          </div>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="닫기">
            <X size={18} aria-hidden />
          </button>
        </div>

        <StepList title="마우스 · 터치" steps={MOUSE_STEPS} />
        <StepList title="손동작 (카메라)" steps={HAND_STEPS} />

        <p className="note">
          <ShieldCheck size={14} aria-hidden />
          카메라 영상은 이 기기 안에서만 처리되고 어디에도 전송되지 않아요.
        </p>

        <div className="onboarding-actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              onClose()
              onStartCamera()
            }}
          >
            <Video size={16} aria-hidden />
            손으로 시작하기
          </button>
          <button ref={startRef} type="button" className="btn btn-primary" onClick={onClose}>
            <MousePointer2 size={16} aria-hidden />
            마우스로 시작하기
          </button>
        </div>
      </div>
    </div>
  )
}

function StepList({ title, steps }: { title: string; steps: Step[] }) {
  return (
    <section className="onboarding-section">
      <h3 className="onboarding-section-title">{title}</h3>
      <ul className="onboarding-steps">
        {steps.map(({ Icon, text }, i) => (
          <li className="onboarding-step" key={i}>
            <span className="onboarding-step-icon">
              <Icon size={18} aria-hidden />
            </span>
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
