import { lazy, Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  completePasswordReset,
  getRecoveryStatus,
  isMockAuthEnabled,
  requestPasswordReset,
  requestUsernameRecovery,
  requestRecoveryEmailUpdate,
  sendSignupEmailCode,
  verifyUsernameRecovery,
  verifyRecoveryEmailUpdate,
} from "../../api/accountApi";

const SeoulExplorer = lazy(() => import("./SeoulExplorer"));
const PASSWORD_SPECIAL_CHARS = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

const ACTIVITIES = [
  ["food", "맛집", "🍽"],
  ["cafe", "카페", "☕"],
  ["walk", "산책", "🌿"],
  ["culture", "문화", "🎨"],
  ["entertainment", "놀거리", "🎡"],
  ["shopping", "쇼핑", "🛍"],
  ["drink", "술집", "🥂"],
];

function PersonalizationSignals({ account }) {
  const labels = Object.fromEntries(ACTIVITIES.map(([code, label]) => [code, label]));
  const explicit = Object.entries(account.preferences?.activity_preferences ?? {});
  const learned = Object.entries(account.personalization?.activity_preferences ?? {});
  const signals = [
    ...explicit.filter(([, level]) => level >= 4).map(([code]) => ["직접 선택", labels[code], false]),
    ...explicit.filter(([, level]) => level <= 2).map(([code]) => ["덜 추천", labels[code], true]),
    ...learned.filter(([code, level]) => level >= 4 && (account.preferences?.activity_preferences?.[code] ?? 0) < 4).map(([code]) => ["이용 기록", labels[code], false]),
    ...learned.filter(([code, level]) => level <= 2 && !(account.preferences?.activity_preferences?.[code] > 0)).map(([code]) => ["이용 기록 · 덜 추천", labels[code], true]),
  ].filter(([, label]) => label);

  if (!signals.length) return null;
  return (
    <div className="personalization-signals" aria-label="현재 반영 중인 취향">
      {signals.map(([source, label, muted], index) => (
        <span className={muted ? "is-muted" : ""} key={`${source}-${label}-${index}`}>
          {source} · {label}
        </span>
      ))}
    </div>
  );
}

function TravelProgressCard({ gamification, error, onEquipTitle }) {
  if (!gamification) return <section className="travel-progress-card is-loading">여행 기록을 불러오고 있어요…</section>;
  const goal = gamification.next_rank_xp;
  const barWidth = goal == null ? 100 : Math.min(100, Math.round((gamification.xp_into_rank / Math.max(1, gamification.xp_into_rank + gamification.xp_to_next_rank)) * 100));
  const achieved = gamification.achievements?.filter((item) => item.unlocked) ?? [];
  return (
    <section className="travel-progress-card" aria-label="여행 레벨과 칭호">
      <div className="travel-progress-heading">
        <div><small>KOALA TRAVEL LEVEL</small><b>{gamification.rank_name}</b></div>
        <strong>Lv.{gamification.rank_index}<small> / {gamification.rank_count}</small></strong>
      </div>
      <div className="travel-progress-track" role="progressbar" aria-label="다음 등급 경험치" aria-valuenow={goal == null ? 100 : gamification.xp_into_rank} aria-valuemin={0} aria-valuemax={goal == null ? 100 : Math.max(1, gamification.xp_into_rank + gamification.xp_to_next_rank)}>
        <span style={{ width: `${barWidth}%` }} />
      </div>
      <div className="travel-progress-meta"><b>{gamification.total_xp.toLocaleString()} XP</b><span>{gamification.xp_to_next_rank ? `다음 등급까지 ${gamification.xp_to_next_rank} XP` : "최고 등급을 달성했어요"}</span></div>
      <small className="travel-reward-rules">코스 확정 +10 · 안내 완료 +15 · 퀘스트 +5 · 처음 여는 지역 +20 XP<br />코스 확정과 안내 완료는 하루 3회, 퀘스트는 하루 최대 30 XP까지 적립돼요.</small>
      <label className="travel-title-picker">메인 화면 칭호
        <select value={gamification.equipped_title?.id ?? ""} onChange={(event) => onEquipTitle(event.target.value)} aria-label="메인 화면에 표시할 칭호">
          {(gamification.unlocked_titles ?? []).map((title) => <option value={title.id} key={title.id}>{title.name}</option>)}
        </select>
      </label>
      <div className="travel-achievements" aria-label="업적">
        <b>업적 <small>{achieved.length} / {gamification.achievements?.length ?? 0}</small></b>
        {(gamification.achievements ?? []).map((achievement) => (
          <span className={achievement.unlocked ? "is-unlocked" : ""} key={achievement.id} title={achievement.description}>
            {achievement.unlocked ? "✦" : "·"} {achievement.name} {achievement.unlocked ? "" : `${achievement.progress}/${achievement.goal}`}
          </span>
        ))}
      </div>
      {error && <p className="travel-progress-error" role="alert">{error}</p>}
    </section>
  );
}

