import { useEffect, useRef } from "react";
import {
  COURSE_QUEST_GUIDE,
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
            <p className="prompt-help-eyebrow">입력부터 코스 안내까지</p>
            <h2 id="prompt-help-title">어떤 시간을 보내고 싶으세요?</h2>
            <p id="prompt-help-description">
              한 문장으로 추천받거나, 자동 코스를 골라 바로 시작할 수 있어요.
            </p>
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
            정확한 출발지와 시간이 있으면 이동 경로까지 더 알맞게 계산해요.
          </p>
        </div>

        <section className="prompt-help-examples-section" aria-labelledby="prompt-help-examples-title">
          <div className="prompt-help-section-heading">
            <div>
              <h3 id="prompt-help-examples-title">예시를 눌러 바로 입력하기</h3>
              <p>문장을 고른 뒤 내 상황에 맞게 고쳐도 괜찮아요.</p>
            </div>
          </div>
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
        </section>

        <section className="prompt-help-examples-section" aria-labelledby="prompt-help-modes-title">
          <div className="prompt-help-section-heading">
            <div>
              <h3 id="prompt-help-modes-title">색다른 코스 추천</h3>
              <p>목적지를 감추거나 코스를 대신 골라드려요.</p>
            </div>
          </div>
          <div className="prompt-help-feature-list prompt-help-feature-list-visible">
            {RECOMMENDATION_GUIDES.filter((guide) =>
              ["blind-course", "random-course"].includes(guide.id),
            ).map((guide) => (
              <article key={guide.id}>
                <i aria-hidden="true">{guide.icon}</i>
                <div>
                  <strong>{guide.title}</strong>
                  <p>{guide.summary}</p>
                  <p>{guide.description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <div className="prompt-help-details-list">
          <details className="prompt-help-details">
            <summary>
              <span>자유 입력·자동 코스 추천</span>
              <small>다른 추천 방식</small>
              <i aria-hidden="true" />
            </summary>
            <div className="prompt-help-feature-list">
              {RECOMMENDATION_GUIDES.filter((guide) =>
                ["free-request", "auto-course"].includes(guide.id),
              ).map((guide) => (
                <article key={guide.id}>
                  <i aria-hidden="true">{guide.icon}</i>
                  <div>
                    <strong>{guide.title}</strong>
                    <p>{guide.summary}</p>
                    <p>{guide.description}</p>
                  </div>
                </article>
              ))}
            </div>
            <div className="prompt-help-quest-note">
              <i aria-hidden="true">✓</i>
              <div>
                <strong>{COURSE_QUEST_GUIDE.title}</strong>
                <p>{COURSE_QUEST_GUIDE.description}</p>
              </div>
            </div>
          </details>

          <details className="prompt-help-details">
            <summary>
              <span>정보를 더 정확히 쓰는 방법</span>
              <small>출발지·시간·취향 설정</small>
              <i aria-hidden="true" />
            </summary>
            <div className="prompt-help-detail-body">
              <div>
                <b>출발 지역</b>
                <span>현재 위치를 쓰거나 역·동네 이름을 입력해 직접 정할 수 있어요.</span>
              </div>
              <div>
                <b>시간과 약속</b>
                <span>“2시간 비어” 또는 “8시까지 잠실”처럼 적어요. 저녁처럼 시간이 모호하면 정확한 시간을 확인할 수 있어요.</span>
              </div>
              <div>
                <b>활동 순서</b>
                <span>“밥 먹고 카페”처럼 쓰면 원하는 활동과 순서를 추천에 반영해요.</span>
              </div>
              <p>이동수단·실내/야외·활동 선호는 로그인 후 ‘내 코알라 → 내 취향’에 저장하면 다음 추천에 반영돼요.</p>
            </div>
          </details>
          <details className="prompt-help-details">
            <summary>
              <span>개인 페이지에서 취향과 기록 관리</span>
              <small>저장 목록·서울 탐험·칭호</small>
              <i aria-hidden="true" />
            </summary>
            <div className="prompt-help-detail-body">
              <div>
                <b>내 취향</b>
                <span>이동수단, 실내·야외, 활동별 선호를 저장해 추천에 반영해요. 이용 기록으로 학습한 취향은 직접 설정과 따로 지울 수 있어요.</span>
              </div>
              <div>
                <b>저장한 목록</b>
                <span>즐겨찾기를 코스에 넣고, 숨긴 장소를 복원하거나 저장한 코스를 다시 열어요.</span>
              </div>
              <div>
                <b>서울 지도와 업적</b>
                <span>확정한 코스의 지역 기록, 여행 경험치, 업적과 획득한 칭호를 확인해요.</span>
              </div>
            </div>
          </details>
        </div>

        <p className="prompt-help-note">
          완벽한 문장이 아니어도 괜찮아요. 필요한 정보가 모호하면 코알라가 확인할게요.
        </p>
      </section>
    </div>
  );
}

export default PromptHelpDialog;
