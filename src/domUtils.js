// domUtils.js

/** DOM 요소를 가져오거나 간단한 UI 업데이트를 수행합니다. */

export const jsonInputField = document.getElementById('json-input');
export const saveFeedback = document.getElementById('save-message');
export const errorOutput = document.getElementById('json-error');
export const treeViewContainer = document.getElementById('tree-view');
export const tableViewContainer = document.getElementById('table-view');

/** 지정된 요소에 임시 메시지를 표시합니다. */
export function showTemporaryMessage(element, message, duration) {
    if (element) { // 요소가 존재하는지 확인
        element.textContent = message;
        setTimeout(() => { element.textContent = ''; }, duration);
    }
}

/** 테이블 뷰 상단에 현재 데이터 경로를 표시합니다. */
export function updateTableViewPathDisplay(dataPathString, onPathSegmentClickCallback) {
    const headers = document.querySelectorAll('h2');
    let titleElement = null;
    headers.forEach(h => { if (h.textContent && h.textContent.includes('데이터 테이블 뷰')) titleElement = h; }); //

    if (!titleElement) {
        // console.warn('데이터 테이블 뷰 H2 제목 요소를 찾을 수 없습니다.'); // H2를 찾지 못한 경우를 위한 경고
        return;
    }

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

    pathSpan.appendChild(document.createTextNode(prefixText));

    // 항상 "root"를 먼저 표시하고 클릭 가능하게 만듭니다.
    if (onPathSegmentClickCallback) {
        const rootLink = document.createElement('a');
        rootLink.href = '#';
        rootLink.textContent = 'root';
        rootLink.style.textDecoration = 'underline';
        rootLink.style.cursor = 'pointer';
        rootLink.onclick = (e) => {
            e.preventDefault();
            onPathSegmentClickCallback(''); // root 경로는 빈 문자열입니다.
        };
        pathSpan.appendChild(rootLink);
    } else {
        pathSpan.appendChild(document.createTextNode('root'));
    }

    // dataPathString이 존재하고 비어있지 않다면, 이어서 경로 세그먼트들을 처리합니다.
    if (dataPathString && dataPathString !== '') { //
        let currentCumulativePathForSegments = ""; // dataPathString 시작부터의 누적 경로
        // 정규식은 점으로 구분된 키 또는 대괄호로 묶인 인덱스를 찾습니다.
        // 예: "obj.arr[0].key" -> "obj", "arr", "[0]", "key"
        const pathSegmentRegex = /([^[.]+)|(\[[^\]]+\])/g; //
        let match;

        while ((match = pathSegmentRegex.exec(dataPathString)) !== null) { //
            const segment = match[0]; // 현재 세그먼트 (예: "obj", "arr", "[0]", "key")
            let displaySegment = segment; // 화면에 표시될 세그먼트 이름

            // 누적 경로 업데이트
            if (currentCumulativePathForSegments === "") {
                currentCumulativePathForSegments = segment;
            } else {
                if (segment.startsWith('[')) { // 배열 인덱스인 경우 (예: "[0]") //
                    currentCumulativePathForSegments += segment;
                } else { // 객체 키인 경우 (예: "arr" 또는 "key") //
                    currentCumulativePathForSegments += '.' + segment;
                }
            }

            // 현재 세그먼트 앞에 구분자 " > " 추가
            pathSpan.appendChild(document.createTextNode(' > ')); //

            // 현재 세그먼트에 대한 링크 생성 및 추가
            if (onPathSegmentClickCallback) {
                const link = document.createElement('a');
                link.href = '#';
                link.textContent = displaySegment;
                link.style.textDecoration = 'underline';
                link.style.cursor = 'pointer';
                // 클로저를 사용하여 각 링크가 올바른 경로를 가지도록 합니다.
                link.onclick = ((pathForCallback) => (e) => {
                    e.preventDefault();
                    onPathSegmentClickCallback(pathForCallback);
                })(currentCumulativePathForSegments);
                pathSpan.appendChild(link);
            } else {
                pathSpan.appendChild(document.createTextNode(displaySegment));
            }
        }
    }
    pathSpan.appendChild(document.createTextNode(suffixText));
}

/** 모든 UI 요소를 초기 상태로 리셋합니다 (트리, 테이블, 메시지 등). */
export function resetBaseUI() {
    if (treeViewContainer) treeViewContainer.innerHTML = ''; //
    if (tableViewContainer) tableViewContainer.innerHTML = ''; // Handsontable 컨테이너도 비움 //
    if (errorOutput) errorOutput.textContent = ''; //
    if (saveFeedback) saveFeedback.textContent = ''; //
    updateTableViewPathDisplay(null, null); // 경로 표시도 초기화 (콜백 없이)
}