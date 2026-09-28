import { API_BASE_URL } from './apiConfig'
import { buildAchievementProgress, titlesForAchievements, TRAVEL_RANKS } from '../data/gamificationCatalog'
// Real API/DB authentication is the safe default in every environment.
// Opt into localStorage-only demo auth explicitly with VITE_AUTH_MODE=mock.
const MOCK_AUTH = import.meta.env.VITE_AUTH_MODE === 'mock'
const MOCK_TOKEN = 'koala-local-demo-token'
const USER_KEY = 'koala-mock-user'
const PREF_KEY = 'koala-mock-preferences'
const COURSE_KEY = 'koala-mock-courses'
const EXCLUDED_PLACE_KEY = 'koala-mock-excluded-places'
const FAVORITE_PLACE_KEY = 'koala-mock-favorite-places'
const INTERACTION_KEY = 'koala-mock-interactions'
const EXPLORED_REGIONS_KEY = 'koala-mock-explored-regions'
const GAMIFICATION_KEY = 'koala-mock-gamification'
const GAMIFICATION_EVENTS_KEY = 'koala-mock-gamification-events'
const defaultPreferences = { transport_mode: 'public_transit', space_preference: 'any', activity_preferences: {} }

function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback } }
function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); return value }
function mockUser(input = {}) { return read(USER_KEY, null) ?? write(USER_KEY, { id: 1, email: input.email ?? 'demo@koala.local', nickname: input.nickname ?? '코알라 여행자', created_at: new Date().toISOString() }) }
function assertMockToken(token) { if (token !== MOCK_TOKEN) throw new Error('로그인이 필요해요.') }

function mockGamificationSnapshot(profile = {}, metrics = {}) {
  const totalXp = Number(profile.total_xp ?? 0)
  const rankIndex = Math.max(0, TRAVEL_RANKS.findLastIndex(([, , threshold]) => totalXp >= threshold))
  const [rankId, rankName, rankStart] = TRAVEL_RANKS[rankIndex]
  const nextRank = TRAVEL_RANKS[rankIndex + 1]
  const counts = {
    districts: metrics.districts ?? profile.explored_district_count ?? 0,
    courses: metrics.courses ?? profile.confirmed_course_count ?? 0,
    guides: metrics.guides ?? profile.completed_course_count ?? 0,
    quests: metrics.quests ?? profile.completed_quest_count ?? 0,
  }
  const achievements = buildAchievementProgress(counts)
  const titles = titlesForAchievements(achievements)
  const equippedTitle = titles.find((title) => title.id === profile.equipped_title?.id) ?? titles[0] ?? null
  return {
    ...profile,
    explored_district_count: counts.districts,
    confirmed_course_count: counts.courses,
    completed_course_count: counts.guides,
    completed_quest_count: counts.quests,
    total_xp: totalXp,
    rank_id: rankId,
    rank_name: rankName,
    rank_index: rankIndex + 1,
    rank_count: TRAVEL_RANKS.length,
    xp_into_rank: totalXp - rankStart,
    next_rank_xp: nextRank?.[2] ?? null,
    xp_to_next_rank: nextRank ? Math.max(0, nextRank[2] - totalXp) : 0,
    equipped_title: equippedTitle,
    unlocked_titles: titles,
    achievements,
  }
}

async function api(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = response.status === 204 ? null : await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = typeof data?.detail === 'string' ? data.detail : ''
    const invalidFields = Array.isArray(data?.detail)
      ? data.detail.map((issue) => issue?.loc?.at?.(-1)).filter(Boolean)
      : []
    const validationMessage = invalidFields.includes('email_verification_code')
      ? '이메일 인증 코드를 다시 확인해 주세요.'
      : invalidFields.includes('password')
        ? '비밀번호 규칙을 확인해 주세요.'
        : invalidFields.includes('email')
          ? '이메일 주소를 확인해 주세요.'
          : invalidFields.includes('nickname')
            ? '닉네임을 확인해 주세요.'
            : ''
    const message = response.status === 401
      ? '로그인이 만료됐거나 확인되지 않았어요. 다시 로그인해 주세요.'
      : detail === 'Not Found'
        ? '회원가입 서버 주소를 찾지 못했어요. 잠시 후 다시 시도해 주세요.'
        : (detail || validationMessage || '계정 정보를 처리하지 못했어요.')
    const error = new Error(message)
    error.status = response.status
    throw error
  }
  return data
}

