"""Authenticated user-data APIs owned by the extension layer.

Their request models and SQLAlchemy tables live in Core's shared registries;
Alembic creates or adopts the tables before the integrated server starts.
"""

from datetime import date, datetime, timedelta, timezone
import re
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from auth_routes import get_current_user
from database import get_db
from db_models import (
    ExcludedPlace,
    FavoritePlace,
    GamificationEvent,
    GamificationProfile,
    SavedCourse,
    User,
    UserAchievementUnlock,
    UserExploredRegion,
    UserInteraction,
)
from models import (
    ExcludedPlaceCreate,
    ExcludedPlaceResponse,
    ExploredRegionsCreate,
    ExploredRegionSummary,
    FavoritePlaceCreate,
    FavoritePlaceResponse,
    GamificationEventCreate,
    GamificationTitleUpdate,
    PersonalizationProfileResponse,
    SavedCourseCreate,
    SavedCourseResponse,
    UserInteractionCreate,
)
from personalization_service import build_personalization_profile


router = APIRouter()


SEOUL_DISTRICT_NAMES = {
    "11110": "종로구", "11140": "중구", "11170": "용산구", "11200": "성동구",
    "11215": "광진구", "11230": "동대문구", "11260": "중랑구", "11290": "성북구",
    "11305": "강북구", "11320": "도봉구", "11350": "노원구", "11380": "은평구",
    "11410": "서대문구", "11440": "마포구", "11470": "양천구", "11500": "강서구",
    "11530": "구로구", "11545": "금천구", "11560": "영등포구", "11590": "동작구",
    "11620": "관악구", "11650": "서초구", "11680": "강남구", "11710": "송파구",
    "11740": "강동구",
}
DAILY_QUEST_LIMIT = 2
DAILY_QUEST_XP = {"main": 10, "bonus": 5}
SEOUL_TIMEZONE = timezone(timedelta(hours=9), "KST")


def _explored_region_summaries(db: Session, user_id: int) -> list[dict]:
    records = list(
        db.scalars(
            select(UserExploredRegion)
            .where(UserExploredRegion.user_id == user_id)
            .order_by(UserExploredRegion.created_at.desc(), UserExploredRegion.id.desc())
        )
    )
    grouped: dict[str, dict] = {}
    for record in records:
        summary = grouped.setdefault(
            record.district_code,
            {
                "district_code": record.district_code,
                "district_name": record.district_name,
                "course_ids": set(),
                "last_used_at": record.created_at,
                "place_names": [],
            },
        )
        summary["course_ids"].add(record.course_id)
        for name in record.place_names or []:
            if name not in summary["place_names"]:
                summary["place_names"].append(name)
    return [
        {
            "district_code": item["district_code"],
            "district_name": item["district_name"],
            "course_count": len(item["course_ids"]),
            "last_used_at": item["last_used_at"],
            "place_names": item["place_names"][:12],
        }
        for item in grouped.values()
    ]


TRAVEL_RANKS = [
    ("travel_novice", "여행초보", 0),
    ("travel_intermediate", "여행중수", 100),
    ("travel_expert", "여행고수", 300),
    ("traveler", "여행가", 700),
    ("travel_scholar", "여행박사", 1500),
]

