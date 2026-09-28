// Route geometry and transit labels shared by the guidance UI.
import { formatCalculatedMinutes } from "./recommendationFormatting";

export function formatLegTransport(travel) {
  if (!travel) return "이동 경로 확인 중";
  if (travel.nearby) return "아주 가까운 거리 · 약 1분";
  const duration = formatCalculatedMinutes(travel.duration_min);
  if (travel.mode === "walk") return `도보 ${duration}`;
  if (travel.mode === "car") return `자동차 ${duration}`;
  const type =
    travel.route_type === "SUBWAY"
      ? "지하철"
      : travel.route_type === "BUS"
        ? "버스"
        : travel.route_type === "BUS_AND_SUBWAY"
          ? "버스·지하철"
          : "대중교통";
  const vehicles = [
    ...new Set(
      (travel.paths ?? [])
        .filter(
          (path) =>
            (path.type === "BUS" || path.type === "SUBWAY") && path.vehicle,
        )
        .map((path) => path.vehicle),
    ),
  ];
  const routeName = vehicles.length ? vehicles.join(" · ") : type;
  const transfer = travel.transfers > 0 ? ` · 환승 ${travel.transfers}회` : "";
  return `${routeName} · ${duration}${transfer}`;
}

export function transitBoardingDetails(travel) {
  if (!travel?.paths?.length) return [];
  const seen = new Set();
  return travel.paths.flatMap((path) => {
    if (path.type !== "BUS" && path.type !== "SUBWAY") return [];
    const rawVehicle = String(path.vehicle ?? "").trim();
    const vehicle =
      path.type === "BUS"
        ? rawVehicle && !/(버스|번)$/.test(rawVehicle)
          ? `${rawVehicle}번 버스`
          : rawVehicle || "버스"
        : rawVehicle && !/호선$/.test(rawVehicle)
          ? `${rawVehicle}호선`
          : rawVehicle || "지하철";
    const key = `${path.type}:${vehicle}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const seconds = Number(path.time);
    return [
      {
        type: path.type,
        vehicle,
        minutes:
          Number.isFinite(seconds) && seconds > 0
            ? Math.max(1, Math.round(seconds / 60))
            : null,
      },
    ];
  });
}

export function routePoints(route) {
  return (route?.paths ?? []).flatMap((path) => {
    let points = path.points;
    if (typeof points === "string") {
      try {
        points = JSON.parse(points);
      } catch {
        return [];
      }
    }
    if (!Array.isArray(points)) points = points?.coordinates ?? points?.points;
    if (!Array.isArray(points)) return [];
    return points
      .map((point) =>
        Array.isArray(point)
          ? { longitude: Number(point[0]), latitude: Number(point[1]) }
          : {
              longitude: Number(point?.x ?? point?.longitude),
              latitude: Number(point?.y ?? point?.latitude),
            },
      )
      .filter(
        (point) =>
          Number.isFinite(point.latitude) && Number.isFinite(point.longitude),
      );
  });
}

export function distanceToRouteMeters(location, route) {
  const points = routePoints(route);
  if (!location || points.length < 2) return Infinity;
  const latitudeScale = 111000;
  const longitudeScale =
    111000 * Math.cos((Number(location.latitude) * Math.PI) / 180);
  let minimum = Infinity;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const ax = (start.longitude - location.longitude) * longitudeScale;
    const ay = (start.latitude - location.latitude) * latitudeScale;
    const bx = (end.longitude - location.longitude) * longitudeScale;
    const by = (end.latitude - location.latitude) * latitudeScale;
    const dx = bx - ax;
    const dy = by - ay;
    const ratio = Math.max(
      0,
      Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)),
    );
    minimum = Math.min(minimum, Math.hypot(ax + ratio * dx, ay + ratio * dy));
  }
  return minimum;
}

export function nextRouteInstruction(route, travel, boarding) {
  const instructions = [...(route?.paths ?? []), ...(travel?.paths ?? [])]
    .map((path) => path.guidance)
    .filter(Boolean);
  const instruction =
    instructions.find(
      (value) => !/^(출발지|도착지|출발|도착)$/.test(String(value).trim()),
    ) ?? instructions[0];
  if (instruction) return instruction;
  if (boarding.length) return `${boarding[0].vehicle}에 탑승하세요`;
  if (travel?.mode === "car") return "표시된 자동차 경로를 따라 이동하세요";
  return "파란 점선을 따라 이동하세요";
}
