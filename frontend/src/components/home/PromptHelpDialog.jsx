import { useEffect, useRef } from "react";
import {
  PROMPT_EXAMPLES,
  RECOMMENDATION_GUIDES,
} from "../../utils/promptGuidance";
import locationIcon from "../../assets/images/prompt-help/location.png";
import timeIcon from "../../assets/images/prompt-help/time.png";
import cafeIcon from "../../assets/images/prompt-help/cafe.png";

const PROMPT_HELP_STEPS = [
  { label: "어디서", example: "홍대역", icon: locationIcon },
  { label: "얼마나", example: "2시간", icon: timeIcon },
  { label: "무엇을", example: "카페", icon: cafeIcon },
];

function PromptHelpDialog({ open, onClose, onSelectExample }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    closeButtonRef.current?.focus();
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="prompt-help-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="prompt-help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-help-title"
        aria-describedby="prompt-help-description"
      >
        <header className="prompt-help-header">
          <div>
            <p className="prompt-help-eyebrow">쉽게 물어보세요</p>
            <h2 id="prompt-help-title">무엇을 적으면 될까요?</h2>
            <p id="prompt-help-description">지역, 시간, 하고 싶은 일만 알려주세요.</p>
          </div>
          <button
            ref={closeButtonRef}
            className="prompt-help-close"
            type="button"
            aria-label="질문 도움말 닫기"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="prompt-help-hero">
          <div className="prompt-help-steps" aria-label="지역, 시간, 활동 순서로 입력">
            <div>
              <img src={PROMPT_HELP_STEPS[0].icon} alt="" />
              <b>{PROMPT_HELP_STEPS[0].label}</b>
              <small>{PROMPT_HELP_STEPS[0].example}</small>
            </div>
            <i aria-hidden="true">+</i>
            <div>
              <img src={PROMPT_HELP_STEPS[1].icon} alt="" />
              <b>{PROMPT_HELP_STEPS[1].label}</b>
              <small>{PROMPT_HELP_STEPS[1].example}</small>
            </div>
            <i aria-hidden="true">+</i>
            <div>
              <img src={PROMPT_HELP_STEPS[2].icon} alt="" />
              <b>{PROMPT_HELP_STEPS[2].label}</b>
              <small>{PROMPT_HELP_STEPS[2].example}</small>
            </div>
          </div>
          <p className="prompt-help-example">
            “홍대역인데 <b>2시간</b> 비어, <b>카페</b> 가고 싶어”
          </p>
          <p className="prompt-help-caption">
            이동시간과 머물 수 있는 시간은 코알라가 계산해요.
          </p>
        </div>

        <div className="prompt-help-details-list">
          <details className="prompt-help-details">
            <summary>
              <span>더 정확하게 추천받는 방법</span>
              <small>필수 정보와 추가 조건</small>
              <i aria-hidden="true" />
            </summary>
            <div className="prompt-help-detail-body">
              <div>
                <b>지역</b>
                <span>현재 위치를 쓰거나 가고 싶은 동네를 적어요.</span>
              </div>
              <div>
                <b>시간</b>
                <span>“2시간 비어” 또는 “8시까지 잠실”처럼 적어요.</span>
              </div>
              <div>
                <b>하고 싶은 일</b>
                <span>“밥 먹고 카페”처럼 순서대로 적으면 반영해요.</span>
              </div>
              <p>이동수단, 실내·실외, 동행인, 분위기는 원할 때만 덧붙이세요.</p>
            </div>
          </details>

          <details className="prompt-help-details">
            <summary>
              <span>추천 방식 알아보기</span>
              <small>상황에 맞는 기능 안내</small>
              <i aria-hidden="true" />
            </summary>
            <div className="prompt-help-feature-list">
              {RECOMMENDATION_GUIDES.map((guide) => (
                <article key={guide.id}>
                  <i aria-hidden="true">{guide.icon}</i>
                  <div>
                    <strong>{guide.title}</strong>
                    <p>{guide.summary}</p>
                  </div>
                </article>
              ))}
            </div>
          </details>

          <details className="prompt-help-details">
            <summary>
              <span>예시 문장으로 시작하기</span>
              <small>누르면 입력창에 바로 들어가요</small>
              <i aria-hidden="true" />
            </summary>
            <div className="prompt-help-examples">
              {PROMPT_EXAMPLES.map((example) => (
                <button
                  key={example.id}
                  type="button"
                  onClick={() => onSelectExample(example.text)}
                >
                  <small>{example.label}</small>
                  <span>{example.text}</span>
                  <i aria-hidden="true">→</i>
                </button>
              ))}
            </div>
          </details>
        </div>

        <p className="prompt-help-note">
          완벽하게 쓰지 않아도 괜찮아요. 필요한 내용이 빠지면 코알라가 다시 물어볼게요.
        </p>
      </section>
    </div>
  );
}

export default PromptHelpDialog;
