import { useEffect, useMemo, useState } from "react";
import geometry from "../../data/seoulDistrictGeometry.json";
import calendarIcon from "../../assets/images/seoul-explorer/calendar-check.png";
import mapIcon from "../../assets/images/seoul-explorer/map-view.png";
import listIcon from "../../assets/images/seoul-explorer/list-view.png";
import zoomInIcon from "../../assets/images/seoul-explorer/zoom-in.png";
import routeIcon from "../../assets/images/seoul-explorer/course-route.png";
import zoomOutIcon from "../../assets/images/seoul-explorer/zoom-out.png";
import unlockedIcon from "../../assets/images/seoul-explorer/unlocked-region.png";
import lockedIcon from "../../assets/images/seoul-explorer/locked-region.png";
import { SEOUL_DISTRICTS } from "../../utils/seoulDistricts";
import "./SeoulExplorer.css";

function dateLabel(value) {
  if (!value) return "기록 없음";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "기록 있음" : date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

export default function SeoulExplorer({ exploredRegions = [] }) {
  const [selectedCode, setSelectedCode] = useState(null);
  const [view, setView] = useState("map");
  const [filter, setFilter] = useState("all");
  const [zoom, setZoom] = useState(1);
  const [newlyUnlockedCodes, setNewlyUnlockedCodes] = useState([]);
  const [activeMapLabel, setActiveMapLabel] = useState(null);
  const records = useMemo(() => new Map(exploredRegions.map((item) => [item.district_code, item])), [exploredRegions]);
  const visitedCount = exploredRegions.filter((item) => item.visited).length;
  const selectedDistrict = SEOUL_DISTRICTS.find((district) => district.code === selectedCode) ?? null;
  const selectedRecord = selectedCode ? records.get(selectedCode) : null;
  const featureList = useMemo(() => geometry.features.slice().sort((a, b) => a.name.localeCompare(b.name, "ko")), []);
  const shownDistricts = SEOUL_DISTRICTS.filter(({ code }) => filter === "all" || (filter === "explored" && records.get(code)?.visited) || (filter === "planned" && records.has(code) && !records.get(code)?.visited) || (filter === "locked" && !records.has(code)));

  const showMapLabel = (event, district) => {
    const { x, y, width, height } = event.currentTarget.getBBox();
    setActiveMapLabel({ code: district.code, name: district.name, x: x + width / 2, y: y + height / 2 });
  };

  useEffect(() => {
    let clearTimer = 0;
    const animateUnlocks = (districts) => {
      const codes = (districts ?? []).map((district) => district.district_code).filter(Boolean);
      if (!codes.length) return;
      setNewlyUnlockedCodes(codes);
      window.clearTimeout(clearTimer);
      clearTimer = window.setTimeout(() => setNewlyUnlockedCodes([]), 1800);
    };
    let savedFlash = null;
    try {
      savedFlash = JSON.parse(sessionStorage.getItem("koala-region-unlock-flash") ?? "null");
      sessionStorage.removeItem("koala-region-unlock-flash");
    } catch { /* 지역 해제 애니메이션은 보조 표시 */ }
    if (savedFlash?.at && Date.now() - savedFlash.at < 15 * 60 * 1000) animateUnlocks(savedFlash.districts);
    const handleUnlock = (event) => animateUnlocks(event.detail);
    window.addEventListener("koala-region-unlocked", handleUnlock);
    return () => {
      window.removeEventListener("koala-region-unlocked", handleUnlock);
      window.clearTimeout(clearTimer);
    };
  }, []);

  return (
    <section className="seoul-explorer" aria-label="서울 약속 지도">
      <header className="seoul-explorer-heading">
        <div><span className="seoul-eyebrow">MY SEOUL</span><h3>서울 약속 지도</h3><p>코스 확정은 방문 계획, 안내 완료는 방문 기록으로 표시해요.</p></div>
        <span className="seoul-progress-count">{visitedCount}<small> / 25개 구 방문</small></span>
      </header>
      <div className="seoul-progress-track" role="progressbar" aria-label="방문 확인한 자치구" aria-valuenow={visitedCount} aria-valuemin={0} aria-valuemax={25}><span style={{ width: `${visitedCount / 25 * 100}%` }} /></div>
      <div className="seoul-explorer-toolbar" aria-label="지도 보기 설정">
        <div className="seoul-view-toggle">
          <button type="button" className={view === "map" ? "is-active" : ""} onClick={() => setView("map")} aria-pressed={view === "map"}><img src={mapIcon} alt="" />지도</button>
          <button type="button" className={view === "list" ? "is-active" : ""} onClick={() => setView("list")} aria-pressed={view === "list"}><img src={listIcon} alt="" />목록</button>
        </div>
        <span className="seoul-legend"><i className="is-unlocked" /> 방문 확인 <i className="is-planned" /> 계획 <i className="is-locked" /> 미선택</span>
      </div>
      {view === "map" ? (
        <div className="seoul-map-layout">
          <div className="seoul-map-canvas">
            <svg viewBox={geometry.viewBox} role="img" aria-label={`서울 자치구 지도, ${visitedCount}개 구 방문 확인`}>
              <g transform={`translate(${(1000 - 1000 * zoom) / 2} ${(810 - 810 * zoom) / 2}) scale(${zoom})`}>
                {featureList.map((district) => {
                  const unlocked = records.has(district.code);
                  const selected = selectedCode === district.code;
                  return <path key={district.code} d={district.path} fillRule="evenodd" className={`seoul-district-shape ${records.get(district.code)?.visited ? "is-unlocked" : unlocked ? "is-planned" : "is-locked"} ${selected ? "is-selected" : ""} ${newlyUnlockedCodes.includes(district.code) ? "is-newly-unlocked" : ""}`} tabIndex={0} role="button" aria-label={`${district.name}${records.get(district.code)?.visited ? ", 방문 확인" : unlocked ? ", 방문 계획" : ", 미선택"}`} aria-pressed={selected} onPointerEnter={(event) => showMapLabel(event, district)} onPointerLeave={() => { if (selectedCode !== district.code) setActiveMapLabel(null); }} onFocus={(event) => showMapLabel(event, district)} onBlur={() => { if (selectedCode !== district.code) setActiveMapLabel(null); }} onClick={(event) => { setSelectedCode(district.code); showMapLabel(event, district); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedCode(district.code); showMapLabel(event, district); } }} />;
                })}
                {activeMapLabel && (
                  <text
                    className="seoul-district-hover-label"
                    x={activeMapLabel.x}
                    y={activeMapLabel.y}
                    aria-hidden="true"
                  >
                    {activeMapLabel.name}
                  </text>
                )}
              </g>
            </svg>
            <div className="seoul-zoom-controls"><button type="button" aria-label="지도 확대" onClick={() => setZoom((value) => Math.min(1.8, +(value + 0.2).toFixed(1)))}><img src={zoomInIcon} alt="" /></button><button type="button" aria-label="지도 축소" onClick={() => setZoom((value) => Math.max(1, +(value - 0.2).toFixed(1)))}><img src={zoomOutIcon} alt="" /></button></div>
          </div>
          <RegionDetail district={selectedDistrict} record={selectedRecord} />
        </div>
      ) : (
        <div className="seoul-list-layout">
          <div className="seoul-filter-tabs" aria-label="지역 목록 필터">
            {[["all", "전체 25"], ["explored", `방문 ${visitedCount}`], ["planned", `계획 ${records.size - visitedCount}`], ["locked", `미선택 ${25 - records.size}`]].map(([key, label]) => <button type="button" key={key} className={filter === key ? "is-active" : ""} onClick={() => setFilter(key)} aria-pressed={filter === key}>{label}</button>)}
          </div>
          <div className="seoul-district-list">
            {shownDistricts.map((district) => {
              const record = records.get(district.code);
              return <button type="button" key={district.code} className="seoul-district-row" onClick={() => { setSelectedCode(district.code); setView("map"); }}><img src={record?.visited ? unlockedIcon : lockedIcon} alt="" /><span><b>{district.name}</b><small>{record ? `계획 ${record.course_count ?? 1}회 · 최근 ${dateLabel(record.last_used_at)}` : "아직 계획 전이에요"}</small></span><span className={record?.visited ? "seoul-status is-unlocked" : "seoul-status"}>{record?.visited ? "방문 확인" : record ? "방문 계획" : "미선택"}</span></button>;
            })}
          </div>
        </div>
      )}
      <p className="seoul-explorer-footnote"><img src={calendarIcon} alt="" /> 방문 기록은 코스 안내를 끝까지 진행하면 남아요. GPS가 느릴 때는 도착 버튼으로 직접 확인할 수 있어요.</p>
    </section>
  );
}

