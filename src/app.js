// app.js
import { minifyJson, prettyJson } from './jsonUtils.js';
import { showJsonDiffPopup } from './customPopup.js';
import {
    jsonInputField, saveFeedback, errorOutput, treeViewContainer, tableViewContainer,
    showTemporaryMessage, updateTableViewPathDisplay, resetBaseUI
} from './domUtils.js';
import { getObjectByPath, convertToTypedValue } from './dataUtils.js';
import {
    buildTree, selectNode, getSelectedNodePath, getExpandedNodePaths, expandNodesByPath
} from './treeView.js';
import { applyValueStyleToNode } from './treeViewStyleUtils.js';
import {
    displayDataWithHandsontable as displayTableInHot, destroyHotInstance
} from './tableViewHandsontable.js';

// 분리된 모듈 import
import * as historyManager from './historyManager.js';
import * as searchController from './searchController.js';

let currentJsonData = null;
let originalJsonDataAtLoad = null;

// 검색 UI 요소 참조
let searchInput;
let searchTargetSelect;
let searchResultsDropdown;

/** 애플리케이션의 주요 이벤트 리스너를 설정합니다. */
function initialLoad() {
    document.getElementById("loadBtn").addEventListener("click", loadJson);
    document.getElementById("saveBtn").addEventListener('click', saveJson);
    document.getElementById("minifyBtn").addEventListener("click", () => {
        if(jsonInputField && jsonInputField.value) jsonInputField.value = minifyJson(jsonInputField.value);
        else if(jsonInputField) jsonInputField.value = "";
    });
    document.getElementById("uglifyBtn").addEventListener("click", () => {
        if(jsonInputField && jsonInputField.value) jsonInputField.value = prettyJson(jsonInputField.value);
        else if(jsonInputField) jsonInputField.value = "";
    });
    document.getElementById("diffBtn").addEventListener('click', () => {
        if (!originalJsonDataAtLoad && !currentJsonData) {
            if(typeof Swal !== 'undefined') Swal.fire('알림', '먼저 JSON 데이터를 로드해주세요.', 'info'); return;
        }
        if (!originalJsonDataAtLoad) {
            // currentJsonData는 있는데 originalJsonDataAtLoad만 없는 경우는 현재 상태를 원본으로 간주할 수도 있음
            if(typeof Swal !== 'undefined') Swal.fire('알림', '로드 시점의 원본 JSON 데이터가 없습니다. 변경사항을 비교할 수 없습니다.', 'info'); return;
        }
        const dataForDiffRight = currentJsonData === null ? {} : currentJsonData; // 현재 데이터가 null이면 빈 객체로 비교
        showJsonDiffPopup({
            title: 'JSON 데이터 변경사항',
            jsonDiffData: { left: originalJsonDataAtLoad, right: dataForDiffRight },
            buttons: [{ text: '닫기', role: 'confirm' }]
        }).catch(error => {
            console.error('showJsonDiffPopup 실행 중 오류:', error);
            if(typeof Swal !== 'undefined') Swal.fire('오류', '변경점 확인 중 오류가 발생했습니다.', 'error');
        });
    });

    searchInput = document.getElementById('searchInput');
    searchTargetSelect = document.getElementById('searchTargetSelect');
    searchResultsDropdown = document.getElementById('searchResultsDropdown');

    if (searchInput) searchInput.addEventListener('input', handleSearchInput);
    if (searchTargetSelect) searchTargetSelect.addEventListener('change', handleSearchInput);

    document.addEventListener('click', (event) => {
        if (searchResultsDropdown && searchInput &&
            !searchInput.contains(event.target) &&
            !searchResultsDropdown.contains(event.target)) {
            searchResultsDropdown.style.display = 'none';
        }
    });
    if(searchResultsDropdown) {
        searchResultsDropdown.addEventListener('click', (event) => {
            event.stopPropagation();
        });
    }

    window.addEventListener('mousedown', (event) => {
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
            // Allow default mouse button behavior (e.g., context menu) in input fields
            if (event.button === 3 || event.button === 4) {
                // But still prevent browser back/forward for mouse 4/5 if we want custom handling universally
                // For now, let's allow default for input fields entirely if specific mouse buttons aren't for our nav.
            } else {
                return;
            }
        }
        if (event.button === 3) {
            event.preventDefault();
            navigateHistory('back');
        } else if (event.button === 4) {
            event.preventDefault();
            navigateHistory('forward');
        }
    });
}