function RecoveryEmailSettings({ token, currentEmail }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [emailEnabled, setEmailEnabled] = useState(null);
  const [codeSent, setCodeSent] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState(currentEmail ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getRecoveryStatus()
      .then((status) => { if (active) setEmailEnabled(Boolean(status.email_enabled)); })
      .catch(() => { if (active) setEmailEnabled(false); });
    return () => { active = false; };
  }, []);

  const sendCode = async () => {
    setError("");
    setMessage("");
    try {
      await requestRecoveryEmailUpdate(token, email);
      setCodeSent(true);
      setMessage("인증 코드를 보냈어요. 10분 안에 입력해 주세요.");
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const verifyCode = async () => {
    setError("");
    try {
      const result = await verifyRecoveryEmailUpdate(token, email, code);
      setVerifiedEmail(result.recovery_email);
      setMessage("복구 이메일을 등록했어요.");
      setCodeSent(false);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <section className="account-recovery-settings" aria-label="계정 복구 이메일">
      <b>계정 복구 이메일</b>
      <small>{verifiedEmail ? `등록됨 · ${verifiedEmail}` : "로그인 이메일을 잊었을 때 본인 확인에 사용해요."}</small>
      {emailEnabled === false && <small role="alert">이메일 발송 설정이 완료되지 않았어요.</small>}
      {!codeSent ? <>
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="로그인 이메일과 다른 주소" aria-label="복구 이메일" />
        <button type="button" disabled={emailEnabled !== true || !email.includes("@")} onClick={sendCode}>인증 코드 보내기</button>
      </> : <>
        <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="6자리 인증 코드" aria-label="인증 코드" maxLength={6} />
        <button type="button" disabled={!/^\d{6}$/.test(code)} onClick={verifyCode}>인증하고 등록</button>
      </>}
      {message && <small role="status">{message}</small>}
      {error && <small role="alert">{error}</small>}
    </section>
  );
}

function TasteSettings({ account, onClearLearning, clearingLearning }) {
  return (
    <>
      <div className="preference-benefit" role="note">
        <span className="preference-benefit-icon" aria-hidden="true">✦</span>
        <span><b>좋아하는 활동을 알려주세요</b><small>선택한 취향을 추천 코스에 반영할게요.</small></span>
      </div>
      <section className="preference-settings-card" aria-label="이동 및 공간 취향">
        <div className="preference-card-heading">
          <div><b>이동과 공간</b><small>원하는 이동수단과 장소를 선택해요.</small></div>
          <span aria-hidden="true">↗</span>
        </div>
        <div className="preference-pair-grid">
          <label>
            <span>이동수단</span>
            <select name="transport_mode" defaultValue={account.preferences?.transport_mode ?? "public_transit"}>
              <option value="public_transit">대중교통</option>
              <option value="car">자동차</option>
              <option value="walk">도보</option>
              <option value="auto">자동 선택</option>
            </select>
          </label>
          <label>
            <span>선호 공간</span>
            <select name="space_preference" defaultValue={account.preferences?.space_preference ?? "any"}>
              <option value="any">모두 좋아요</option>
              <option value="indoor">실내 위주</option>
              <option value="outdoor">야외 위주</option>
            </select>
          </label>
        </div>
      </section>
      <fieldset className="preference-activities">
        <legend>어떤 활동을 좋아하세요?</legend>
        <p className="preference-activities-hint">각 활동을 얼마나 추천받을지 정해요.</p>
        {ACTIVITIES.map(([code, label, icon]) => {
          const level = account.preferences?.activity_preferences?.[code] ?? 0;
          return (
            <label className="preference-activity-card" key={code}>
              <span className="preference-activity-name"><i aria-hidden="true">{icon}</i>{label}</span>
              <select name={`activity_${code}`} defaultValue={level >= 4 ? 5 : level > 0 ? 1 : 0} aria-label={`${label} 선호`}>
                <option value={0}>상관없음</option>
                <option value={5}>좋아함</option>
                <option value={1}>덜 추천</option>
              </select>
            </label>
          );
        })}
      </fieldset>
      <div className="learning-controls">
        <span><b>사용 기록으로 취향 알아가기</b><small>장소에 남긴 좋아요·싫어요 기록을 추천에 반영해요. 직접 설정한 취향과 저장 목록은 그대로예요.</small></span>
        <button type="button" onClick={onClearLearning} disabled={clearingLearning || !account.personalization?.interaction_count}>
          {clearingLearning ? "초기화 중…" : "기록 지우기"}
        </button>
      </div>
      <RecoveryEmailSettings token={account.token} currentEmail={account.user.recovery_email_masked} />
    </>
  );
}

function SavedLibrary({
  favoritePlaces,
  excludedPlaces,
  savedCourses,
  savedCourseNotice,
  onUseFavorite,
  onRemoveFavorite,
  onRestorePlace,
  onOpenSavedCourse,
  onRemoveSavedCourse,
}) {
  return (
    <>
      <section className="saved-course-list">
        <b>즐겨찾기 장소 <span>{favoritePlaces.length}</span></b>
        {favoritePlaces.length ? favoritePlaces.map((place) => (
          <div key={place.place_key}>
            <button className="saved-course-open" type="button" onClick={() => onUseFavorite(place)}>
              <strong>{place.place_name}</strong><small>{place.category ?? "저장한 장소"} · 코스에 넣기</small>
            </button>
            <button type="button" onClick={() => onRemoveFavorite(place.place_key)}>삭제</button>
          </div>
        )) : <small>즐겨찾기한 장소가 아직 없어요.</small>}
      </section>
      <section className="saved-course-list">
        <b>숨긴 장소 <span>{excludedPlaces.length}</span></b>
        {excludedPlaces.length ? excludedPlaces.map((place) => (
          <div key={place.place_key}>
            <span className="saved-course-open"><strong>{place.place_name}</strong><small>추천에서 제외 중</small></span>
            <button type="button" onClick={() => onRestorePlace(place.place_key)}>복원</button>
          </div>
        )) : <small>숨긴 장소가 없어요.</small>}
      </section>
      <section className="saved-course-list">
        <b>저장한 코스 <span>{savedCourses.length}</span></b>
        {savedCourses.length ? savedCourses.map((course) => (
          <div key={course.id}>
            <button className="saved-course-open" type="button" onClick={() => onOpenSavedCourse(course)}>
              <strong>{course.title}</strong>
              <small>{new Date(course.created_at).toLocaleDateString("ko-KR")} · 지도에서 다시 보기</small>
            </button>
            <button type="button" onClick={() => onRemoveSavedCourse(course.id)}>삭제</button>
          </div>
        )) : <small>저장한 코스가 아직 없어요.</small>}
        {savedCourseNotice && <p>{savedCourseNotice}</p>}
      </section>
    </>
  );
}

function RecoveryForm({ flow, onBack }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailEnabled, setEmailEnabled] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    let active = true;
    getRecoveryStatus()
      .then((status) => { if (active) setEmailEnabled(Boolean(status.email_enabled)); })
      .catch(() => { if (active) setEmailEnabled(false); });
    return () => { active = false; };
  }, []);

  const requestCode = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      if (flow === "username") await requestUsernameRecovery(email);
      else await requestPasswordReset(email);
      setSent(true);
      setMessage("가입된 정보와 일치하면 인증 코드를 보냈어요. 메일함을 확인해 주세요.");
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    setError("");
    try {
      if (flow === "username") {
        const result = await verifyUsernameRecovery(email, code);
        setMessage(`로그인 이메일은 ${result.login_email} 입니다.`);
        setComplete(true);
      } else {
        if (newPassword !== confirmPassword) {
          setError("새 비밀번호가 서로 다릅니다.");
          return;
        }
        await completePasswordReset(email, code, newPassword);
        setMessage("비밀번호를 변경했어요. 새 비밀번호로 로그인해 주세요.");
        setComplete(true);
      }
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <section className="account-recovery" aria-live="polite">
      <h2>{flow === "username" ? "로그인 이메일 찾기" : "비밀번호 재설정"}</h2>
      <p>{flow === "username" ? "가입할 때 등록한 복구 이메일로 본인 확인을 해요." : "가입한 이메일로 인증 코드를 보내드려요."}</p>
      {emailEnabled === false && <p role="alert">이메일 발송 설정이 완료되지 않아 계정 복구를 사용할 수 없어요.</p>}
      {!complete && !sent && (
        <form onSubmit={requestCode}>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={flow === "username" ? "복구 이메일" : "가입 이메일"} required />
          <button type="submit" disabled={emailEnabled !== true}>인증 코드 받기</button>
        </form>
      )}
      {!complete && sent && (
        <form onSubmit={verifyCode}>
          <label>인증 코드<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} maxLength={6} required /></label>
          {flow === "password" && <label>새 비밀번호<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} maxLength={128} required /></label>}
          {flow === "password" && <label>새 비밀번호 확인<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} maxLength={128} required /></label>}
          <button type="submit">{flow === "username" ? "이메일 확인" : "비밀번호 변경"}</button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      <button className="account-switch" type="button" onClick={onBack}>{complete ? "로그인으로 돌아가기" : "뒤로"}</button>
    </section>
  );
}

