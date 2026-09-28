import { useRef, useState } from "react";

const MIN_SIDEBAR_WIDTH = 340;
const MAX_VIEWPORT_RATIO = 0.58;
const SHEET_DRAG_THRESHOLD = 24;

/** 지도 결과 화면의 사이드바 크기 조절과 모바일 시트 제스처를 관리한다. */
export function useRecommendationPanelInteractions({
  sheetExpanded,
  sheetMinimized,
  placeMode,
  setSheetExpanded,
  setSheetMinimized,
}) {
  const [sidebarWidth, setSidebarWidth] = useState(
    () => Number(localStorage.getItem("koala-sidebar-width")) || 390,
  );
  const dividerDragRef = useRef(false);
  const dragStartY = useRef(null);
  const didDrag = useRef(false);

  const handleDividerPointerDown = (event) => {
    if (window.innerWidth < 900) return;
    dividerDragRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleDividerPointerMove = (event) => {
    if (!dividerDragRef.current) return;
    setSidebarWidth(Math.round(Math.max(
      MIN_SIDEBAR_WIDTH,
      Math.min(window.innerWidth * MAX_VIEWPORT_RATIO, event.clientX),
    )));
  };

  const handleDividerPointerUp = (event) => {
    if (!dividerDragRef.current) return;
    dividerDragRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    localStorage.setItem("koala-sidebar-width", String(sidebarWidth));
    window.dispatchEvent(new Event("resize"));
  };

  const handleSheetPointerDown = (event) => {
    dragStartY.current = event.clientY;
    didDrag.current = false;
    // 손잡이 밖으로 이동해도 제스처가 끊기지 않도록 포인터를 고정한다.
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleSheetPointerMove = (event) => {
    if (dragStartY.current !== null && Math.abs(event.clientY - dragStartY.current) > 10) {
      didDrag.current = true;
    }
  };

  const handleSheetPointerUp = (event) => {
    if (dragStartY.current === null) return;
    const distance = event.clientY - dragStartY.current;
    if (distance < -SHEET_DRAG_THRESHOLD) {
      if (sheetMinimized) setSheetMinimized(false);
      else setSheetExpanded(true);
    } else if (distance > SHEET_DRAG_THRESHOLD) {
      if (sheetExpanded) setSheetExpanded(false);
      else if (!placeMode) setSheetMinimized(true);
    }
    dragStartY.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const handleSheetPointerCancel = (event) => {
    dragStartY.current = null;
    didDrag.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  return {
    sidebarWidth,
    didDrag,
    handleDividerPointerDown,
    handleDividerPointerMove,
    handleDividerPointerUp,
    handleSheetPointerDown,
    handleSheetPointerMove,
    handleSheetPointerUp,
    handleSheetPointerCancel,
  };
}