function RegionDetail({ district, record }) {
  if (!district) return <div className="seoul-region-detail is-empty"><img src={routeIcon} alt="" /><b>지도에서 지역을 선택해 보세요</b><span>각 구를 눌러 코스 기록을 확인할 수 있어요.</span></div>;
  return <div className={`seoul-region-detail ${record?.visited ? "is-unlocked" : "is-locked"}`}>
    <img className="seoul-region-detail-icon" src={record?.visited ? unlockedIcon : lockedIcon} alt="" />
    <span className="seoul-region-kicker">{record?.visited ? "방문 확인" : record ? "방문 계획" : "미선택 지역"}</span>
    <h4>{district.name}</h4>
    {record ? <><b className="seoul-region-course-count">계획한 코스 {record.course_count ?? 1}회 · 방문 확인 {record.visited_course_count ?? 0}회</b><span className="seoul-region-date">최근 계획 · {dateLabel(record.last_used_at)}</span>{record.place_names?.length > 0 && <div className="seoul-region-places"><b>코스에 담은 장소</b><p>{record.place_names.join(" · ")}</p></div>}</> : <><p>아직 선택하지 않은 지역이에요.</p><small>이 지역 장소를 포함한 코스를 확정하면 계획으로 표시돼요.</small></>}
  </div>;
}