function normalizePreferences(data) {
  const activities = Array.isArray(data?.activity_preferences)
    ? Object.fromEntries(data.activity_preferences.map((item) => [item.activity, item.preference_level]))
    : (data?.activity_preferences ?? {})
  return { transport_mode: data?.transport_mode ?? null, space_preference: data?.space_preference ?? null, activity_preferences: activities }
}

export async function signup(body) {
  if (!MOCK_AUTH) return api('/auth/signup', { method: 'POST', body })
  write(USER_KEY, { id: 1, email: String(body.email).trim().toLowerCase(), nickname: body.nickname, created_at: new Date().toISOString() })
  if (!localStorage.getItem(PREF_KEY)) write(PREF_KEY, defaultPreferences)
  return mockUser(body)
}

export async function getRecoveryStatus() {
  if (MOCK_AUTH) return { email_enabled: false }
  return api('/auth/recovery/status')
}

export async function sendSignupEmailCode(email) {
  if (MOCK_AUTH) return { message: '임시 로그인에서는 이메일 발송 없이 가입할 수 있어요.' }
  return api('/auth/signup/email-code', { method: 'POST', body: { email } })
}

export async function requestPasswordReset(email) {
  if (MOCK_AUTH) throw new Error('임시 로그인에서는 비밀번호 재설정을 사용할 수 없어요.')
  return api('/auth/recovery/password', { method: 'POST', body: { email } })
}

export async function completePasswordReset(email, code, newPassword) {
  if (MOCK_AUTH) throw new Error('임시 로그인에서는 비밀번호 재설정을 사용할 수 없어요.')
  return api('/auth/recovery/password/verify', {
    method: 'POST',
    body: { email, code, new_password: newPassword },
  })
}

