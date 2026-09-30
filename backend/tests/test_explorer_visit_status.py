"""A planned district becomes visited only after its course guidance completes."""

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

import run  # noqa: F401 - registers the integrated Core and extension import paths
from db_models import GamificationEvent, UserExploredRegion
from user_data_routes import _explored_region_summaries


def test_course_confirmation_is_a_plan_until_guidance_completes():
    engine = create_engine("sqlite:///:memory:")
    UserExploredRegion.__table__.create(engine)
    GamificationEvent.__table__.create(engine)
    with Session(engine) as db:
        db.add(UserExploredRegion(
            id=1, user_id=1, course_id="course-1", district_code="11620",
            district_name="관악구", place_names=["신림역"],
        ))
        db.add(GamificationEvent(
            id=1, user_id=1, event_key="course:course-1:confirm",
            event_type="course_confirm", xp_delta=10, context_data={"course_id": "course-1"},
        ))
        db.commit()

        planned = _explored_region_summaries(db, 1)
        assert planned[0]["course_count"] == 1
        assert planned[0]["visited"] is False

        db.add(GamificationEvent(
            id=2, user_id=1, event_key="course:course-1:complete",
            event_type="course_complete", xp_delta=15, context_data={"course_id": "course-1"},
        ))
        db.commit()

        visited = _explored_region_summaries(db, 1)
        assert visited[0]["visited"] is True
        assert visited[0]["visited_course_count"] == 1