/** 검색 입력 및 범위 변경을 처리합니다. */
function handleSearchInput() {
    if (!searchInput || !searchTargetSelect || !searchResultsDropdown) return;

    const query = searchInput.value.trim().toLowerCase();
    const searchScope = searchTargetSelect.value;

    if (!query) {
        searchResultsDropdown.innerHTML = '';
        searchResultsDropdown.style.display = 'none';
        return;
    }
    if (currentJsonData === null || currentJsonData === undefined) { // currentJsonData 유효성 검사
        searchController.populateSearchResultsDropdown(
            [{ displayText: "JSON 데이터를 먼저 로드해주세요.", noAction: true }],
            searchResultsDropdown,
            query,
            handleSearchResultClick
        );
        return;
    }

    const results = searchController.performSearch(query, searchScope, currentJsonData);
    searchController.populateSearchResultsDropdown(results, searchResultsDropdown, query, handleSearchResultClick);
}

/** 검색 결과 항목 클릭을 처리합니다. */
function handleSearchResultClick(params) {
    if (params && typeof displayDataInTable === 'function') {
        displayDataInTable(params.data, params.dataKeyName, params.rootJsonData, params.dataPathString);
        if (searchResultsDropdown) searchResultsDropdown.style.display = 'none';
    }
}

/** 입력된 JSON 문자열을 파싱하고 UI를 업데이트합니다. */
function loadJson() {
    resetUI();
    historyManager.clearHistory();
    try {
        const jsonString = jsonInputField.value.trim();
        if (!jsonString) {
            currentJsonData = null;
            originalJsonDataAtLoad = null;
            updateTableViewPathDisplay(null, handlePathSegmentClicked);
            destroyHotInstance();
            return;
        }
        currentJsonData = JSON.parse(jsonString);
        originalJsonDataAtLoad = JSON.parse(JSON.stringify(currentJsonData)); // 원본 데이터 스냅샷

        const configForTree = buildTreeConfigObj();
        if (treeViewContainer) treeViewContainer.innerHTML = ''; // buildTree 전에 명시적으로 비우기

        if (typeof currentJsonData === 'object' && currentJsonData !== null) { // 배열 포함
            buildTree(currentJsonData, treeViewContainer, '', currentJsonData, 0, configForTree);
        } else { // 루트가 원시값이거나 null인 경우
            const tempRootKey = 'value';
            const tempData = { [tempRootKey]: currentJsonData };
            buildTree(tempData, treeViewContainer, '', tempData, 0, configForTree);
        }

        destroyHotInstance();
        updateTableViewPathDisplay(null, handlePathSegmentClicked);
    } catch (e) {
        if(errorOutput) errorOutput.textContent = 'JSON 파싱 오류: ' + e.message;
        currentJsonData = null;
        originalJsonDataAtLoad = null;
        if(treeViewContainer) treeViewContainer.innerHTML = '';
        destroyHotInstance();
        updateTableViewPathDisplay(null, handlePathSegmentClicked);
    }
}

/** 현재 편집된 JSON 데이터를 상단 텍스트 영역에 저장(표시)합니다. */
function saveJson() {
    if(errorOutput) errorOutput.textContent = '';
    if (currentJsonData !== null && currentJsonData !== undefined) {
        try {
            const jsonString = JSON.stringify(currentJsonData, null, 2);
            if(jsonInputField) jsonInputField.value = jsonString;
            if(saveFeedback) showTemporaryMessage(saveFeedback, 'JSON이 텍스트 영역에 저장되었습니다!', 3000);
        } catch (e) {
            if(errorOutput) errorOutput.textContent = 'JSON 문자열 변환 오류: ' + e.message;
            if(saveFeedback) saveFeedback.textContent = '';
        }
    } else {
        if(jsonInputField) jsonInputField.value = '';
        if(saveFeedback) showTemporaryMessage(saveFeedback, '저장할 JSON 데이터가 없습니다.', 3000);
    }
}