# 업적 조건은 이미 기록하는 코스·안내·퀘스트·지역 데이터만 사용한다.
# 각 달성은 등급과 별개로 장착 가능한 칭호 하나를 연다.
ACHIEVEMENT_SPECS = [
    ("district_1", "서울 첫발", "첫 자치구를 코스에 담았어요.", "districts", 1, "title_district_1", "첫발은 서울에서"),
    ("district_3", "동네 구경꾼", "서로 다른 자치구 3곳을 열었어요.", "districts", 3, "title_district_3", "동네 구경꾼"),
    ("district_5", "지도 확대 인간", "서로 다른 자치구 5곳을 열었어요.", "districts", 5, "title_district_5", "지도 확대 인간"),
    ("district_10", "구석구석 참견러", "서로 다른 자치구 10곳을 열었어요.", "districts", 10, "title_district_10", "구석구석 참견러"),
    ("district_15", "서울 반바퀴 유랑단", "서로 다른 자치구 15곳을 열었어요.", "districts", 15, "title_district_15", "서울 반바퀴 유랑단"),
    ("district_25", "서울 도장깨기왕", "서울 25개 자치구를 모두 열었어요.", "districts", 25, "title_district_25", "서울 도장깨기왕"),
    ("course_1", "첫 코스 확정", "나만의 코스를 처음 확정했어요.", "courses", 1, "title_course_1", "약속 메이커"),
    ("course_3", "코스 단골", "코스를 3번 확정했어요.", "courses", 3, "title_course_3", "코스 짜는 사람"),
    ("course_10", "일정 수집가", "코스를 10번 확정했어요.", "courses", 10, "title_course_10", "동선 수집가"),
    ("course_25", "계획에 진심", "코스를 25번 확정했어요.", "courses", 25, "title_course_25", "일정 꽉찬 사람"),
    ("course_50", "서울 약속 공장", "코스를 50번 확정했어요.", "courses", 50, "title_course_50", "서울 약속 공장장"),
    ("guide_1", "첫 안내 완료", "코스 안내를 처음 마쳤어요.", "guides", 1, "title_guide_1", "일단 나가봄"),
    ("guide_5", "길 위의 단골", "코스 안내를 5번 마쳤어요.", "guides", 5, "title_guide_5", "길 위의 단골"),
    ("guide_10", "완주 수집가", "코스 안내를 10번 마쳤어요.", "guides", 10, "title_guide_10", "완주 수집가"),
    ("guide_25", "발바닥 MVP", "코스 안내를 25번 마쳤어요.", "guides", 25, "title_guide_25", "발바닥 MVP"),
    ("quest_1", "첫 미션 완료", "퀘스트를 처음 완료했어요.", "quests", 1, "title_quest_1", "미션 맛보기"),
    ("quest_5", "시키면 잘함", "퀘스트를 5번 완료했어요.", "quests", 5, "title_quest_5", "시키면 잘함"),
    ("quest_10", "체크리스트 요정", "퀘스트를 10번 완료했어요.", "quests", 10, "title_quest_10", "체크리스트 요정"),
    ("quest_25", "오늘도 해냄", "퀘스트를 25번 완료했어요.", "quests", 25, "title_quest_25", "오늘도 해냄"),
    ("quest_50", "퀘스트 전설", "퀘스트를 50번 완료했어요.", "quests", 50, "title_quest_50", "퀘스트 전설"),
]


def _get_or_create_gamification_profile(db: Session, user_id: int, *, lock: bool = False):
    statement = select(GamificationProfile).where(GamificationProfile.user_id == user_id)
    if lock:
        statement = statement.with_for_update()
    profile = db.scalar(statement)
    if profile is None:
        profile = GamificationProfile(user_id=user_id, equipped_title_id="")
        db.add(profile)
        db.flush()
    return profile


