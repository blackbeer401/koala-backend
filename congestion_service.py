import os
import requests
from dotenv import load_dotenv    
from datetime import datetime
from zoneinfo import ZoneInfo



load_dotenv()

SEOUL_API_KEY = os.getenv("SEOUL_API_KEY")


def get_congestion_data(area_code: str):
    """
    서울시 실시간 인구데이터 API를 호출해
    특정 POI의 현재/예측 혼잡도 데이터를 가져온다.
    """

    url = (
        f"http://openapi.seoul.go.kr:8088/"
        f"{SEOUL_API_KEY}/json/citydata_ppltn/1/5/{area_code}"
    )

    response = requests.get(url)
    response.raise_for_status()

    return response.json()



def get_nearest_forecast_congestion(
    congestion_data: dict,
    arrival_datetime
):
    """
    후보지역 도착 예상시간과 가장 가까운
    서울시 혼잡도 예측시간의 데이터를 반환한다.
    """

    population_data = congestion_data[
        "SeoulRtd.citydata_ppltn"
    ][0]

    forecasts = population_data["FCST_PPLTN"]

    nearest_forecast = min(
        forecasts,
        key=lambda forecast: abs(
            datetime.strptime(
                forecast["FCST_TIME"],
                "%Y-%m-%d %H:%M"
            ).replace(
                tzinfo=arrival_datetime.tzinfo
            )
            - arrival_datetime
        )
    )

    return nearest_forecast

