import AdventurePanel from "./AdventurePanel";
import AreaCard from "./AreaCard";

/** 추천 지역 목록과 색다른 코스 시작 선택지를 보여준다. */
export default function RegionRecommendationList({
  targetArea,
  selectedArea,
  areas,
  recommendationContext,
  origin,
  initialAdventureMode,
  selectedIndex,
  displayArea,
  onPreviewArea,
  onSelectArea,
  onUseAdventurePlaces,
  onUseAdventureArea,
}) {
  return (
    <>
      <div className="ranking-heading">
        <div>
          <h2>{targetArea ? "요청한 지역 코스" : "지금 가기 좋은 지역"}</h2>
          <p>지역을 누르면 실제 장소를 선택할 수 있어요</p>
          {origin?.label && (
            <p className="recommendation-origin" aria-label="추천 계산 출발지">
              출발 기준: {origin.label}
            </p>
          )}
        </div>
        <AdventurePanel
          area={selectedArea}
          areas={areas}
          recommendationContext={recommendationContext}
          initialMode={initialAdventureMode}
          onUsePlaces={onUseAdventurePlaces}
          onUseArea={onUseAdventureArea}
        />
        <span>{areas.length}곳</span>
      </div>
      <div className="ranking-scroll">
        {areas.map((area, index) => (
          <AreaCard
            key={`${area.name}-${index}`}
            area={{ ...displayArea(area), rank: index + 1 }}
            selected={selectedIndex === index}
            onPreview={() => onPreviewArea(area)}
            onSelect={() => onSelectArea(area, index)}
          />
        ))}
      </div>
    </>
  );
}
