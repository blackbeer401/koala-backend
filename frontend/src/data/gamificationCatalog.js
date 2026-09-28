export const TRAVEL_RANKS = [
  ['travel_novice', '여행초보', 0],
  ['travel_intermediate', '여행중수', 100],
  ['travel_expert', '여행고수', 300],
  ['traveler', '여행가', 700],
  ['travel_scholar', '여행박사', 1500],
]

// 업적 진행은 서버에 쌓인 실제 코스·안내·퀘스트·지역 기록으로 계산한다.
export const ACHIEVEMENT_CATALOG = [
  ['district_1', '서울 첫발', '첫 자치구를 코스에 담았어요.', 'districts', 1, 'title_district_1', '첫발은 서울에서'],
  ['district_3', '동네 구경꾼', '서로 다른 자치구 3곳을 열었어요.', 'districts', 3, 'title_district_3', '동네 구경꾼'],
  ['district_5', '지도 확대 인간', '서로 다른 자치구 5곳을 열었어요.', 'districts', 5, 'title_district_5', '지도 확대 인간'],
  ['district_10', '구석구석 참견러', '서로 다른 자치구 10곳을 열었어요.', 'districts', 10, 'title_district_10', '구석구석 참견러'],
  ['district_15', '서울 반바퀴 유랑단', '서로 다른 자치구 15곳을 열었어요.', 'districts', 15, 'title_district_15', '서울 반바퀴 유랑단'],
  ['district_25', '서울 도장깨기왕', '서울 25개 자치구를 모두 열었어요.', 'districts', 25, 'title_district_25', '서울 도장깨기왕'],
  ['course_1', '첫 코스 확정', '나만의 코스를 처음 확정했어요.', 'courses', 1, 'title_course_1', '약속 메이커'],
  ['course_3', '코스 단골', '코스를 3번 확정했어요.', 'courses', 3, 'title_course_3', '코스 짜는 사람'],
  ['course_10', '일정 수집가', '코스를 10번 확정했어요.', 'courses', 10, 'title_course_10', '동선 수집가'],
  ['course_25', '계획에 진심', '코스를 25번 확정했어요.', 'courses', 25, 'title_course_25', '일정 꽉찬 사람'],
  ['course_50', '서울 약속 공장', '코스를 50번 확정했어요.', 'courses', 50, 'title_course_50', '서울 약속 공장장'],
  ['guide_1', '첫 안내 완료', '코스 안내를 처음 마쳤어요.', 'guides', 1, 'title_guide_1', '일단 나가봄'],
  ['guide_5', '길 위의 단골', '코스 안내를 5번 마쳤어요.', 'guides', 5, 'title_guide_5', '길 위의 단골'],
  ['guide_10', '완주 수집가', '코스 안내를 10번 마쳤어요.', 'guides', 10, 'title_guide_10', '완주 수집가'],
  ['guide_25', '발바닥 MVP', '코스 안내를 25번 마쳤어요.', 'guides', 25, 'title_guide_25', '발바닥 MVP'],
  ['quest_1', '첫 미션 완료', '퀘스트를 처음 완료했어요.', 'quests', 1, 'title_quest_1', '미션 맛보기'],
  ['quest_5', '시키면 잘함', '퀘스트를 5번 완료했어요.', 'quests', 5, 'title_quest_5', '시키면 잘함'],
  ['quest_10', '체크리스트 요정', '퀘스트를 10번 완료했어요.', 'quests', 10, 'title_quest_10', '체크리스트 요정'],
  ['quest_25', '오늘도 해냄', '퀘스트를 25번 완료했어요.', 'quests', 25, 'title_quest_25', '오늘도 해냄'],
  ['quest_50', '퀘스트 전설', '퀘스트를 50번 완료했어요.', 'quests', 50, 'title_quest_50', '퀘스트 전설'],
]

export function buildAchievementProgress(metrics = {}) {
  return ACHIEVEMENT_CATALOG.map(([id, name, description, metric, goal, titleId, titleName]) => {
    const progress = Math.max(0, Number(metrics[metric] ?? 0))
    return {
      id,
      name,
      description,
      progress: Math.min(progress, goal),
      goal,
      unlocked: progress >= goal,
      title_id: titleId,
      title_name: titleName,
    }
  })
}

export function titlesForAchievements(achievements = []) {
  return achievements.filter((achievement) => achievement.unlocked).map((achievement) => ({
    id: achievement.title_id,
    name: achievement.title_name,
    kind: 'achievement',
    achievement_id: achievement.id,
  }))
}
