import WelcomePage from './pages/WelcomePage'
import HomePage from './pages/HomePage'
import AnalysisLoading from './components/recommendation/AnalysisLoading'
import { useRecommendation } from './hooks/useRecommendation'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { removeSession, writeSession } from './utils/sessionStore'
import { getGamificationProfile, getMe, getPersonalizationProfile, getPreferences } from './api/accountApi'

const RecommendationPage = lazy(() => import('./pages/RecommendationPage'))

function App() {
  // 새로고침은 새 세션으로 시작한다. 저장된 자동추천 화면을 다시 마운트하면
  // 실제 경로 검증 요청이 재실행되므로 결과 화면을 자동 복원하지 않는다.
  const [result, setResult] = useState(null)
  const [view, setView] = useState('welcome')
  // This flag controls whether the in-progress result stays mounted during account screens.
  const [returnToResultAfterAccount, setReturnToResultAfterAccount] = useState(false)
  const requestId = useRef(0)
  const recommendationController = useRef(null)
  const { request, error } = useRecommendation()
  const [account, setAccount] = useState({ token: localStorage.getItem('koala-token'), user: null, preferences: null, personalization: null, gamification: null, restoring: Boolean(localStorage.getItem('koala-token')) })
  const [accountRequestId, setAccountRequestId] = useState(0)
  const gamificationSyncRef = useRef(0)

  // 결과 화면에서 로그인이 필요해도 작성 중인 코스를 폐기하지 않는다.
  const handleAccountChange = (nextAccount) => {
    setAccount((current) => ({ ...current, ...nextAccount }))
    if (returnToResultAfterAccount && result) {
      setReturnToResultAfterAccount(false)
      setView('result')
    }
  }

  const closeAccountFromResult = () => {
    if (!returnToResultAfterAccount || !result) return
    setReturnToResultAfterAccount(false)
    setView('result')
  }

  useEffect(() => {
    let secondFrame = 0
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        console.info(`[PERFORMANCE] first-screen-display=${Math.round(performance.now())}ms status=success`)
      })
    })
    return () => {
      cancelAnimationFrame(firstFrame)
      cancelAnimationFrame(secondFrame)
    }
  }, [])

  // Keep the account card in sync even while the home page is unmounted on results.
  useEffect(() => {
    if (!account.token) return
    const applyProfileEvent = (event) => {
      gamificationSyncRef.current += 1
      if (event.detail) {
        setAccount((current) => ({ ...current, gamification: event.detail }))
      }
    }
    const refreshProfile = async () => {
      const token = localStorage.getItem('koala-token')
      if (!token || document.visibilityState === 'hidden') return
      const syncVersion = gamificationSyncRef.current
      try {
        const profile = await getGamificationProfile(token)
        if (syncVersion === gamificationSyncRef.current) {
          setAccount((current) => current.token === token ? { ...current, gamification: profile } : current)
        }
      } catch {
        // A temporary profile read failure must not erase the last known XP.
      }
    }
    window.addEventListener('koala-gamification-updated', applyProfileEvent)
    window.addEventListener('focus', refreshProfile)
    document.addEventListener('visibilitychange', refreshProfile)
    return () => {
      window.removeEventListener('koala-gamification-updated', applyProfileEvent)
      window.removeEventListener('focus', refreshProfile)
      document.removeEventListener('visibilitychange', refreshProfile)
    }
  }, [account.token])

  useEffect(() => {
    const token = localStorage.getItem('koala-token')
    if (!token) return
    let cancelled = false
    // 사용자 조회만 인증의 기준으로 삼는다. 부가 개인화 API가 실패해도
    // 유효한 로그인 상태를 잃거나 새로고침 후 로그아웃 화면처럼 보이지 않게 한다.
    getMe(token)
      .then(async (user) => {
        if (cancelled) return
        setAccount((current) => ({ ...current, token, user, restoring: false }))
        const [preferencesResult, personalizationResult, gamificationResult] = await Promise.allSettled([
          getPreferences(token),
          getPersonalizationProfile(token),
          getGamificationProfile(token),
        ])
        if (cancelled) return
        setAccount((current) => ({
          ...current,
          token,
          user,
          preferences: preferencesResult.status === 'fulfilled' ? preferencesResult.value : current.preferences,
          personalization: personalizationResult.status === 'fulfilled' ? personalizationResult.value : current.personalization,
          gamification: gamificationResult.status === 'fulfilled' ? gamificationResult.value : current.gamification,
          restoring: false,
        }))
      })
      .catch((restoreError) => {
        if (cancelled) return
        // 네트워크 단절이나 서버 점검은 로그아웃 사유가 아니다. 서버가 토큰을
        // 명시적으로 거부한 경우에만 저장된 로그인 정보를 제거한다.
        if (restoreError?.status === 401) {
          localStorage.removeItem('koala-token')
          setAccount({ token: null, user: null, preferences: null, personalization: null, gamification: null })
        } else {
          setAccount((current) => ({ ...current, restoring: false }))
        }
      })
    return () => { cancelled = true }
  }, [])

  const handleRecommendation = async (payload) => {
    recommendationController.current?.abort()
    const controller = new AbortController()
    recommendationController.current = controller
    const currentRequestId = ++requestId.current
    // 새 추천은 이전 지역·장소·코스와 독립적이다. 이전 응답이 화면에 남아
    // 고척돔 같은 과거 결과가 이어 보이지 않게 먼저 비운다.
    setResult(null)
    removeSession('koala-result')
    setView('loading')
    // 인증 토큰은 서버가 DB의 명시적·행동 기반 취향을 불러올 때만 사용한다.
    const response = await request({ ...payload, token: account.token }, { signal: controller.signal })
    if (currentRequestId !== requestId.current) return
    recommendationController.current = null
    if (response) {
      const nextResult = payload.autoCourse
        ? { ...response, _client_mode: 'auto-course', _client_selected_duration_minutes: payload.autoCourseDurationMinutes, _client_user_message: payload.message }
        : { ...response, _client_user_message: payload.message, _client_adventure_mode: payload.adventureMode ?? null }
      setResult(nextResult)
      writeSession('koala-result', nextResult)
      setView('result')
    } else {
      setView('home')
    }
  }

  const cancelRecommendation = () => {
    requestId.current += 1
    recommendationController.current?.abort()
    recommendationController.current = null
    setResult(null)
    removeSession('koala-result')
    setView('home')
  }

  const openSavedCourse = (savedCourse) => {
    const savedResponse = savedCourse?.course_data?.recommendation_response
    if (!savedResponse) return false
    const restored = { ...savedResponse, _client_saved_course: savedCourse }
    setResult(restored)
    writeSession('koala-result', restored)
    setView('result')
    return true
  }

  return (
    <div className={view !== 'welcome' ? 'app-shell is-home-open' : 'app-shell'}>
      <WelcomePage onStart={() => setView('home')} />
      <HomePage isOpen={view === 'home'} onRecommend={handleRecommendation} onOpenSavedCourse={openSavedCourse} error={error} account={account} onAccountChange={handleAccountChange} accountRequestId={accountRequestId} onAccountClose={closeAccountFromResult} />
      {view === 'loading' && <AnalysisLoading onEdit={cancelRecommendation} onCancel={cancelRecommendation} />}
      {result && (view === 'result' || returnToResultAfterAccount) && <Suspense fallback={<AnalysisLoading onEdit={() => setView('home')} onCancel={() => setView('home')} />}><RecommendationPage response={result} onBack={() => { setResult(null); removeSession('koala-result'); setView('home') }} account={account} onAccountChange={handleAccountChange} onOpenAccount={() => { setReturnToResultAfterAccount(true); setView('home'); setAccountRequestId((current) => current + 1) }} /></Suspense>}
    </div>
  )
}

export default App
