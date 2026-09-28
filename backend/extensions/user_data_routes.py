"""Authenticated user data APIs owned by the extension layer.

The upstream backend stays untouched.  Tables introduced by this layer are
created lazily with ``checkfirst`` so an existing development database can run
the feature without a separate destructive migration step.
"""

from datetime import datetime
import re
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session
from threading import Lock

from auth_routes import get_current_user
from database import engine, get_db
from db_models import (
    ExcludedPlace,
    FavoritePlace,
    GamificationEvent,
    GamificationProfile,
    SavedCourse,
    User,
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
_user_data_tables_ready = False
_user_data_tables_lock = Lock()


def ensure_user_data_tables() -> None:
    """Create extension-owned tables before requests begin."""
    global _user_data_tables_ready
    if _user_data_tables_ready:
        return
    with _user_data_tables_lock:
        if _user_data_tables_ready:
            return
        SavedCourse.__table__.create(bind=engine, checkfirst=True)
        ExcludedPlace.__table__.create(bind=engine, checkfirst=True)
        FavoritePlace.__table__.create(bind=engine, checkfirst=True)
        UserInteraction.__table__.create(bind=engine, checkfirst=True)
        UserExploredRegion.__table__.create(bind=engine, checkfirst=True)
        GamificationProfile.__table__.create(bind=engine, checkfirst=True)
        GamificationEvent.__table__.create(bind=engine, checkfirst=True)
        _user_data_tables_ready = True


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


def _get_or_create_gamification_profile(db: Session, user_id: int, *, lock: bool = False):
    statement = select(GamificationProfile).where(GamificationProfile.user_id == user_id)
    if lock:
        statement = statement.with_for_update()
    profile = db.scalar(statement)
    if profile is None:
        profile = GamificationProfile(user_id=user_id)
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
    quest_count = db.scalar(select(func.count()).select_from(GamificationEvent).where(
        GamificationEvent.user_id == user_id,
        GamificationEvent.event_type == "quest_complete",
        GamificationEvent.xp_delta > 0,
    )) or 0
    total_xp = profile.total_xp
    rank_index = max(index for index, (_, _, threshold) in enumerate(TRAVEL_RANKS) if total_xp >= threshold)
    rank_id, rank_name, rank_start = TRAVEL_RANKS[rank_index]
    next_rank = TRAVEL_RANKS[rank_index + 1] if rank_index + 1 < len(TRAVEL_RANKS) else None

    title_catalog = [
        {"id": key, "name": name, "kind": "rank", "required_xp": threshold}
        for key, name, threshold in TRAVEL_RANKS if total_xp >= threshold
    ]
    achievement_specs = [
        ("district_first", "서울 첫걸음", "첫 지역 코스를 확정했어요", region_count, 1, "title"),
        ("district_five", "다섯 지역 탐험", "다섯 개 자치구의 코스를 사용했어요", region_count, 5, "badge"),
        ("district_ten", "서울 수집가", "열 개 자치구의 코스를 사용했어요", region_count, 10, "title"),
        ("district_all", "서울 완주", "서울 25개 자치구를 모두 열었어요", region_count, 25, "badge"),
        ("course_ten", "코스 단골", "코스를 열 번 확정했어요", course_count, 10, "badge"),
        ("quest_ten", "퀘스트 해결사", "퀘스트를 열 번 완료했어요", quest_count, 10, "title"),
    ]
    achievements = []
    for achievement_id, name, description, progress, goal, kind in achievement_specs:
        unlocked = progress >= goal
        achievements.append({
            "id": achievement_id,
            "name": name,
            "description": description,
            "progress": min(progress, goal),
            "goal": goal,
            "unlocked": unlocked,
        })
        if unlocked and kind == "title":
            title_catalog.append({"id": achievement_id, "name": name, "kind": "achievement"})

    valid_title_ids = {item["id"] for item in title_catalog}
    if profile.equipped_title_id not in valid_title_ids:
        profile.equipped_title_id = rank_id
    equipped = next(item for item in title_catalog if item["id"] == profile.equipped_title_id)
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
    ensure_user_data_tables()
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
    ensure_user_data_tables()
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
    ensure_user_data_tables()
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
            "profile": _gamification_snapshot(db, user.id, profile),
            "regions": _explored_region_summaries(db, user.id),
        }

    confirmed = db.scalar(select(GamificationEvent.id).where(
        GamificationEvent.user_id == user.id,
        GamificationEvent.event_key == f"{course_key}:confirm",
    ))
    if request.event_type != "course_confirm" and not confirmed:
        raise HTTPException(status_code=409, detail="먼저 코스를 확정해야 보상을 받을 수 있어요.")

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
        daily_quest_count = db.scalar(select(func.count()).select_from(GamificationEvent).where(
            GamificationEvent.user_id == user.id,
            GamificationEvent.event_type == "quest_complete",
            GamificationEvent.created_at >= day_start,
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
    return {
        "xp_awarded": xp_awarded,
        "already_completed": False,
        "newly_unlocked_districts": newly_unlocked,
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
    ensure_user_data_tables()
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
    ensure_user_data_tables()
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