export async function login(body) {
  if (MOCK_AUTH) {
    mockUser(body)
    return { access_token: MOCK_TOKEN, token_type: 'bearer', mock: true }
  }

  try {
    return await api('/auth/login', { method: 'POST', body })
  } catch (error) {
    if (error.status === 401) {
      throw new Error('입력한 이메일 또는 비밀번호가 올바르지 않아요. 가입 이메일을 확인하거나 비밀번호 재설정을 이용해 주세요.')
    }
    throw error
  }
}
export async function getMe(token) { if (!MOCK_AUTH) return api('/users/me', { token }); assertMockToken(token); return mockUser() }
export async function getPreferences(token) {
  if (MOCK_AUTH) { assertMockToken(token); return read(PREF_KEY, defaultPreferences) }
  // The active core API exposes this canonical route. The /ml-prefixed route
  // belongs to a different backend entry point and only adds a noisy 404 here.
  return normalizePreferences(await api('/users/me/preferences', { token }))
}
export async function updatePreferences(token, body) {
  if (MOCK_AUTH) { assertMockToken(token); return write(PREF_KEY, normalizePreferences(body)) }
  const mlBody = { transport_mode: body.transport_mode, space_preference: body.space_preference, activity_preferences: Object.entries(body.activity_preferences ?? {}).map(([activity, preference_level]) => ({ activity, preference_level })) }
  return normalizePreferences(await api('/users/me/preferences', { method: 'PUT', token, body: mlBody }))
}
export async function saveCourse(token, body) {
  if (!MOCK_AUTH) return api('/users/me/courses', { method: 'POST', token, body })
  assertMockToken(token)
  const saved = { ...body, id: Date.now(), created_at: new Date().toISOString() }
  write(COURSE_KEY, [saved, ...read(COURSE_KEY, [])].slice(0, 30))
  return saved
}
export async function getSavedCourses(token) { if (!MOCK_AUTH) return api('/users/me/courses', { token }); assertMockToken(token); return read(COURSE_KEY, []) }
export async function getExploredRegions(token) {
  if (!MOCK_AUTH) return api('/users/me/explored-regions', { token })
  assertMockToken(token); return read(EXPLORED_REGIONS_KEY, [])
}
export async function getGamificationProfile(token) {
  if (!MOCK_AUTH) return api('/users/me/gamification', { token })
  assertMockToken(token)
  const stored = read(GAMIFICATION_KEY, null)
  const profile = mockGamificationSnapshot(stored ?? {
    total_xp: 0,
    explored_district_count: 0,
    confirmed_course_count: 0,
    completed_course_count: 0,
    completed_quest_count: 0,
  })
  write(GAMIFICATION_KEY, profile)
  return profile
}
export async function updateGamificationTitle(token, titleId) {
  if (!MOCK_AUTH) return api('/users/me/gamification/title', { method: 'PUT', token, body: { title_id: titleId } })
  assertMockToken(token)
  const current = await getGamificationProfile(token)
  const title = current.unlocked_titles.find((item) => item.id === titleId)
  if (!title) throw new Error('아직 얻지 못한 칭호예요.')
  const updated = { ...current, equipped_title: title }
  write(GAMIFICATION_KEY, updated)
  return updated
}
export async function awardGamificationEvent(token, body) {
  if (!token) return null
  if (!MOCK_AUTH) {
    const result = await api('/users/me/gamification/events', { method: 'POST', token, body })
    if (result?.regions) window.dispatchEvent(new CustomEvent('koala-explored-regions-updated', { detail: result.regions }))
    if (result?.newly_unlocked_districts?.length) {
      try {
        sessionStorage.setItem('koala-region-unlock-flash', JSON.stringify({ at: Date.now(), districts: result.newly_unlocked_districts }))
      } catch { /* animation state is optional */ }
      window.dispatchEvent(new CustomEvent('koala-region-unlocked', { detail: result.newly_unlocked_districts }))
    }
    if (result?.profile) writeGAMIFICATIONSnapshot(result.profile)
    return result
  }
  assertMockToken(token)
  const dailyQuest = body.event_type === 'quest_complete'
    ? body.quest_id?.match(/^daily-(\d{4}-\d{2}-\d{2})-(main|bonus)$/)
    : null
  const mockEventKey = dailyQuest
    ? `daily:quest:${dailyQuest[1]}:${dailyQuest[2]}`
    : `${body.course_id}:${body.event_type}:${body.quest_id ?? ""}`
  const eventKeys = read(GAMIFICATION_EVENTS_KEY, [])
  if (eventKeys.includes(mockEventKey)) {
    const profile = await getGamificationProfile(token)
    writeGAMIFICATIONSnapshot(profile)
    return { xp_awarded: 0, already_completed: true, newly_unlocked_districts: [], profile }
  }
  // 개발용 임시 로그인도 이벤트 키를 저장해 중복 보상은 막는다.
  const profile = await getGamificationProfile(token)
  const priorRegions = body.event_type === 'course_confirm' && body.districts?.length ? await getExploredRegions(token) : []
  const priorDistrictCodes = new Set(priorRegions.map((region) => region.district_code))
  const newlyUnlockedDistricts = body.event_type === 'course_confirm'
    ? (body.districts ?? []).filter((district) => !priorDistrictCodes.has(district.district_code))
    : []
  const dailyQuestCount = dailyQuest
    ? eventKeys.filter((key) => key.startsWith(`daily:quest:${dailyQuest[1]}:`)).length
    : 0
  const questReward = dailyQuestCount < 2 ? (dailyQuest?.[2] === 'main' ? 10 : 5) : 0
  const awarded = (body.event_type === 'course_confirm' ? 10 : body.event_type === 'course_complete' ? 15 : dailyQuest ? questReward : 5) + newlyUnlockedDistricts.length * 20
  const updated = mockGamificationSnapshot({ ...profile, total_xp: profile.total_xp + awarded }, {
    districts: profile.explored_district_count + newlyUnlockedDistricts.length,
    courses: profile.confirmed_course_count + (body.event_type === 'course_confirm' ? 1 : 0),
    guides: profile.completed_course_count + (body.event_type === 'course_complete' ? 1 : 0),
    quests: profile.completed_quest_count + (body.event_type === 'quest_complete' ? 1 : 0),
  })
  const oldAchievementIds = new Set(profile.achievements.filter((item) => item.unlocked).map((item) => item.id))
  const newlyUnlockedAchievements = updated.achievements
    .filter((item) => item.unlocked && !oldAchievementIds.has(item.id))
    .map(({ id, name, title_id, title_name }) => ({ id, name, title_id, title_name }))
  write(GAMIFICATION_KEY, updated)
  writeGAMIFICATIONSnapshot(updated)
  if (body.event_type === 'course_confirm' && body.districts?.length) {
    const regions = await recordExploredRegions(token, { course_id: body.course_id, districts: body.districts })
    updated.explored_district_count = regions.length
    write(GAMIFICATION_KEY, updated)
    writeGAMIFICATIONSnapshot(updated)
    write(GAMIFICATION_EVENTS_KEY, [...eventKeys, mockEventKey])
    const unlocked = newlyUnlockedDistricts.map((district) => ({ district_code: district.district_code, district_name: regions.find((region) => region.district_code === district.district_code)?.district_name }))
    try { sessionStorage.setItem('koala-region-unlock-flash', JSON.stringify({ at: Date.now(), districts: unlocked })) } catch { /* animation state is optional */ }
    return { xp_awarded: awarded, already_completed: false, newly_unlocked_districts: unlocked, newly_unlocked_achievements: newlyUnlockedAchievements, profile: updated, regions }
  }
  write(GAMIFICATION_EVENTS_KEY, [...eventKeys, mockEventKey])
  return { xp_awarded: awarded, already_completed: false, newly_unlocked_districts: [], newly_unlocked_achievements: newlyUnlockedAchievements, profile: updated }
}
function writeGAMIFICATIONSnapshot(profile) {
  window.dispatchEvent(new CustomEvent('koala-gamification-updated', { detail: profile }))
}
export async function recordExploredRegions(token, body) {
  if (!token || !body?.districts?.length) return null
  if (!MOCK_AUTH) {
    const regions = await api('/users/me/explored-regions', { method: 'POST', token, body })
    window.dispatchEvent(new CustomEvent('koala-explored-regions-updated', { detail: regions }))
    return regions
  }
  assertMockToken(token)
  const current = read(EXPLORED_REGIONS_KEY, [])
  const now = new Date().toISOString()
  const names = { '11110':'종로구','11140':'중구','11170':'용산구','11200':'성동구','11215':'광진구','11230':'동대문구','11260':'중랑구','11290':'성북구','11305':'강북구','11320':'도봉구','11350':'노원구','11380':'은평구','11410':'서대문구','11440':'마포구','11470':'양천구','11500':'강서구','11530':'구로구','11545':'금천구','11560':'영등포구','11590':'동작구','11620':'관악구','11650':'서초구','11680':'강남구','11710':'송파구','11740':'강동구' }
  for (const district of body.districts) {
    const sameCourse = current.find((row) => row.district_code === district.district_code && row.course_ids?.includes(body.course_id))
    const existing = current.find((row) => row.district_code === district.district_code)
    const courseIds = new Set(existing?.course_ids ?? [])
    courseIds.add(body.course_id)
    const merged = [...new Set([...(existing?.place_names ?? []), ...district.place_names])].slice(0, 12)
    const updated = { district_code: district.district_code, district_name: names[district.district_code], course_count: courseIds.size, course_ids: [...courseIds], last_used_at: sameCourse ? existing.last_used_at : now, place_names: merged }
    const index = current.findIndex((row) => row.district_code === district.district_code)
    if (index < 0) current.push(updated); else current[index] = updated
  }
  write(EXPLORED_REGIONS_KEY, current)
  window.dispatchEvent(new CustomEvent('koala-explored-regions-updated', { detail: current }))
  return current
}
export async function deleteSavedCourse(token, courseId) {
  if (!MOCK_AUTH) return api(`/users/me/courses/${courseId}`, { method: 'DELETE', token })
  assertMockToken(token); write(COURSE_KEY, read(COURSE_KEY, []).filter((course) => String(course.id) !== String(courseId))); return null
}
export const isMockAuthEnabled = () => MOCK_AUTH

