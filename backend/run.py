"""KOALA layered backend entrypoint.

`core` owns the shared application, schemas, and database metadata. `extensions`
contains the selected recommendation overrides and user-data routes. This file
is the single entrypoint that assembles them for local and deployed runs.
"""

from pathlib import Path
import importlib.util
import os
import sys

from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect


BACKEND_DIR = Path(__file__).resolve().parent
CORE_DIR = BACKEND_DIR / "core"
EXTENSIONS_DIR = BACKEND_DIR / "extensions"
LLM_RUNTIME_DIR = CORE_DIR / "LLM" / "LLM_V1_4_FREEZE"

# These modules are the only intentional Core replacements. Shared request
# schemas and SQLAlchemy models stay in Core so both layers use one contract.
EXTENSION_OVERRIDES = {
    "conditions",
    "course_routes",
    "course_time_evaluator",
    "llm_service",
    "map_service",
    "place_recommendation_service",
    "place_routes",
    "proactive_recommendation_service",
    "region_recommendation_service",
    "region_routes",
    "route_travel_time",
}
EXTENSION_MODULES = EXTENSION_OVERRIDES | {
    "audit_trace",
    "extension_routes",
    "extension_schemas",
    "naver_image_service",
    "personalization_service",
    "popup_data_selector",
    "user_data_routes",
}

if not (CORE_DIR / "main.py").exists():
    raise RuntimeError("backend/core/main.py를 찾을 수 없습니다.")

# dotenv and relative data paths used by the upstream backend resolve from core.
os.chdir(CORE_DIR)

# Selected extension modules override the upstream Core modules; other imports
# resolve from Core. This ordering is isolated to this single entrypoint.
sys.path.insert(0, str(CORE_DIR))
if (LLM_RUNTIME_DIR / "intent_parser.py").exists():
    sys.path.insert(0, str(LLM_RUNTIME_DIR))
sys.path.insert(0, str(EXTENSIONS_DIR))

# Development reloaders can import Core modules before this entrypoint.
# Clear the explicit override list so module-cache state cannot select versions.
for module_name in EXTENSION_MODULES:
    sys.modules.pop(module_name, None)

# Always load the upstream application entrypoint from ``core`` explicitly.
core_main_spec = importlib.util.spec_from_file_location(
    "koala_core_main",
    CORE_DIR / "main.py",
)
if core_main_spec is None or core_main_spec.loader is None:
    raise RuntimeError("backend/core/main.py를 불러올 수 없습니다.")
core_main = importlib.util.module_from_spec(core_main_spec)
core_main_spec.loader.exec_module(core_main)
app = core_main.app

for module_name in EXTENSION_OVERRIDES:
    module = sys.modules.get(module_name)
    expected_path = (EXTENSIONS_DIR / f"{module_name}.py").resolve()
    if module and Path(module.__file__).resolve() != expected_path:
        raise RuntimeError(
            f"통합 서버가 잘못된 {module_name} 모듈을 불러왔습니다: {module.__file__}"
        )
from extension_routes import router as extension_router  # noqa: E402
from database import engine  # noqa: E402


def _cors_origins() -> list[str]:
    """Return explicit browser origins without changing the upstream app."""
    origins = {
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    }
    configured = os.getenv("KOALA_CORS_ORIGINS", "")
    frontend_url = os.getenv("FRONTEND_URL", "")
    for value in (*configured.split(","), frontend_url):
        origin = value.strip().rstrip("/")
        if origin and origin != "*":
            origins.add(origin)
    return sorted(origins)


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-Koala-Trace-Id",
    ],
)

app.include_router(extension_router)


def _verify_user_data_schema() -> None:
    """Fail early with an actionable message when a deployment missed migrations."""
    required_tables = {
        "saved_courses",
        "excluded_places",
        "favorite_places",
        "user_interactions",
        "user_explored_regions",
        "user_gamification_profiles",
        "user_achievement_unlocks",
        "user_gamification_events",
    }
    existing_tables = set(inspect(engine).get_table_names())
    missing_tables = sorted(required_tables - existing_tables)
    if missing_tables:
        missing = ", ".join(missing_tables)
        raise RuntimeError(
            "KOALA 사용자 데이터 테이블이 없습니다: "
            f"{missing}. 서버를 실행하기 전에 backend/core에서 "
            "Alembic upgrade head를 적용해 주세요."
        )


_verify_user_data_schema()

# The launcher owns the health/identity endpoint.  Replace the upstream root
# response without changing ``core/main.py`` so operators can verify that the
# extension layer, not the standalone core app, is running.
app.router.routes = [
    route for route in app.router.routes if getattr(route, "path", None) != "/"
]


@app.get("/")
def integrated_root():
    return {
        "message": "KOALA integrated backend is running",
        "version": "mvp2-integrated-extensions",
        "entrypoint": "run:app",
    }
