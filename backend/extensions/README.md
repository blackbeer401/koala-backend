# KOALA extension settings

Recommendation overrides and user-data routes live here. Shared request
schemas and SQLAlchemy models live under `backend/core`, so the integrated
application uses one canonical contract and one Alembic metadata registry.
Optional extension settings belong in `backend/core/.env`, because
`backend/run.py` starts the integrated application from that directory.

Run the application only through `backend/run.py` (`run:app`). Apply database
changes from `backend/core` with `alembic upgrade head` before starting it.

To enable place images through NAVER API HUB Image Search, add these server-side variables:

```dotenv
NAVER_CLIENT_ID=your-client-id
NAVER_CLIENT_SECRET=your-client-secret
```

The credentials are read only by the backend and are never returned to the
browser. Without both values, image enrichment is disabled and the existing
category image remains in use. Search results and verified image files are
cached under the system temporary directory's `KOALA/cache` folder for seven days; failed lookups are
cached for one hour. `KOALA_CACHE_DIR` can override that location.