export async function getExcludedPlaces(token) {
  if (!MOCK_AUTH) return api('/users/me/excluded-places', { token })
  assertMockToken(token); return read(EXCLUDED_PLACE_KEY, [])
}

export async function excludePlace(token, body) {
  if (!MOCK_AUTH) return api('/users/me/excluded-places', { method: 'POST', token, body })
  assertMockToken(token)
  const current = read(EXCLUDED_PLACE_KEY, [])
  const existing = current.find((item) => item.place_key === body.place_key)
  if (existing) return existing
  const item = { ...body, id: Date.now(), user_id: 1, created_at: new Date().toISOString() }
  write(EXCLUDED_PLACE_KEY, [item, ...current].slice(0, 200))
  return item
}

export async function restoreExcludedPlace(token, placeKey) {
  if (!MOCK_AUTH) return api(`/users/me/excluded-places/${encodeURIComponent(placeKey)}`, { method: 'DELETE', token })
  assertMockToken(token)
  write(EXCLUDED_PLACE_KEY, read(EXCLUDED_PLACE_KEY, []).filter((item) => item.place_key !== placeKey))
  return null
}

export async function getFavoritePlaces(token) {
  if (!MOCK_AUTH) return api('/users/me/favorite-places', { token })
  assertMockToken(token)
  return read(FAVORITE_PLACE_KEY, [])
}