/** UI를 초기 상태로 리셋합니다. */
function resetUI() {
    resetBaseUI();
    destroyHotInstance();
    currentJsonData = null;
    originalJsonDataAtLoad = null;
    selectNode(null);
    if (searchResultsDropdown) {
        searchResultsDropdown.innerHTML = '';
        searchResultsDropdown.style.display = 'none';
    }
    if(searchInput) searchInput.value = '';
    if(treeViewContainer) treeViewContainer.innerHTML = '';
    updateTableViewPathDisplay(null, handlePathSegmentClicked);
}

/** 실제 JSON 데이터 모델을 업데이트하고, 필요한 경우 트리 뷰를 새로고침합니다. */
function updateJsonData(pathString, newValueString, isBatchOperation = false) {
    if (currentJsonData === null || currentJsonData === undefined) {
        console.error("데이터 업데이트 오류: currentJsonData가 없습니다.");
        return;
    }

    const keys = pathString.replace(/\[(\d+)\]/g, '.$1').split('.');
    const lastKeyOrIndexString = keys.pop();
    const parentPath = keys.join('.');

    let parentObject;
    if (parentPath === "") { // 변경 대상이 루트 레벨의 키 또는 루트 자체(원시값일 경우)
        parentObject = currentJsonData;
    } else {
        parentObject = getObjectByPath(currentJsonData, parentPath);
    }

    // 루트 자체가 업데이트 되는 경우 (원시 값일 때)
    if (parentPath === "" && pathString === lastKeyOrIndexString && (typeof currentJsonData !== 'object' || currentJsonData === null)) {
        currentJsonData = convertToTypedValue(newValueString, currentJsonData);
        if (isBatchOperation) return;
        refreshTreeView(pathString);
        // 테이블 뷰도 루트 값으로 업데이트 (displayDataInTable 호출 필요)
        displayDataInTable(currentJsonData, 'value', currentJsonData, '');
        return;
    }

    if (!parentObject || (typeof parentObject !== 'object' && !Array.isArray(parentObject))) {
        console.error("데이터 업데이트 오류: 부모 객체를 찾을 수 없거나 객체/배열이 아님.", {pathString, parentPath, parentObject});
        if(typeof Swal !== 'undefined') Swal.fire('오류', '데이터 업데이트 중 오류가 발생했습니다 (부모 경로 확인 필요).', 'error');
        return;
    }

    const targetKeyOrIndex = /^\d+$/.test(lastKeyOrIndexString) && Array.isArray(parentObject)
        ? parseInt(lastKeyOrIndexString, 10)
        : lastKeyOrIndexString;

    // 배열의 인덱스가 범위를 벗어나는 경우 체크
    if (Array.isArray(parentObject) && (targetKeyOrIndex < 0 || targetKeyOrIndex >= parentObject.length)) {
        console.error("데이터 업데이트 오류: 배열 인덱스 범위 초과.", {targetKeyOrIndex, arrayLength: parentObject.length});
        if(typeof Swal !== 'undefined') Swal.fire('오류', '배열 인덱스 범위를 벗어났습니다.', 'error');
        return;
    }
    // 객체인데 해당 키가 없는 경우 (이론상 Handsontable에서 편집 시에는 기존 키/값만 변경)
    // if (!Array.isArray(parentObject) && !parentObject.hasOwnProperty(targetKeyOrIndex)) {
    //     console.error("데이터 업데이트 오류: 객체에 해당 키가 없음.", targetKeyOrIndex);
    //     return;
    // }


    let fullRebuildNeeded = true;
    const originalValue = parentObject[targetKeyOrIndex];
    const typedValue = convertToTypedValue(String(newValueString), originalValue); // newValueString을 String으로 변환
    parentObject[targetKeyOrIndex] = typedValue;

    if (!isBatchOperation) {
        const wasPrimitive = typeof originalValue !== 'object' || originalValue === null;
        const isNowPrimitive = typeof typedValue !== 'object' || typedValue === null;
        if (wasPrimitive && isNowPrimitive && treeViewContainer) {
            const nodeElement = treeViewContainer.querySelector(`.tree-node[data-path="${pathString}"]`);
            if (nodeElement) {
                const valueSpan = nodeElement.querySelector('.node-text-wrapper .tree-node-value');
                if (valueSpan) {
                    applyValueStyleToNode(valueSpan, typedValue);
                    fullRebuildNeeded = false;
                }
            }
        }
    } else {
        return;
    }

    if (!isBatchOperation && fullRebuildNeeded) {
        refreshTreeView(pathString);
    }
}

