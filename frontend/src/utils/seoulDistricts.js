// 서울 법정동 자료에서 사용한 자치구 코드와 표기를 주소 문자열에 연결한다.
export const SEOUL_DISTRICTS = [
  ["11110", "종로구"], ["11140", "중구"], ["11170", "용산구"], ["11200", "성동구"],
  ["11215", "광진구"], ["11230", "동대문구"], ["11260", "중랑구"], ["11290", "성북구"],
  ["11305", "강북구"], ["11320", "도봉구"], ["11350", "노원구"], ["11380", "은평구"],
  ["11410", "서대문구"], ["11440", "마포구"], ["11470", "양천구"], ["11500", "강서구"],
  ["11530", "구로구"], ["11545", "금천구"], ["11560", "영등포구"], ["11590", "동작구"],
  ["11620", "관악구"], ["11650", "서초구"], ["11680", "강남구"], ["11710", "송파구"],
  ["11740", "강동구"],
].map(([code, name]) => ({ code, name }));

export function districtForPlace(place) {
  const address = [place?.address, place?.address_name, place?.road_address, place?.road_address_name]
    .filter(Boolean).join(" ");
  if (!/(서울특별시|서울시|서울)/.test(address)) return null;
  return SEOUL_DISTRICTS.find(({ name }) => address.includes(name)) ?? null;
}