def _gamification_snapshot(db: Session, user_id: int, profile=None) -> dict:
    profile = profile or _get_or_create_gamification_profile(db, user_id)
    regions = list(db.scalars(select(UserExploredRegion.district_code).where(UserExploredRegion.user_id == user_id).distinct()))
    region_count = len(regions)
    course_count = db.scalar(select(func.count()).select_from(GamificationEvent).where(
        GamificationEvent.user_id == user_id,
        GamificationEvent.event_type == "course_confirm",
    )) or 0
    guide_count = db.scalar(select(func.count()).select_from(GamificationEvent).where(
        GamificationEvent.user_id == user_id,
        GamificationEvent.event_type == "course_complete",
    )) or 0
    quest_count = db.scalar(select(func.count()).select_from(GamificationEvent).where(
        GamificationEvent.user_id == user_id,
        GamificationEvent.event_type == "quest_complete",
    )) or 0
    total_xp = profile.total_xp
    rank_index = max(index for index, (_, _, threshold) in enumerate(TRAVEL_RANKS) if total_xp >= threshold)
    rank_id, rank_name, rank_start = TRAVEL_RANKS[rank_index]
    next_rank = TRAVEL_RANKS[rank_index + 1] if rank_index + 1 < len(TRAVEL_RANKS) else None

    metric_values = {
        "districts": region_count,
        "courses": course_count,
        "guides": guide_count,
        "quests": quest_count,
    }
    title_catalog = []
    achievements = []
    manual_unlock_ids = set(db.scalars(
        select(UserAchievementUnlock.achievement_id).where(UserAchievementUnlock.user_id == user_id)
    ))
    for achievement_id, name, description, metric, goal, title_id, title_name in ACHIEVEMENT_SPECS:
        progress = metric_values[metric]
        unlocked_by_activity = progress >= goal
        unlocked_by_grant = achievement_id in manual_unlock_ids
        unlocked = unlocked_by_activity or unlocked_by_grant
        achievements.append({
            "id": achievement_id,
            "name": name,
            "description": description,
            "progress": min(progress, goal),
            "goal": goal,
            "unlocked": unlocked,
            "unlock_source": "activity" if unlocked_by_activity else "manual" if unlocked_by_grant else None,
            "title_id": title_id,
            "title_name": title_name,
        })
        if unlocked:
            title_catalog.append({"id": title_id, "name": title_name, "kind": "achievement", "achievement_id": achievement_id})

    valid_title_ids = {item["id"] for item in title_catalog}
    if profile.equipped_title_id not in valid_title_ids:
        profile.equipped_title_id = title_catalog[0]["id"] if title_catalog else ""
    equipped = next((item for item in title_catalog if item["id"] == profile.equipped_title_id), None)
    return {
        "total_xp": total_xp,
        "rank_id": rank_id,
        "rank_name": rank_name,
        "rank_index": rank_index + 1,
        "rank_count": len(TRAVEL_RANKS),
        "xp_into_rank": total_xp - rank_start,
        "next_rank_xp": next_rank[2] if next_rank else None,
        "xp_to_next_rank": max(0, next_rank[2] - total_xp) if next_rank else 0,
        "equipped_title": equipped,
        "unlocked_titles": title_catalog,
        "achievements": achievements,
        "explored_district_count": region_count,
        "confirmed_course_count": course_count,
        "completed_course_count": guide_count,
        "completed_quest_count": quest_count,
    }


def _award_event(db: Session, user_id: int, event_key: str, event_type: str, xp_delta: int, context_data: dict):
    db.add(GamificationEvent(
        user_id=user_id,
        event_key=event_key,
        event_type=event_type,
        xp_delta=xp_delta,
        context_data=context_data,
    ))
    profile = _get_or_create_gamification_profile(db, user_id, lock=True)
    profile.total_xp += xp_delta
    return profile


@router.get("/users/me/gamification")
def get_gamification_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = _get_or_create_gamification_profile(db, user.id)
    snapshot = _gamification_snapshot(db, user.id, profile)
    db.commit()
    return snapshot