/**
 * JSON 객체의 키를 변경하고 UI를 새로고침합니다.
 * @param {string} parentPathString - 부모 객체의 경로 문자열
 * @param {string} oldKey - 변경 전 키 이름
 * @param {string} newKey - 변경 후 새 키 이름
 * @param {object} directParentObjectRef - (선택 사항) 부모 객체에 대한 직접 참조
 */
function updateJsonKey(parentPathString, oldKey, newKey, directParentObjectRef) {
    let parentObject;

    if (directParentObjectRef &&
        (parentPathString === "" || getObjectByPath(currentJsonData, parentPathString) === directParentObjectRef)) {
        parentObject = directParentObjectRef;
    } else {
        parentObject = (parentPathString === "") ? currentJsonData : getObjectByPath(currentJsonData, parentPathString);
    }

    if (typeof parentObject !== 'object' || parentObject === null || Array.isArray(parentObject)) {
        console.error("키 업데이트 오류: 부모가 객체가 아니거나 찾을 수 없습니다.", { parentPathString, parentObject });
        if(typeof Swal !== 'undefined') Swal.fire('오류', '키를 업데이트할 부모 객체를 찾을 수 없습니다.', 'error');
        return;
    }
    if (!parentObject.hasOwnProperty(oldKey)) {
        if(typeof Swal !== 'undefined') Swal.fire('오류', `기존 키 "${oldKey}"를 찾을 수 없습니다.`, 'error');
        return;
    }
    if (newKey === oldKey) { // 변경 사항 없음
        if(typeof Swal !== 'undefined') Swal.fire({icon: 'info', title: '알림', text: '키 이름에 변경사항이 없습니다.'});
        return;
    }
    if (parentObject.hasOwnProperty(newKey)) {
        if(typeof Swal !== 'undefined') Swal.fire('오류', `새 키 "${newKey}"가 이미 현재 객체에 존재합니다.`, 'error');
        return;
    }

    // 키 변경 및 순서 유지를 위한 새 객체 생성
    const newOrderedObject = {};
    const valueToMove = parentObject[oldKey]; // 이전 값 저장

    for (const currentKeyInLoop in parentObject) {
        if (parentObject.hasOwnProperty(currentKeyInLoop)) {
            if (currentKeyInLoop === oldKey) {
                newOrderedObject[newKey] = valueToMove; // 새 키로 값 할당
            } else {
                newOrderedObject[currentKeyInLoop] = parentObject[currentKeyInLoop]; // 기존 키-값 복사
            }
        }
    }

    // 부모 객체의 내용을 새 순서의 객체 내용으로 교체
    // 1. 기존 부모 객체의 모든 속성 삭제
    for (const keyInParent in parentObject) {
        if (parentObject.hasOwnProperty(keyInParent)) {
            delete parentObject[keyInParent];
        }
    }
    // 2. 새 순서의 객체에서 부모 객체로 속성 복사
    for (const keyInNewOrder in newOrderedObject) {
        if (newOrderedObject.hasOwnProperty(keyInNewOrder)) {
            parentObject[keyInNewOrder] = newOrderedObject[keyInNewOrder];
        }
    }

    if(typeof Swal !== 'undefined') Swal.fire({icon: 'success', title: '성공', text: `키 "${oldKey}"가 "${newKey}"(으)로 변경되었습니다.`});

    refreshTreeView(`key_renamed_in_parent:${parentPathString}`);
    // 키가 변경된 부모 객체를 테이블에 다시 표시. dataKeyName은 새로 변경된 키로 지정 가능.
    displayDataInTable(parentObject, newKey, currentJsonData, parentPathString);
}