function LoginForm({ accountMode, accountError, onSubmit, onSwitchMode, onRecovery }) {
  const [email, setEmail] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [emailNotice, setEmailNotice] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [sendingCode, setSendingCode] = useState(false);

  useEffect(() => {
    setPasswordConfirm("");
    setEmailCode("");
    setEmailCodeSent(false);
    setEmailNotice("");
    setEmailError("");
    setPasswordError("");
  }, [accountMode]);

  const sendEmailCode = async () => {
    setEmailNotice("");
    setEmailError("");
    setSendingCode(true);
    try {
      const result = await sendSignupEmailCode(email);
      setEmailCodeSent(true);
      setEmailNotice(result.message || "메일 발송 서버가 접수했어요. 받은편지함과 스팸함을 확인해 주세요.");
    } catch (error) {
      setEmailError(error.message);
    } finally {
      setSendingCode(false);
    }
  };

  const handleSubmit = (event) => {
    setEmailError("");
    setPasswordError("");
    if (accountMode === "signup") {
      const form = new FormData(event.currentTarget);
      const password = String(form.get("password") || "");
      if (!isMockAuthEnabled() && !emailCodeSent) {
        event.preventDefault();
        setEmailError("먼저 이메일 인증 코드를 요청해 주세요.");
        return;
      }
      if (!isMockAuthEnabled() && emailCode.length !== 6) {
        event.preventDefault();
        setEmailError("이메일로 받은 6자리 인증 코드를 입력해 주세요.");
        return;
      }
      if (!/[A-Za-z]/.test(password) || ![...password].some((char) => PASSWORD_SPECIAL_CHARS.includes(char))) {
        event.preventDefault();
        setPasswordError("비밀번호는 영문과 특수문자를 포함해 8자 이상 입력해 주세요.");
        return;
      }
      if (password !== passwordConfirm) {
        event.preventDefault();
        setPasswordError("비밀번호가 서로 일치하지 않아요.");
        return;
      }
    }
    onSubmit(event);
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>{accountMode === "login" ? "로그인" : "회원가입"}</h2>
      {isMockAuthEnabled() && <p className="mock-auth-notice">개발용 임시 로그인 모드예요 · 실제 DB에는 저장되지 않아요</p>}
      {accountMode === "signup" && <input name="nickname" placeholder="닉네임" required />}
      <input
        name="email" type="email" placeholder="이메일" value={email} required
        onChange={(event) => {
          const nextEmail = event.target.value;
          setEmail(nextEmail);
          if (accountMode === "signup" && nextEmail.trim().toLowerCase() !== email.trim().toLowerCase()) {
            setEmailCode("");
            setEmailCodeSent(false);
            setEmailNotice("");
            setEmailError("");
          }
        }}
      />
      <input name="password" type="password" placeholder={accountMode === "signup" ? "영문+특수문자 포함 8자 이상" : "비밀번호"} minLength="8" required />
      {accountMode === "signup" && <>
        <small>영문자와 특수문자를 각각 하나 이상 포함해 주세요.</small>
        <label>비밀번호 확인<input type="password" autoComplete="new-password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} minLength="8" required /></label>
        {!isMockAuthEnabled() && <>
          <button type="button" onClick={sendEmailCode} disabled={!email.includes("@") || sendingCode}>{sendingCode ? "인증 메일 보내는 중…" : "이메일 인증 코드 받기"}</button>
          <label>이메일 인증 코드<input name="email_verification_code" inputMode="numeric" autoComplete="one-time-code" placeholder="6자리 인증 코드" pattern="[0-9]{6}" maxLength={6} value={emailCode} onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required /></label>
          {emailNotice && <p role="status">{emailNotice}</p>}
          {!emailCodeSent && <small>입력한 이메일 주소를 인증한 뒤 가입할 수 있어요.</small>}
        </>}
        {emailError && <p role="alert">{emailError}</p>}
        {passwordError && <p role="alert">{passwordError}</p>}
      </>}
      {accountError && <p role="alert">{accountError}</p>}
      <button type="submit">{accountMode === "login" ? "로그인" : "가입하고 로그인"}</button>
      {accountMode === "login" && <nav className="account-recovery-links" aria-label="계정 복구">
        <button type="button" onClick={() => onRecovery("username")}>로그인 이메일 찾기</button>
        <button type="button" onClick={() => onRecovery("password")}>비밀번호 재설정</button>
      </nav>}
      <button className="account-switch" type="button" onClick={onSwitchMode}>
        {accountMode === "login" ? "처음이신가요? 회원가입" : "이미 계정이 있어요"}
      </button>
    </form>
  );
}

