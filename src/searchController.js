// searchController.js

/**
 * 주어진 경로 문자열로부터 부모 경로를 추출합니다.
 * @param {string} childPath - 자식 아이템의 전체 경로 문자열
 * @returns {string} 부모 경로 문자열. 루트 레벨이거나 경로가 없으면 빈 문자열.
 */
function getParentPath(childPath) {
    if (!childPath) return '';
    const lastDot = childPath.lastIndexOf('.');
    const lastBracket = childPath.lastIndexOf('[');
    if (lastDot === -1 && lastBracket === -1) return ''; // 루트 키/인덱스인 경우
    if (lastDot > lastBracket) return childPath.substring(0, lastDot);
    if (lastBracket > -1) return childPath.substring(0, lastBracket);
    return ''; // 유효한 경로가 아니거나 예상치 못한 경우
}

/**
 * JSON 데이터를 재귀적으로 검색합니다.
 * @param {string} query - 소문자로 변환된 검색어
 * @param {'key'|'value'|'both'} searchScope - 검색 범위 (키, 값, 또는 둘 다)
 * @param {any} currentJsonData - 검색 대상이 되는 현재 JSON 데이터
 * @returns {Array<object>} 검색 결과 객체의 배열. 각 객체는 displayText와 actionParams를 포함.
 */
export function performSearch(query, searchScope, currentJsonData) {
    const results = [];
    if (!currentJsonData || !query || query.trim() === "") { // currentJsonData와 query 유효성 검사 강화
        return results;
    }

    function recurse(valueBeingInspected, pathLabelToValue, actualParentObj, keyOfValueInParent) {
        if (results.length >= 50) return; // 검색 결과 수 제한

        // 1. 원시 값(Primitive Value) 일치 확인
        if (typeof valueBeingInspected !== 'object' || valueBeingInspected === null) {
            if (searchScope === 'value' || searchScope === 'both') {
                if (String(valueBeingInspected).toLowerCase().includes(query)) {
                    let tableData, tableKey, tablePathString;
                    if (actualParentObj) { // 원시 값이 객체/배열의 일부인 경우
                        tableData = actualParentObj;
                        tableKey = keyOfValueInParent;
                        tablePathString = getParentPath(pathLabelToValue);
                    } else { // 원시 값이 최상위 루트 데이터 자체인 경우
                        tableData = valueBeingInspected;
                        tableKey = 'Value'; // 루트 원시 값 표시를 위한 기본 키
                        tablePathString = '';
                    }
                    results.push({
                        displayText: `[Value] <b>${String(valueBeingInspected).substring(0, 50)}</b> (<i>${(pathLabelToValue || 'root').replaceAll(".", " > ")}</i>)`,
                        actionParams: { data: tableData, dataKeyName: tableKey, rootJsonData: currentJsonData, dataPathString: tablePathString }
                    });
                }
            }
            return; // 원시 값이면 더 이상 재귀하지 않음
        }

        // 2. 배열 순회
        if (Array.isArray(valueBeingInspected)) {
            for (let i = 0; i < valueBeingInspected.length; i++) {
                if (results.length >= 50) break;
                const item = valueBeingInspected[i];
                const itemPath = `${pathLabelToValue}[${i}]`;
                recurse(item, itemPath, valueBeingInspected, String(i)); // 부모는 현재 배열, 키는 인덱스
            }
        }
        // 3. 객체 순회
        else {
            const objectKeys = Object.keys(valueBeingInspected);
            for (const key of objectKeys) {
                if (results.length >= 50) break;
                const nestedValue = valueBeingInspected[key];
                // 루트 객체의 키인 경우 pathLabelToValue가 비어있으므로, 이를 고려하여 경로 생성
                const nestedValuePath = pathLabelToValue ? `${pathLabelToValue}.${key}` : key;

                // 3a. 키(Key) 일치 확인
                if (searchScope === 'key' || searchScope === 'both') {
                    if (String(key).toLowerCase().includes(query)) {
                        results.push({
                            displayText: `[Key] <b>${key}</b> (in <i>${(pathLabelToValue || 'root object').replaceAll(".", " > ")}</i>)`,
                            actionParams: { data: valueBeingInspected, dataKeyName: key, rootJsonData: currentJsonData, dataPathString: pathLabelToValue }
                        });
                    }
                }
                // 3b. 중첩된 값에 대해 재귀 호출
                recurse(nestedValue, nestedValuePath, valueBeingInspected, key); // 부모는 현재 객체, 키는 현재 키
            }
        }
    }

    recurse(currentJsonData, '', null, null); // 루트에서 검색 시작 (초기 pathLabelToValue는 빈 문자열)
    return results;
}

/**
 * 검색 결과를 드롭다운 UI에 표시합니다.
 * @param {Array<object>} results - performSearch에서 반환된 결과 배열
 * @param {HTMLElement} dropdownElement - 검색 결과를 표시할 드롭다운 DOM 요소
 * @param {string} currentSearchQuery - 현재 입력된 검색어 (결과 없음 메시지 표시에 사용)
 * @param {function} onResultClickCallback - 검색 결과 항목 클릭 시 호출될 콜백 함수 (actionParams를 인자로 받음)
 */
export function populateSearchResultsDropdown(results, dropdownElement, currentSearchQuery, onResultClickCallback) {
    dropdownElement.innerHTML = ''; // 이전 결과 지우기
    if (results.length === 0 && currentSearchQuery.trim() !== '') {
        const noResultsDiv = document.createElement('div');
        noResultsDiv.className = 'search-no-results';
        noResultsDiv.textContent = 'No results found.';
        dropdownElement.appendChild(noResultsDiv);
    } else {
        results.forEach(result => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'search-result-item';
            itemDiv.innerHTML = result.displayText; // HTML 태그(<b>, <i>) 사용을 위해 innerHTML 사용
            if (result.noAction) { // 'Load JSON data first' 같은 메시지용
                itemDiv.style.cursor = 'default';
            } else {
                itemDiv.addEventListener('click', () => onResultClickCallback(result.actionParams));
            }
            dropdownElement.appendChild(itemDiv);
        });
    }
    // 검색어나 결과 유무에 따라 드롭다운 표시/숨김
    dropdownElement.style.display = (results.length > 0 || (currentSearchQuery.trim() !== '' && results.length === 0)) ? 'block' : 'none';
}