/** 트리 뷰 전체를 새로고침하고 이전 펼침/선택 상태를 복원합니다. */
export function refreshTreeView(changedPathForLog = "N/A") {
    // treeViewContainer 존재 및 currentJsonData 유효성 체크
    if (treeViewContainer && !(currentJsonData === null || currentJsonData === undefined)) {
        const selectedPath = getSelectedNodePath();
        const expandedPaths = getExpandedNodePaths(treeViewContainer);

        treeViewContainer.innerHTML = '';
        const configForTree = buildTreeConfigObj();

        if (typeof currentJsonData === 'object') { // 배열 포함
            buildTree(currentJsonData, treeViewContainer, '', currentJsonData, 0, configForTree);
        } else { // 루트가 원시 값인 경우
            const tempRootKey = (typeof changedPathForLog === 'string' && changedPathForLog !== "N/A" && !changedPathForLog.includes('.'))
                ? changedPathForLog
                : 'value';
            const tempRootData = {[tempRootKey]: currentJsonData};
            buildTree(tempRootData, treeViewContainer, '', tempRootData, 0, configForTree);
        }

        expandNodesByPath(treeViewContainer, expandedPaths);
        if (selectedPath) {
            const reSelectedNode = treeViewContainer.querySelector(`.tree-node[data-path="${selectedPath}"]`);
            if (reSelectedNode) selectNode(reSelectedNode);
        }
    } else if (treeViewContainer) { // currentJsonData가 null이면 트리 뷰를 명시적으로 비움
        treeViewContainer.innerHTML = '';
    }
}

/** buildTree 함수에 전달할 설정 객체를 생성합니다. */
function buildTreeConfigObj() {
    return {
        displayTableCallback: displayDataInTable,
        getObjectByPathCallback: getObjectByPath,
    };
}

/** 경로의 각 세그먼트 클릭을 처리합니다. */
function handlePathSegmentClicked(path) {
    const dataForTable = getObjectByPath(currentJsonData, path);
    if (dataForTable !== undefined) {
        let newKeyName = 'context';
        if (path === '') {
            newKeyName = 'root';
        } else {
            const lastDot = path.lastIndexOf('.');
            const lastBracketOpen = path.lastIndexOf('[');
            if (lastBracketOpen > -1 && path.endsWith(']')) {
                if (lastBracketOpen > lastDot) {
                    newKeyName = path.substring(lastBracketOpen + 1, path.length - 1);
                } else {
                    newKeyName = path.substring(lastDot + 1);
                }
            } else if (lastDot > -1) {
                newKeyName = path.substring(lastDot + 1);
            } else {
                newKeyName = path;
            }
        }
        displayDataInTable(dataForTable, newKeyName, currentJsonData, path);
    } else {
        console.warn(`Data not found for path: ${path}`);
        if(typeof Swal !== 'undefined') Swal.fire('오류', `경로 '${path}'에 해당하는 데이터를 찾을 수 없습니다.`, 'error');
    }
}

/** 테이블 뷰에 데이터를 표시합니다. */
export function displayDataInTable(data, dataKeyName, rootJsonData, dataPathString) {
    // 히스토리 추가는 historyManager를 통해 이루어짐
    // isNavigatingHistory 플래그는 historyManager 내부에서 관리됨
    historyManager.addStateToHistory({ data, dataKeyName, rootJsonData, dataPathString });

    updateTableViewPathDisplay(dataPathString, handlePathSegmentClicked);

    const configForTable = {
        tableViewDomElement: tableViewContainer,
        updateJsonDataCallback: updateJsonData,
        updateJsonKeyCallback: updateJsonKey, // 키 변경 콜백 추가
        refreshTreeViewCallback: refreshTreeView,
        getObjectByPathCallback: getObjectByPath,
        convertToTypedValueCallback: convertToTypedValue,
        rootJsonData: rootJsonData,
        currentJsonDataRef: () => currentJsonData,
        dataPathString: dataPathString,
        displayTableCallback: displayDataInTable,
    };
    displayTableInHot(data, dataKeyName, configForTable);
}

/** 히스토리 탐색 로직 */
function navigateHistory(direction) {
    const stateToRestore = historyManager.getNavigationState(direction);

    if (stateToRestore) {
        historyManager.setNavigationInProgress(true);
        try {
            displayDataInTable(
                stateToRestore.data,
                stateToRestore.dataKeyName,
                stateToRestore.rootJsonData,
                stateToRestore.dataPathString
            );
        } catch (error) {
            console.error("Error navigating history:", error);
            if(typeof Swal !== 'undefined') Swal.fire('오류', '히스토리 복원 중 오류가 발생했습니다.', 'error');
        } finally {
            historyManager.setNavigationInProgress(false);
        }
    }
}

// 애플리케이션 시작
document.addEventListener('DOMContentLoaded', initialLoad);