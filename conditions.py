from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from models import RecommendRequest, StructuredConditions


def resolve_start_location(
    request: RecommendRequest,
    conditions: StructuredConditions
):
    # 사용자가 별도의 시작 위치를 말한 경우
    if conditions.start_location_text is not None:
        return {
            "source": "text",
            "location_text": conditions.start_location_text,
            "latitude": None,
            "longitude": None
        }

    # 별도 시작 위치가 없고 GPS가 있는 경우
    if request.gps_latitude is not None and request.gps_longitude is not None:
        return {
            "source": "gps",
            "location_text": None,
            "latitude": request.gps_latitude,
            "longitude": request.gps_longitude
        }

    # 둘 다 없는 경우
    return {
        "source": "missing",
        "location_text": None,
        "latitude": None,
        "longitude": None
    }

def resolve_start_time(conditions: StructuredConditions):

    # 사용자가 시작 시간을 직접 말한 경우
    if conditions.start_time is not None:
        return {
            "source": "text",
            "start_time": conditions.start_time
        }

    # 시작 시간을 말하지 않은 경우 현재 시각 사용
    current_time = datetime.now(ZoneInfo("Asia/Seoul")).strftime("%H:%M")

    return {
        "source": "current",
        "start_time": current_time
    }

def resolve_end_location(conditions: StructuredConditions):

    # 다음 일정 위치를 사용자가 말한 경우
    if conditions.end_location_text is not None:
        return {
            "source": "text",
            "location_text": conditions.end_location_text,
            "latitude": None,
            "longitude": None
        }

    # 다음 일정 위치가 없는 경우
    return {
        "source": "none",
        "location_text": None,
        "latitude": None,
        "longitude": None
    }

def resolve_end_time(conditions: StructuredConditions):

    # 사용자가 종료 시간 또는 다음 일정 시간을 말한 경우
    if conditions.end_time is not None:
        return {
            "source": "text",
            "end_time": conditions.end_time
        }

    # 종료 시간이 없는 경우
    return {
        "source": "none",
        "end_time": None
    }

def resolve_datetimes(
    start_time: dict,
    end_time: dict
):
    now = datetime.now(ZoneInfo("Asia/Seoul"))

    start_datetime = datetime.strptime(
        start_time["start_time"],
        "%H:%M"
    ).replace(
        year=now.year,
        month=now.month,
        day=now.day,
        tzinfo=ZoneInfo("Asia/Seoul")
    )

    # 종료 시간이 없는 경우
    if end_time["end_time"] is None:
        return {
            "start_datetime": start_datetime,
            "end_datetime": None
        }

    end_datetime = datetime.strptime(
        end_time["end_time"],
        "%H:%M"
    ).replace(
        year=now.year,
        month=now.month,
        day=now.day,
        tzinfo=ZoneInfo("Asia/Seoul")
    )

    # 종료 시간이 시작 시간보다 이르면 자정을 넘긴 것으로 처리
    if end_datetime <= start_datetime:
        end_datetime += timedelta(days=1)

    return {
        "start_datetime": start_datetime,
        "end_datetime": end_datetime
    }

def calculate_time_window(
    resolved_datetimes: dict
    ):
    start_datetime = resolved_datetimes["start_datetime"]
    end_datetime = resolved_datetimes["end_datetime"]

    # 종료 시간이 없는 경우
    if end_datetime is None:
        return {
            "time_window_minutes": None
        }

    # 시작 시간부터 종료 시간까지의 전체 시간창을 분 단위로 계산
    time_window_minutes = int(
        (end_datetime - start_datetime).total_seconds() / 60
    )

    return {
        "time_window_minutes": time_window_minutes
    }