export default function AccountModal({
  account, accountMode, accountSection, accountError, clearingLearning, gamificationError,
  favoritePlaces, excludedPlaces, savedCourses, exploredRegions = [], savedCourseNotice,
  onClose, onLogin, onSwitchMode, onSavePreferences, onClearLearning,
  onSectionChange, onUseFavorite, onRemoveFavorite, onRestorePlace,
  onOpenSavedCourse, onRemoveSavedCourse, onLogout, onEquipTitle,
}) {
  const [recoveryFlow, setRecoveryFlow] = useState(null);
  if (!account) return null;

  return createPortal((
    <div
      className="account-modal"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          setRecoveryFlow(null);
          onClose();
        }
      }}
    >
      <div className={`account-panel${account.user && accountSection === "explorer" ? " account-panel--explorer" : ""}`}>
        <button className="account-close" type="button" onClick={() => { setRecoveryFlow(null); onClose(); }}>×</button>
        {account.user ? (
          <form onSubmit={onSavePreferences}>
            <div className="account-page-heading">
              <small>내 코알라</small><h2>{accountSection === "explorer" ? "나의 서울 탐험" : accountSection === "library" ? "저장한 목록" : "내 취향 설정"}</h2>
              <p>{accountSection === "explorer" ? "확정한 코스를 따라 서울 지역을 하나씩 열어 보세요." : accountSection === "library" ? `${account.user.nickname}님이 저장한 장소와 코스예요.` : `${account.user.nickname}님의 취향을 바꾸고 추천 코스에 반영해요.`}</p>
            </div>
            {accountSection === "taste" && <TravelProgressCard gamification={account.gamification} error={gamificationError} onEquipTitle={onEquipTitle} />}
            {accountSection === "taste" && <p className="personalization-summary">
              {account.personalization?.interaction_count
                ? `${account.personalization.interaction_count}개의 선택을 추천에 반영하고 있어요.`
                : "장소를 저장하고 코스를 확정하면 취향을 학습해요."}
            </p>}
            {accountSection === "taste" && <PersonalizationSignals account={account} />}
            {isMockAuthEnabled() && <p className="mock-auth-notice">개발용 임시 계정 · 이 기기에만 저장돼요</p>}
            <nav className="account-section-tabs" aria-label="내 코알라 메뉴">
              <button type="button" className={accountSection === "taste" ? "is-active" : ""} onClick={() => onSectionChange("taste")}>내 취향</button>
              <button type="button" className={accountSection === "explorer" ? "is-active" : ""} onClick={() => onSectionChange("explorer")}>서울 지도</button>
              <button type="button" className={accountSection === "library" ? "is-active" : ""} onClick={() => onSectionChange("library")}>저장한 목록</button>
            </nav>
            {accountSection === "taste" ? (
              <TasteSettings account={account} onClearLearning={onClearLearning} clearingLearning={clearingLearning} />
            ) : accountSection === "explorer" ? (
              <Suspense fallback={<p className="seoul-explorer-loading">서울 지도를 준비하고 있어요…</p>}><SeoulExplorer exploredRegions={exploredRegions} /></Suspense>
            ) : (
              <SavedLibrary
                favoritePlaces={favoritePlaces} excludedPlaces={excludedPlaces}
                savedCourses={savedCourses} savedCourseNotice={savedCourseNotice}
                onUseFavorite={onUseFavorite} onRemoveFavorite={onRemoveFavorite}
                onRestorePlace={onRestorePlace} onOpenSavedCourse={onOpenSavedCourse}
                onRemoveSavedCourse={onRemoveSavedCourse}
              />
            )}
            <div className="account-actions">
              {accountError && <p>{accountError}</p>}
              {accountSection === "taste" && <button type="submit">내 취향 저장하기</button>}
              <button className="account-logout" type="button" onClick={onLogout}>로그아웃</button>
            </div>
          </form>
        ) : recoveryFlow ? (
          <RecoveryForm flow={recoveryFlow} onBack={() => setRecoveryFlow(null)} />
        ) : (
          <LoginForm accountMode={accountMode} accountError={accountError} onSubmit={onLogin} onSwitchMode={onSwitchMode} onRecovery={setRecoveryFlow} />
        )}
      </div>
    </div>
  ), document.body);
}
