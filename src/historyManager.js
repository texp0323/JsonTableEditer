// historyManager.js

let tableViewHistory = [];
let currentHistoryIndex = -1;
const MAX_HISTORY_SIZE = 30; // 최대 저장할 방문 기록 개수
let isNavigatingHistoryFlag = false; // 히스토리 탐색 중 플래그

/** 히스토리를 초기화합니다. */
export function clearHistory() {
    tableViewHistory = [];
    currentHistoryIndex = -1;
    isNavigatingHistoryFlag = false;
}

/**
 * 새로운 상태를 히스토리에 추가합니다.
 * @param {object} newState - { data, dataKeyName, rootJsonData, dataPathString } 형태의 객체
 */
export function addStateToHistory(newState) {
    // 히스토리 버튼을 통해 탐색 중일 때는 새 히스토리를 추가하지 않습니다.
    if (isNavigatingHistoryFlag) {
        return;
    }

    // 현재 인덱스가 히스토리의 마지막이 아니라면 (뒤로 갔다가 새 경로로 이동 시)
    // 현재 인덱스 이후의 히스토리는 잘라냅니다.
    if (currentHistoryIndex < tableViewHistory.length - 1) {
        tableViewHistory = tableViewHistory.slice(0, currentHistoryIndex + 1);
    }

    tableViewHistory.push(newState);
    currentHistoryIndex = tableViewHistory.length - 1;

    // 최대 히스토리 크기 제한
    if (tableViewHistory.length > MAX_HISTORY_SIZE) {
        tableViewHistory.shift(); // 가장 오래된 항목 제거
        currentHistoryIndex--;    // 인덱스 조정
    }
}

/**
 * 지정된 방향으로 히스토리 탐색을 시도하고, 해당 상태를 반환합니다.
 * @param {'back' | 'forward'} direction - 탐색 방향
 * @returns {object | null} 복원할 상태 객체 또는 탐색 불가능 시 null
 */
export function getNavigationState(direction) {
    let canNavigate = false;
    let newIndex = currentHistoryIndex;

    if (direction === 'back' && currentHistoryIndex > 0) {
        newIndex--;
        canNavigate = true;
    } else if (direction === 'forward' && currentHistoryIndex < tableViewHistory.length - 1) {
        newIndex++;
        canNavigate = true;
    }

    if (canNavigate) {
        currentHistoryIndex = newIndex;
        return tableViewHistory[currentHistoryIndex];
    }
    return null;
}

/** 히스토리 탐색 중 플래그를 설정합니다. */
export function setNavigationInProgress(flag) {
    isNavigatingHistoryFlag = flag;
}

/** 현재 히스토리 탐색 중인지 여부를 반환합니다. (외부에서 필요시 사용) */
export function isNavigationInProgress() {
    return isNavigatingHistoryFlag;
}