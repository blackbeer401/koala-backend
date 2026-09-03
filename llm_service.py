import json
import sys
from pathlib import Path

from openai import OpenAI
from dotenv import load_dotenv
from models import StructuredConditions

load_dotenv()

HERE = Path(__file__).resolve().parent
FREEZE_DIR = HERE / "LLM" / "LLM_V1_4_FREEZE"

# Freeze 모듈은 같은 폴더의 파일을 sibling import한다.
sys.path.insert(0, str(FREEZE_DIR))
try:
    from intent_parser import parse_intent
finally:
    sys.path.remove(str(FREEZE_DIR))

# LLM 담당자가 테스트한 모델
MODEL = "gpt-5.6-terra"


def parse_user_intent(
    user_input: str,
    current_datetime: str,
    timezone: str = "Asia/Seoul"
) -> dict:
    """
    사용자의 자연어를 LLM으로 분석하여
    LLM V1.3.1 resilience freeze의 16개 필드 JSON으로 변환한다.
    """
    return parse_intent(
        user_input,
        runtime_context={
            "current_datetime": current_datetime,
            "timezone": timezone,
        },
    )


if __name__ == "__main__":
    test_input = "지금 사당인데 7시에 잠실 약속 있어. 그사이에 카페 가고 싶어."

    test_datetime = "2026-08-31T12:48:00+09:00"

    result = parse_user_intent(
        user_input=test_input,
        current_datetime=test_datetime
    )

    print(json.dumps(
        result,
        ensure_ascii=False,
        indent=2
    ))

    conditions = StructuredConditions(**result)

    print("\n=== StructuredConditions 변환 결과 ===")
    print(conditions.model_dump())


def generate_recommendation_message(
    user_message: str,
    recommendation_result: dict
):
    """
    백엔드가 계산한 추천 결과를 이용해
    사용자에게 보여줄 자연어 추천 문장을 생성한다.
    """

    prompt = f"""
너는 지역 추천 서비스의 최종 추천 결과를 사용자에게 설명하는 역할이다.

사용자가 입력한 내용:
{user_message}

백엔드가 계산한 추천 결과:
{recommendation_result}

규칙:
- 추천 지역과 점수는 백엔드 계산 결과를 그대로 사용한다.
- 새로운 지역을 임의로 추가하지 않는다.
- 점수를 이용해 지역의 순위를 다시 계산하거나 변경하지 않는다.
- current_area가 있으면 반드시 현재 지역을 가장 먼저 안내한다.
- other_areas는 제공된 배열 순서대로 그다음 대안으로 안내한다.
- extended_areas는 이동 부담이 큰 추가 선택지로만 안내한다.
- current_area보다 other_areas의 점수가 높더라도 "가장 추천", "1순위" 등으로 표현하지 않는다.
- 이동시간, 혼잡도, 활동 적합도 등 제공된 정보만 사용한다.
- 사용자에게 자연스럽고 간결한 한국어로 설명한다.
"""
    
    client = OpenAI()
    response = client.responses.create(
        model=MODEL,
        input=prompt
    )

    return response.output_text
