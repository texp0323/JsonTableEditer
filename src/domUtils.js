// domUtils.js

/** DOM 요소를 가져오거나 간단한 UI 업데이트를 수행합니다. */

export const jsonInputField = document.getElementById('json-input');
export const saveFeedback = document.getElementById('save-message');
export const errorOutput = document.getElementById('json-error');
export const treeViewContainer = document.getElementById('tree-view');
export const tableViewContainer = document.getElementById('table-view');

/** 지정된 요소에 임시 메시지를 표시합니다. */
export function showTemporaryMessage(element, message, duration) {
    element.textContent = message;
    setTimeout(() => { element.textContent = ''; }, duration);
}

/** 테이블 뷰 상단에 현재 데이터 경로를 표시합니다. */
export function updateTableViewPathDisplay(dataPathString, onPathSegmentClickCallback) {
    const headers = document.querySelectorAll('h2');
    let titleElement = null;
    headers.forEach(h => { if (h.textContent.includes('데이터 테이블 뷰')) titleElement = h; });

    if (!titleElement) { /* ... error handling or create if not exists ... */ return; }

    let pathSpan = document.getElementById('table-view-current-path-display');
    if (!pathSpan) {
        pathSpan = document.createElement('span');
        pathSpan.id = 'table-view-current-path-display';
        pathSpan.style.marginLeft = '10px';
        pathSpan.style.fontSize = '0.8em';
        pathSpan.style.fontWeight = 'normal';
        titleElement.appendChild(pathSpan);
    }
    pathSpan.innerHTML = ''; // Clear previous path

    const prefixText = '(현재 경로: ';
    const suffixText = ')';

    if (dataPathString === null || dataPathString === undefined) {
        // pathSpan.textContent = ''; // No path to display
        return;
    }

    pathSpan.appendChild(document.createTextNode(prefixText));

    if (dataPathString === '') {
        if (onPathSegmentClickCallback) {
            const link = document.createElement('a');
            link.href = '#';
            link.textContent = 'root';
            link.style.textDecoration = 'underline';
            link.style.cursor = 'pointer';
            link.onclick = (e) => {
                e.preventDefault();
                onPathSegmentClickCallback('');
            };
            pathSpan.appendChild(link);
        } else {
            pathSpan.appendChild(document.createTextNode('root'));
        }
    } else {
        // Split path carefully: "root.obj.arr[0].key" -> "root", "obj", "arr", "[0]", "key"
        const segments = [];
        let currentCumulativePath = "";
        // This regex tries to capture parts between dots, or bracketed parts.
        const pathSegmentRegex = /([^[.]+)|(\[[^\]]+\])/g;
        let match;
        let firstSegment = true;

        while ((match = pathSegmentRegex.exec(dataPathString)) !== null) {
            const segment = match[0];
            let displaySegment = segment;
            let pathToThisSegment;

            if (firstSegment) {
                currentCumulativePath = segment;
                firstSegment = false;
            } else {
                if (segment.startsWith('[')) { // Array index
                    currentCumulativePath += segment;
                } else { // Object key
                    currentCumulativePath += '.' + segment;
                    pathSpan.appendChild(document.createTextNode(' > ')); // Add dot separator
                }
            }
            pathToThisSegment = currentCumulativePath;

            if (segment.startsWith('[') && segment.endsWith(']')) {
                displaySegment = segment; // Keep brackets for display of index segment link itself
            }

            if (onPathSegmentClickCallback) {
                const link = document.createElement('a');
                link.href = '#';
                link.textContent = displaySegment;
                link.style.textDecoration = 'underline';
                link.style.cursor = 'pointer';
                link.onclick = (e) => {
                    e.preventDefault();
                    onPathSegmentClickCallback(pathToThisSegment);
                };
                pathSpan.appendChild(link);
            } else {
                pathSpan.appendChild(document.createTextNode(displaySegment));
            }
        }
    }
    pathSpan.appendChild(document.createTextNode(suffixText));
}

/** 모든 UI 요소를 초기 상태로 리셋합니다 (트리, 테이블, 메시지 등). */
export function resetBaseUI() { // hotInstance 파괴는 tableView 모듈에서 하거나 app.js에서 직접 처리
    treeViewContainer.innerHTML = '';
    tableViewContainer.innerHTML = ''; // Handsontable 컨테이너도 비움
    if (errorOutput) errorOutput.textContent = '';
    if (saveFeedback) saveFeedback.textContent = '';
    updateTableViewPathDisplay(null);
}