export async function addFavoritePlace(token, body) {
  if (!MOCK_AUTH) return api('/users/me/favorite-places', { method: 'POST', token, body })
  assertMockToken(token)
  const current = read(FAVORITE_PLACE_KEY, [])
  const item = { ...body, id: Date.now(), user_id: 1, created_at: new Date().toISOString() }
  write(FAVORITE_PLACE_KEY, [item, ...current.filter((saved) => saved.place_key !== body.place_key)].slice(0, 200))
  return item
}

export async function removeFavoritePlace(token, placeKey) {
  if (!MOCK_AUTH) return api(`/users/me/favorite-places/${encodeURIComponent(placeKey)}`, { method: 'DELETE', token })
  assertMockToken(token)
  write(FAVORITE_PLACE_KEY, read(FAVORITE_PLACE_KEY, []).filter((item) => item.place_key !== placeKey))
  return null
}

export async function recordInteraction(token, body) {
  if (!token) return null
  const now = new Date()
  const payload = {
    ...body,
    context_hour: body.context_hour ?? now.getHours(),
    context_day: body.context_day ?? ([0, 6].includes(now.getDay()) ? 'weekend' : 'weekday'),
  }
  if (!MOCK_AUTH) return api('/users/me/interactions', { method: 'POST', token, body: payload })
  assertMockToken(token)
  write(INTERACTION_KEY, [payload, ...read(INTERACTION_KEY, [])].slice(0, 500))
  return null
}

export async function clearInteractionHistory(token) {
  if (!MOCK_AUTH) return api('/users/me/interactions', { method: 'DELETE', token })
  assertMockToken(token)
  write(INTERACTION_KEY, [])
  return null
}

export async function getPersonalizationProfile(token) {
  // 개인화 집계 장애 때문에 정상 로그인까지 풀리지 않도록 빈 프로필로 폴백한다.
  if (!MOCK_AUTH) {
    try { return await api('/users/me/personalization', { token }) }
    catch { return { activity_preferences: {}, context_activity_preferences: {}, interaction_count: 0 } }
  }
  assertMockToken(token)
  return { activity_preferences: {}, context_activity_preferences: {}, interaction_count: read(INTERACTION_KEY, []).length }
}
