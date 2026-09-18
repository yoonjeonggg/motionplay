import './Onboarding.css'

const STEPS = [
  {
    icon: '✊',
    text: (
      <>
        주먹을 <b>쥐면</b> 슬라임을 누르고 뭉쳐요
      </>
    ),
  },
  {
    icon: '✋',
    text: (
      <>
        손을 <b>펴면</b> 슬라임을 늘리고 펴요
      </>
    ),
  },
  {
    icon: '👋',
    text: (
      <>
        손을 <b>움직이면</b> 슬라임을 밀거나 옮겨요
      </>
    ),
  },
  {
    icon: '🤏',
    text: (
      <>
        손가락을 <b>집으면(pinch)</b> 토핑을 선택해 슬라임에 붙일 수 있어요
      </>
    ),
  },
]

type Props = {
  onClose: () => void
}

export function Onboarding({ onClose }: Props) {
  return (
    <div className="onboarding-backdrop" onClick={onClose}>
      <div className="onboarding-card" onClick={(e) => e.stopPropagation()}>
        <div>
          <p className="onboarding-title">✨ 모션플레잉에 오신 걸 환영해요</p>
          <p className="onboarding-subtitle">
            카메라로 손동작을 인식해서 슬라임을 조몰락거리며 놀 수 있어요
          </p>
        </div>

        <div className="onboarding-steps">
          {STEPS.map((s, i) => (
            <div className="onboarding-step" key={i}>
              <span className="onboarding-step-icon">{s.icon}</span>
              <span className="onboarding-step-text">{s.text}</span>
            </div>
          ))}
        </div>

        <p className="onboarding-privacy">
          카메라 영상은 기기에서만 처리되며 서버로 전송되지 않아요. 카메라 없이
          마우스나 터치로도 즐길 수 있어요.
        </p>

        <button type="button" className="onboarding-start" onClick={onClose}>
          시작하기
        </button>
      </div>
    </div>
  )
}