@router.put("/users/me/gamification/title")
def equip_gamification_title(
    request: GamificationTitleUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _get_or_create_gamification_profile(db, user.id, lock=True)
    snapshot = _gamification_snapshot(db, user.id, profile)
    if request.title_id not in {item["id"] for item in snapshot["unlocked_titles"]}:
        raise HTTPException(status_code=400, detail="아직 얻지 못한 칭호예요.")
    profile.equipped_title_id = request.title_id
    db.commit()
    return _gamification_snapshot(db, user.id, profile)


@router.post("/users/me/gamification/events")
def record_gamification_event(
    request: GamificationEventCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """서버 고정 XP 보상과 지역 해제를 한 트랜잭션에서 기록한다."""
    profile = _get_or_create_gamification_profile(db, user.id, lock=True)
    previous_rank_index = max(index for index, (_, _, threshold) in enumerate(TRAVEL_RANKS) if profile.total_xp >= threshold)
    course_key = f"course:{request.course_id}"
    if request.event_type == "course_confirm":
        event_key = f"{course_key}:confirm"
    elif request.event_type == "course_complete":
        event_key = f"{course_key}:complete"
    else:
        if not request.quest_id:
            raise HTTPException(status_code=422, detail="퀘스트 정보가 필요해요.")
        daily_quest = re.fullmatch(r"daily-(\d{4}-\d{2}-\d{2})-(main|bonus)", request.quest_id)
        quest_day = None
        if daily_quest:
            try:
                quest_day = date.fromisoformat(daily_quest.group(1))
            except ValueError as error:
                raise HTTPException(status_code=422, detail="퀘스트 날짜를 확인해 주세요.") from error
            if quest_day != datetime.now(SEOUL_TIMEZONE).date():
                raise HTTPException(status_code=409, detail="오늘의 미션만 완료할 수 있어요.")
        event_key = (
            f"daily:quest:{daily_quest.group(1)}:{daily_quest.group(2)}"
            if daily_quest
            else f"{course_key}:quest:{request.quest_id}"
        )

    existing = db.scalar(select(GamificationEvent).where(
        GamificationEvent.user_id == user.id,
        GamificationEvent.event_key == event_key,
    ))
    if existing:
        return {
            "xp_awarded": 0,
            "already_completed": True,
            "newly_unlocked_districts": [],
            "newly_unlocked_achievements": [],
            "profile": _gamification_snapshot(db, user.id, profile),
            "regions": _explored_region_summaries(db, user.id),
        }

    confirmed = db.scalar(select(GamificationEvent.id).where(
        GamificationEvent.user_id == user.id,
        GamificationEvent.event_key == f"{course_key}:confirm",
    ))
    if request.event_type != "course_confirm" and not confirmed:
        raise HTTPException(status_code=409, detail="먼저 코스를 확정해야 보상을 받을 수 있어요.")

    prior_achievement_ids = {
        achievement["id"]
        for achievement in _gamification_snapshot(db, user.id, profile)["achievements"]
        if achievement["unlocked"]
    }

    now = datetime.now()
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    newly_unlocked = []
    xp_awarded = 0
    if request.event_type == "course_confirm":
        daily_confirm_count = db.scalar(select(func.count()).select_from(GamificationEvent).where(
            GamificationEvent.user_id == user.id,
            GamificationEvent.event_type == "course_confirm",
            GamificationEvent.created_at >= day_start,
        )) or 0
        xp_awarded = 10 if daily_confirm_count < 3 else 0
        _award_event(db, user.id, event_key, "course_confirm", xp_awarded, {"course_id": request.course_id})
        seen_codes = set()
        for district in request.districts:
            if district.district_code in seen_codes:
                continue
            seen_codes.add(district.district_code)
            same_course = db.scalar(select(UserExploredRegion.id).where(
                UserExploredRegion.user_id == user.id,
                UserExploredRegion.course_id == request.course_id,
                UserExploredRegion.district_code == district.district_code,
            ))
            if same_course:
                continue
            previously_explored = db.scalar(select(UserExploredRegion.id).where(
                UserExploredRegion.user_id == user.id,
                UserExploredRegion.district_code == district.district_code,
            ))
            db.add(UserExploredRegion(
                user_id=user.id,
                course_id=request.course_id,
                district_code=district.district_code,
                district_name=SEOUL_DISTRICT_NAMES[district.district_code],
                place_names=list(dict.fromkeys(district.place_names)),
            ))
            if not previously_explored:
                region_event_key = f"district:{district.district_code}"
                _award_event(db, user.id, region_event_key, "district_unlock", 20, {"district_code": district.district_code})
                xp_awarded += 20
                newly_unlocked.append({"district_code": district.district_code, "district_name": SEOUL_DISTRICT_NAMES[district.district_code]})
    elif request.event_type == "course_complete":
        daily_complete_count = db.scalar(select(func.count()).select_from(GamificationEvent).where(
            GamificationEvent.user_id == user.id,
            GamificationEvent.event_type == "course_complete",
            GamificationEvent.created_at >= day_start,
        )) or 0
        xp_awarded = 15 if daily_complete_count < 3 else 0
        _award_event(db, user.id, event_key, "course_complete", xp_awarded, {"course_id": request.course_id})
    else:
        # 퀘스트 키의 날짜는 위에서 한국 날짜로 검증했다. DB 서버 시간대에
        # 기대지 않고 그 날짜에 실제 지급된 미션 보상만 세어 일일 제한을 맞춘다.
        quest_scope = (
            GamificationEvent.event_key.like(f"daily:quest:{quest_day.isoformat()}:%")
            if daily_quest
            else GamificationEvent.created_at >= day_start
        )
        daily_quest_count = db.scalar(select(func.count()).select_from(GamificationEvent).where(
            GamificationEvent.user_id == user.id,
            GamificationEvent.event_type == "quest_complete",
            quest_scope,
            GamificationEvent.xp_delta > 0,
        )) or 0
        slot = daily_quest.group(2) if daily_quest else None
        reward_for_slot = DAILY_QUEST_XP.get(slot, 5)
        xp_awarded = reward_for_slot if daily_quest_count < DAILY_QUEST_LIMIT else 0
        _award_event(db, user.id, event_key, "quest_complete", xp_awarded, {
            "course_id": request.course_id,
            "quest_id": request.quest_id,
        })

    db.commit()
    updated_profile = _gamification_snapshot(db, user.id, profile)
    newly_unlocked_achievements = [
        {
            "id": achievement["id"],
            "name": achievement["name"],
            "title_id": achievement["title_id"],
            "title_name": achievement["title_name"],
        }
        for achievement in updated_profile["achievements"]
        if achievement["unlocked"] and achievement["id"] not in prior_achievement_ids
    ]
    # 처음 얻은 칭호를 자동 장착했을 때도 다음 조회에 유지되도록 저장한다.
    db.commit()
    return {
        "xp_awarded": xp_awarded,
        "already_completed": False,
        "newly_unlocked_districts": newly_unlocked,
        "newly_unlocked_achievements": newly_unlocked_achievements,
        "rank_up": updated_profile["rank_index"] - 1 > previous_rank_index,
        "profile": updated_profile,
        "regions": _explored_region_summaries(db, user.id),
    }


@router.get(
    "/users/me/explored-regions",
    response_model=list[ExploredRegionSummary],
)
def list_explored_regions(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _explored_region_summaries(db, user.id)


@router.post(
    "/users/me/explored-regions",
    response_model=list[ExploredRegionSummary],
    status_code=status.HTTP_201_CREATED,
)
def record_explored_regions(
    request: ExploredRegionsCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    seen_codes: set[str] = set()
    for region in request.districts:
        code = region.district_code
        if code in seen_codes:
            continue
        seen_codes.add(code)
        existing = db.scalar(
            select(UserExploredRegion).where(
                UserExploredRegion.user_id == user.id,
                UserExploredRegion.course_id == request.course_id,
                UserExploredRegion.district_code == code,
            )
        )
        if existing:
            continue
        db.add(
            UserExploredRegion(
                user_id=user.id,
                course_id=request.course_id,
                district_code=code,
                district_name=SEOUL_DISTRICT_NAMES[code],
                place_names=list(dict.fromkeys(region.place_names)),
            )
        )
    db.commit()
    return _explored_region_summaries(db, user.id)


@router.post(
    "/users/me/courses",
    response_model=SavedCourseResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_saved_course(
    request: SavedCourseCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    course = SavedCourse(user_id=user.id, **request.model_dump())
    db.add(course)
    db.commit()
    db.refresh(course)
    return course


@router.get("/users/me/courses", response_model=list[SavedCourseResponse])
def list_saved_courses(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return list(
        db.scalars(
            select(SavedCourse)
            .where(SavedCourse.user_id == user.id)
            .order_by(SavedCourse.created_at.desc(), SavedCourse.id.desc())
            .limit(30)
        )
    )


@router.delete(
    "/users/me/courses/{course_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_saved_course(
    course_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    course = db.scalar(
        select(SavedCourse).where(
            SavedCourse.id == course_id,
            SavedCourse.user_id == user.id,
        )
    )
    if course is None:
        raise HTTPException(status_code=404, detail="저장한 코스를 찾지 못했어요.")
    db.delete(course)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/users/me/excluded-places", response_model=list[ExcludedPlaceResponse])
def list_excluded_places(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return list(
        db.scalars(
            select(ExcludedPlace)
            .where(ExcludedPlace.user_id == user.id)
            .order_by(ExcludedPlace.created_at.desc(), ExcludedPlace.id.desc())
            .limit(200)
        )
    )


@router.post(
    "/users/me/excluded-places",
    response_model=ExcludedPlaceResponse,
    status_code=status.HTTP_201_CREATED,
)
def exclude_place(
    request: ExcludedPlaceCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = db.scalar(
        select(ExcludedPlace).where(
            ExcludedPlace.user_id == user.id,
            ExcludedPlace.place_key == request.place_key,
        )
    )
    if existing is not None:
        return existing
    item = ExcludedPlace(user_id=user.id, **request.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.delete(
    "/users/me/excluded-places/{place_key}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def restore_excluded_place(
    place_key: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.scalar(
        select(ExcludedPlace).where(
            ExcludedPlace.user_id == user.id,
            ExcludedPlace.place_key == place_key,
        )
    )
    if item is not None:
        db.delete(item)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/users/me/favorite-places", response_model=list[FavoritePlaceResponse])
def list_favorite_places(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return list(
        db.scalars(
            select(FavoritePlace)
            .where(FavoritePlace.user_id == user.id)
            .order_by(FavoritePlace.created_at.desc(), FavoritePlace.id.desc())
            .limit(200)
        )
    )


@router.post(
    "/users/me/favorite-places",
    response_model=FavoritePlaceResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_favorite_place(
    request: FavoritePlaceCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 중복 클릭은 새 행을 만들지 않고 저장된 스냅샷만 최신 정보로 갱신한다.
    item = db.scalar(
        select(FavoritePlace).where(
            FavoritePlace.user_id == user.id,
            FavoritePlace.place_key == request.place_key,
        )
    )
    if item is None:
        item = FavoritePlace(user_id=user.id, **request.model_dump())
        db.add(item)
    else:
        item.place_name = request.place_name
        item.category = request.category
        item.place_data = request.place_data
    db.commit()
    db.refresh(item)
    return item


@router.delete(
    "/users/me/favorite-places/{place_key}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_favorite_place(
    place_key: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.scalar(
        select(FavoritePlace).where(
            FavoritePlace.user_id == user.id,
            FavoritePlace.place_key == place_key,
        )
    )
    if item is not None:
        db.delete(item)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/users/me/interactions", status_code=status.HTTP_204_NO_CONTENT)
def record_user_interaction(
    request: UserInteractionCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.add(UserInteraction(user_id=user.id, **request.model_dump()))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/users/me/interactions", status_code=status.HTTP_204_NO_CONTENT)
def clear_user_interactions(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """학습 기록만 지우고 사용자가 직접 설정한 선호·저장 목록은 유지한다."""
    db.execute(delete(UserInteraction).where(UserInteraction.user_id == user.id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/users/me/personalization",
    response_model=PersonalizationProfileResponse,
)
def read_personalization_profile(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return build_personalization_profile(db, user.id)
