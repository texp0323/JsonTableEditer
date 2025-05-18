let tableViewHistory = [];
let currentHistoryIndex = -1;
const MAX_HISTORY_SIZE = 30;
let isNavigatingHistoryFlag = false;

export function clearHistory() {
    tableViewHistory = [];
    currentHistoryIndex = -1;
    isNavigatingHistoryFlag = false;
}

export function addStateToHistory(newStateParams) {
    if (isNavigatingHistoryFlag) {
        return;
    }

    const { dataPathString, dataKeyName } = newStateParams;

    const currentTopState = tableViewHistory[currentHistoryIndex];
    if (currentTopState && currentTopState.dataPathString === dataPathString && currentTopState.dataKeyName === dataKeyName) {
        return;
    }

    if (currentHistoryIndex < tableViewHistory.length - 1) {
        tableViewHistory = tableViewHistory.slice(0, currentHistoryIndex + 1);
    }

    tableViewHistory.push({ dataPathString, dataKeyName });
    currentHistoryIndex = tableViewHistory.length - 1;

    if (tableViewHistory.length > MAX_HISTORY_SIZE) {
        tableViewHistory.shift();
        currentHistoryIndex--;
    }
}

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

export function setNavigationInProgress(flag) {
    isNavigatingHistoryFlag = flag;
}

export function isNavigationInProgress() {
    return isNavigatingHistoryFlag;
}