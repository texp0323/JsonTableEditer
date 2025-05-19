import { minifyJson, prettyJson } from './jsonUtils.js';
import { showJsonDiffPopup, showTextInputPopup, showConfirmationPopup } from './customPopup.js';
import { jsonInputField, saveFeedback, errorOutput, treeViewContainer, tableViewContainer, showTemporaryMessage, updateTableViewPathDisplay, resetBaseUI } from './domUtils.js';
import { getObjectByPath, convertToTypedValue } from './dataUtils.js';
import { buildTree, selectNode, getSelectedNodePath, getExpandedNodePaths, expandNodesByPath } from './treeView.js';
import { applyValueStyleToNode } from './treeViewStyleUtils.js';
import { displayDataWithHandsontable as displayTableInHot, destroyHotInstance } from './tableViewHandsontable.js';
import * as historyManager from './historyManager.js';
import * as searchController from './searchController.js';
import * as templateManager from './templateManager.js';
import './theme-switcher.js';

let currentJsonData = null;
let originalJsonDataAtLoad = null;
let searchInput, searchTargetSelect, searchResultsDropdown;
let hotInstanceRefForPopups = null;

function initialLoad() {
    // JSON 데이터 제어 버튼 이벤트 리스너
    const loadBtn = document.getElementById("loadBtn");
    if (loadBtn) {
        loadBtn.addEventListener("click", loadJson);
    }

    const saveBtn = document.getElementById("saveBtn");
    if (saveBtn) {
        saveBtn.addEventListener('click', saveJson);
    }

    const minifyBtn = document.getElementById("minifyBtn");
    if (minifyBtn) {
        minifyBtn.addEventListener("click", () => {
            if (jsonInputField && jsonInputField.value) {
                try {
                    jsonInputField.value = minifyJson(jsonInputField.value);
                } catch (e) {
                    if(errorOutput) errorOutput.textContent = 'Minify 오류: ' + e.message;
                }
            } else if (jsonInputField) {
                jsonInputField.value = "";
            }
        });
    }

    const uglifyBtn = document.getElementById("uglifyBtn"); // 버튼 텍스트는 "JSON 포맷팅" 등으로 변경하는 것이 좋습니다.
    if (uglifyBtn) {
        uglifyBtn.addEventListener("click", () => {
            if (jsonInputField && jsonInputField.value) {
                try {
                    jsonInputField.value = prettyJson(jsonInputField.value);
                } catch (e) {
                    if(errorOutput) errorOutput.textContent = 'Uglify(포맷팅) 오류: ' + e.message;
                }
            } else if (jsonInputField) {
                jsonInputField.value = "";
            }
        });
    }

    const diffBtn = document.getElementById("diffBtn");
    if (diffBtn) {
        diffBtn.addEventListener('click', () => {
            if (!originalJsonDataAtLoad && !currentJsonData) {
                showConfirmationPopup({ title: '알림', text: '먼저 JSON 데이터를 로드해주세요.', icon: 'info', showCancelButton: false, hotInstance: hotInstanceRefForPopups });
                return;
            }
            if (!originalJsonDataAtLoad) {
                showConfirmationPopup({ title: '알림', text: '로드 시점의 원본 JSON 데이터가 없습니다. 변경사항을 비교할 수 없습니다.', icon: 'info', showCancelButton: false, hotInstance: hotInstanceRefForPopups });
                return;
            }
            const dataForDiffRight = currentJsonData === null ? {} : currentJsonData;
            showJsonDiffPopup({
                title: 'JSON 데이터 변경사항',
                jsonDiffData: { left: originalJsonDataAtLoad, right: dataForDiffRight },
                buttons: [{ text: '닫기', role: 'confirm' }],
                hotInstance: hotInstanceRefForPopups
            }).catch(error => {
                console.error('showJsonDiffPopup 실행 중 오류:', error);
                showConfirmationPopup({ title: '오류', text: '변경점 확인 중 오류가 발생했습니다.', icon: 'error', showCancelButton: false, hotInstance: hotInstanceRefForPopups });
            });
        });
    }

    // 파일 가져오기/내보내기 버튼 이벤트 리스너
    const loadFromFileButton = document.getElementById("loadFromFileBtn");
    if (loadFromFileButton) {
        loadFromFileButton.addEventListener("click", loadJsonFromFile);
    }

    const saveToFileButton = document.getElementById("saveToFileBtn");
    if (saveToFileButton) {
        saveToFileButton.addEventListener("click", saveJsonToFile);
    }

    // 검색 기능 관련 DOM 요소 및 이벤트 리스너
    searchInput = document.getElementById('searchInput'); // searchInput은 전역 변수로 선언되어 있어야 함
    searchTargetSelect = document.getElementById('searchTargetSelect'); // searchTargetSelect은 전역 변수
    searchResultsDropdown = document.getElementById('searchResultsDropdown'); // searchResultsDropdown은 전역 변수

    if (searchInput) {
        searchInput.addEventListener('input', handleSearchInput);
    }
    if (searchTargetSelect) {
        searchTargetSelect.addEventListener('change', handleSearchInput);
    }
    // 검색 결과 드롭다운 외부 클릭 시 숨김 처리
    document.addEventListener('click', (event) => {
        if (searchResultsDropdown && searchInput && !searchInput.contains(event.target) && !searchResultsDropdown.contains(event.target)) {
            searchResultsDropdown.style.display = 'none';
        }
    });
    // 검색 결과 드롭다운 내부 클릭 시 이벤트 전파 중단 (드롭다운 닫힘 방지)
    if (searchResultsDropdown) {
        searchResultsDropdown.addEventListener('click', (event) => event.stopPropagation());
    }

    // 마우스 버튼 (뒤로가기/앞으로가기) 및 우클릭 메뉴 제어
    window.addEventListener('mousedown', (event) => {
        if (event.button === 3 || event.button === 4) { // 마우스 4, 5번 버튼 (보통 뒤로가기/앞으로가기)
            event.preventDefault();
            if (event.button === 3) { // 브라우저에 따라 다를 수 있으나, 보통 3번이 뒤로가기
                navigateHistory('back');
            } else if (event.button === 4) { // 보통 4번이 앞으로가기
                navigateHistory('forward');
            }
        }
    });
    window.addEventListener('contextmenu', (event) => { // 기본 우클릭 메뉴 방지
        event.preventDefault();
    });

    // JSON 제어 패널 드래그 앤 드롭 이벤트 리스너
    const jsonControlPanel = document.querySelector('.json-control-panel');
    if (jsonControlPanel) {
        jsonControlPanel.addEventListener('dragover', handleDragOver);
        jsonControlPanel.addEventListener('dragleave', handleDragLeave);
        jsonControlPanel.addEventListener('drop', handleFileDrop);
    } else {
        console.warn('.json-control-panel 요소를 찾을 수 없어 드래그앤드롭 기능을 활성화할 수 없습니다.');
    }

    // 3단 패널 리사이저 로직
    const panelContainer = document.querySelector('.main-layout-triple-panel');
    const panels = [
        document.querySelector('.json-control-panel'),
        document.querySelector('.tree-view-panel'),
        document.querySelector('.table-view-panel')
    ];
    const resizers = [
        document.getElementById('resizer-1'),
        document.getElementById('resizer-2')
    ];

    if (panelContainer && panels.every(p => p) && resizers.every(r => r)) {
        setInitialPanelWidths(panelContainer, panels, resizers); // 초기 패널 너비 설정 함수 호출
        window.addEventListener('resize', () => setInitialPanelWidths(panelContainer, panels, resizers));

        resizers.forEach((resizer, index) => {
            let isResizing = false;
            let startX = 0;
            let initialWidths = []; // 각 리사이징 세션마다 초기 너비를 저장

            resizer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                isResizing = true;
                startX = e.clientX;
                // 현재 패널들의 너비를 저장
                initialWidths = [panels[index].offsetWidth, panels[index + 1].offsetWidth];

                // mousemove와 mouseup 이벤트는 document에 등록해야
                // 마우스가 리사이저 밖으로 나가도 계속 드래그 가능
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
            });

            // handleMouseMove와 handleMouseUp은 각 리사이저의 mousedown 핸들러 내에 정의되어야
            // 올바른 initialWidths와 isResizing 상태를 클로저로 참조할 수 있습니다.
            function handleMouseMove(e) {
                if (!isResizing) return;

                const deltaX = e.clientX - startX;
                const minPanelWidth = 50; // 최소 패널 너비

                let newLeftWidth = initialWidths[0] + deltaX;
                let newRightWidth = initialWidths[1] - deltaX;

                // 최소 너비 보장 로직
                if (newLeftWidth < minPanelWidth) {
                    newLeftWidth = minPanelWidth;
                    // newRightWidth는 (전체 너비 - newLeftWidth)가 되어야 하나,
                    // 여기서는 원래 두 패널의 합계 너비를 기준으로 조정
                    newRightWidth = initialWidths[0] + initialWidths[1] - newLeftWidth;
                }
                if (newRightWidth < minPanelWidth) {
                    newRightWidth = minPanelWidth;
                    newLeftWidth = initialWidths[0] + initialWidths[1] - newRightWidth;
                }

                // flex-basis를 사용하여 패널 너비 조정
                panels[index].style.flexBasis = `${newLeftWidth}px`;
                panels[index + 1].style.flexBasis = `${newRightWidth}px`;
            }

            function handleMouseUp() {
                if (!isResizing) return;
                isResizing = false;
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            }
        });
    } else {
        console.warn('3-패널 레이아웃에 필요한 요소를 모두 찾을 수 없습니다. 리사이저가 동작하지 않을 수 있습니다.');
    }
}


// --- 드래그 앤 드롭 핸들러 함수들 ---
function handleDragOver(event) {
    event.preventDefault(); // 기본 동작 방지 (파일 열기 등)
    event.stopPropagation();
    // 드롭 영역에 시각적 피드백 추가 (CSS 클래스 활용)
    if (event.currentTarget && typeof event.currentTarget.classList !== 'undefined') {
        event.currentTarget.classList.add('dragover-active');
    }
    event.dataTransfer.dropEffect = 'copy'; // 드롭 효과 표시
}

function handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    // 드롭 영역에서 시각적 피드백 제거
    if (event.currentTarget && typeof event.currentTarget.classList !== 'undefined') {
        event.currentTarget.classList.remove('dragover-active');
    }
}

function handleFileDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    // 드롭 영역 시각적 피드백 제거
    if (event.currentTarget && typeof event.currentTarget.classList !== 'undefined') {
        event.currentTarget.classList.remove('dragover-active');
    }

    const files = event.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0]; // 첫 번째 파일만 처리

        // 파일 타입 확인 (선택 사항이지만 권장)
        if (file.type === "application/json" || file.name.toLowerCase().endsWith('.json')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const fileContent = e.target.result;
                    if (jsonInputField) {
                        jsonInputField.value = fileContent;
                        loadJson(); // 기존 로드 함수 호출
                        showTemporaryMessage(saveFeedback, `${file.name} 파일이 드롭되어 로드되었습니다.`, 3000);
                    } else {
                        console.error('JSON 입력 필드를 찾을 수 없습니다.');
                        showConfirmationPopup({ title: '오류', text: 'JSON 입력 필드를 찾을 수 없습니다.', icon: 'error', showCancelButton: false, hotInstance: hotInstanceRefForPopups });
                    }
                } catch (err) {
                    console.error('파일 읽기 또는 JSON 파싱 오류 (드롭):', err);
                    if(errorOutput) errorOutput.textContent = `파일 오류 (드롭): ${err.message}`;
                    showConfirmationPopup({ title: '파일 로드 오류 (드롭)', text: `파일을 로드하거나 파싱하는 중 오류가 발생했습니다: ${err.message}`, icon: 'error', showCancelButton: false, hotInstance: hotInstanceRefForPopups });
                }
            };
            reader.onerror = (e) => {
                console.error('파일 읽기 오류 (드롭):', e);
                if(errorOutput) errorOutput.textContent = '파일을 읽는 중 오류가 발생했습니다 (드롭).';
                showConfirmationPopup({ title: '파일 읽기 오류 (드롭)', text: '파일을 읽는 중 오류가 발생했습니다.', icon: 'error', showCancelButton: false, hotInstance: hotInstanceRefForPopups });
            };
            reader.readAsText(file);
        } else {
            showConfirmationPopup({ title: '잘못된 파일 타입', text: 'JSON 파일(.json)만 드롭해주세요.', icon: 'warning', showCancelButton: false, hotInstance: hotInstanceRefForPopups });
        }
    }
}

function setInitialPanelWidths(container, panelsArray, resizersArray) {
    const containerWidth = container.offsetWidth;
    const totalResizerWidth = resizersArray.reduce((sum, r) => sum + r.offsetWidth, 0);
    const availableWidth = containerWidth - totalResizerWidth;
    const ratios = [0.10, 0.15, 0.75]; const minW = 50;
    if (availableWidth > 0) {
        let w1 = Math.max(minW, Math.floor(availableWidth * ratios[0]));
        let w2 = Math.max(minW, Math.floor(availableWidth * ratios[1]));
        let w3 = Math.max(minW, availableWidth - w1 - w2);
        if (w1 + w2 + w3 > availableWidth) w3 = availableWidth - w1 - w2;
        panelsArray[0].style.flexBasis = `${w1}px`;
        panelsArray[1].style.flexBasis = `${w2}px`;
        panelsArray[2].style.flexBasis = `${w3}px`;
    }
}

function handleSearchInput() {
    if (!searchInput || !searchTargetSelect || !searchResultsDropdown) return;
    const query = searchInput.value.trim().toLowerCase(); const searchScope = searchTargetSelect.value;
    if (!query) { searchResultsDropdown.innerHTML = ''; searchResultsDropdown.style.display = 'none'; return; }
    if (currentJsonData === null || currentJsonData === undefined) {
        searchController.populateSearchResultsDropdown([{ displayText: "JSON 데이터를 먼저 로드해주세요.", noAction: true }], searchResultsDropdown, query, handleSearchResultClick); return;
    }
    const results = searchController.performSearch(query, searchScope, currentJsonData);
    searchController.populateSearchResultsDropdown(results, searchResultsDropdown, query, handleSearchResultClick);
}

function handleSearchResultClick(params) {
    if (params && typeof displayDataInTable === 'function') {
        displayDataInTable(params.data, params.dataKeyName, params.rootJsonData, params.dataPathString || '');
        if (searchResultsDropdown) searchResultsDropdown.style.display = 'none';
    }
}

// 파일에서 JSON을 로드하는 함수
function loadJsonFromFile() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json'; // JSON 파일만 선택하도록 필터링
    fileInput.style.display = 'none';

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const fileContent = e.target.result;
                if (jsonInputField) {
                    jsonInputField.value = fileContent; // 텍스트 영역에 파일 내용 설정
                    loadJson(); // 기존 로드 함수 호출
                    showTemporaryMessage(saveFeedback, `${file.name} 파일이 로드되었습니다.`, 3000);
                } else {
                    console.error('JSON 입력 필드를 찾을 수 없습니다.');
                    showConfirmationPopup({ title: '오류', text: 'JSON 입력 필드를 찾을 수 없습니다.', icon: 'error', showCancelButton: false, hotInstance: hotInstanceRefForPopups });
                }
            } catch (err) {
                console.error('파일 읽기 또는 JSON 파싱 오류:', err);
                if(errorOutput) errorOutput.textContent = `파일 오류: ${err.message}`;
                showConfirmationPopup({ title: '파일 로드 오류', text: `파일을 로드하거나 파싱하는 중 오류가 발생했습니다: ${err.message}`, icon: 'error', showCancelButton: false, hotInstance: hotInstanceRefForPopups });
            }
        };
        reader.onerror = (e) => {
            console.error('파일 읽기 오류:', e);
            if(errorOutput) errorOutput.textContent = '파일을 읽는 중 오류가 발생했습니다.';
            showConfirmationPopup({ title: '파일 읽기 오류', text: '파일을 읽는 중 오류가 발생했습니다.', icon: 'error', showCancelButton: false, hotInstance: hotInstanceRefForPopups });
        };
        reader.readAsText(file);
        document.body.removeChild(fileInput); // 사용 후 요소 제거
    });

    document.body.appendChild(fileInput);
    fileInput.click();
}

// 현재 JSON 데이터를 파일로 저장하는 함수
async function saveJsonToFile() { // async 함수로 변경
    if (currentJsonData === null || currentJsonData === undefined) {
        showTemporaryMessage(saveFeedback, '저장할 JSON 데이터가 없습니다.', 3000); // domUtils.js
        return;
    }

    try {
        const result = await showTextInputPopup({ // customPopup.js
            title: '파일 이름 입력',
            inputLabel: '저장할 파일 이름을 입력해주세요 (.json 확장자는 자동으로 추가됩니다):',
            inputValue: 'data', // 기본 파일 이름 (확장자 제외)
            confirmButtonText: '저장',
            inputValidator: (value) => {
                if (!value || value.trim().length === 0) {
                    return '파일 이름은 비워둘 수 없습니다.';
                }
                // 추가적인 파일 이름 유효성 검사 (예: 특수문자 제한 등)가 필요하면 여기에 추가
                return null; // 유효하면 null 반환
            },
            hotInstance: hotInstanceRefForPopups // Handsontable 인스턴스가 있다면 전달하여 팝업 시 셀 선택 해제
        });

        if (result.isConfirmed && result.value) {
            let filename = result.value.trim();
            // 사용자가 .json을 입력했는지 확인하고, 없으면 추가
            if (!filename.toLowerCase().endsWith('.json')) {
                filename += '.json';
            }

            const jsonString = JSON.stringify(currentJsonData, null, 2); // 2칸 들여쓰기로 포맷팅
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = filename; // 사용자가 입력한 파일 이름 사용
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url); // URL 해제

            showTemporaryMessage(saveFeedback, `${filename} 파일이 성공적으로 저장되었습니다!`, 3000); // domUtils.js
        } else {
            showTemporaryMessage(saveFeedback, '파일 저장이 취소되었습니다.', 3000); // domUtils.js
        }

    } catch (e) {
        console.error('JSON 파일 저장 오류:', e);
        if(errorOutput) errorOutput.textContent = 'JSON 파일 저장 오류: ' + e.message; // domUtils.js
        showConfirmationPopup({ // customPopup.js
            title: '파일 저장 오류',
            text: `JSON 데이터를 파일로 저장하는 중 오류가 발생했습니다: ${e.message}`,
            icon: 'error',
            showCancelButton: false,
            hotInstance: hotInstanceRefForPopups
        });
    }
}

function loadJson() {
    resetUI(); historyManager.clearHistory();
    try {
        const jsonString = jsonInputField.value.trim();
        if (!jsonString) { currentJsonData = null; originalJsonDataAtLoad = null; updateTableViewPathDisplay(null, handlePathSegmentClicked); destroyHotInstanceAndUpdateRef(); return; }
        currentJsonData = JSON.parse(jsonString); originalJsonDataAtLoad = JSON.parse(JSON.stringify(currentJsonData));
        const configForTree = buildTreeConfigObj(); if (treeViewContainer) treeViewContainer.innerHTML = '';
        if (typeof currentJsonData === 'object' && currentJsonData !== null) buildTree(currentJsonData, treeViewContainer, '', currentJsonData, 0, configForTree);
        else { const tempRootKey = 'value'; const tempData = { [tempRootKey]: currentJsonData }; buildTree(tempData, treeViewContainer, '', tempData, 0, configForTree); }
        destroyHotInstanceAndUpdateRef(); updateTableViewPathDisplay(null, handlePathSegmentClicked);
    } catch (e) {
        if(errorOutput) errorOutput.textContent = 'JSON 파싱 오류: ' + e.message; currentJsonData = null; originalJsonDataAtLoad = null;
        if(treeViewContainer) treeViewContainer.innerHTML = ''; destroyHotInstanceAndUpdateRef(); updateTableViewPathDisplay(null, handlePathSegmentClicked);
    }
}

function saveJson() {
    if(errorOutput) errorOutput.textContent = '';
    if (currentJsonData !== null && currentJsonData !== undefined) {
        try { const jsonString = JSON.stringify(currentJsonData, null, 2); if(jsonInputField) jsonInputField.value = jsonString; if(saveFeedback) showTemporaryMessage(saveFeedback, 'JSON이 텍스트 영역에 저장되었습니다!', 3000); }
        catch (e) { if(errorOutput) errorOutput.textContent = 'JSON 문자열 변환 오류: ' + e.message; if(saveFeedback) saveFeedback.textContent = ''; }
    } else { if(jsonInputField) jsonInputField.value = ''; if(saveFeedback) showTemporaryMessage(saveFeedback, '저장할 JSON 데이터가 없습니다.', 3000); }
}

function resetUI() {
    resetBaseUI(); destroyHotInstanceAndUpdateRef(); currentJsonData = null; originalJsonDataAtLoad = null; selectNode(null);
    if (searchResultsDropdown) { searchResultsDropdown.innerHTML = ''; searchResultsDropdown.style.display = 'none'; }
    if(searchInput) searchInput.value = ''; if(treeViewContainer) treeViewContainer.innerHTML = ''; updateTableViewPathDisplay(null, handlePathSegmentClicked);
}

function destroyHotInstanceAndUpdateRef() {
    hotInstanceRefForPopups = destroyHotInstance();
}

function updateJsonData(pathString, newValueString, isBatchOperation = false) {
    if (currentJsonData === null || currentJsonData === undefined) { console.error("데이터 업데이트 오류: currentJsonData가 없습니다."); return; }
    const keys = pathString.replace(/\[(\d+)\]/g, '.$1').split('.'); const lastKeyOrIndexString = keys.pop(); const parentPath = keys.join('.');
    let parentObject; if (parentPath === "") parentObject = currentJsonData; else parentObject = getObjectByPath(currentJsonData, parentPath);
    if (parentPath === "" && pathString === lastKeyOrIndexString && (typeof currentJsonData !== 'object' || currentJsonData === null)) {
        currentJsonData = convertToTypedValue(newValueString, currentJsonData); if (isBatchOperation) return; refreshTreeView(pathString);
        displayDataInTable(currentJsonData, 'value', currentJsonData, ''); return;
    }
    if (!parentObject || (typeof parentObject !== 'object' && !Array.isArray(parentObject))) {
        console.error("데이터 업데이트 오류: 부모 객체를 찾을 수 없거나 객체/배열이 아님.", {pathString, parentPath, parentObject});
        showConfirmationPopup({ title: '오류', text: '데이터 업데이트 중 오류가 발생했습니다 (부모 경로 확인 필요).', icon: 'error', showCancelButton: false, hotInstance: hotInstanceRefForPopups }); return;
    }
    const targetKeyOrIndex = /^\d+$/.test(lastKeyOrIndexString) && Array.isArray(parentObject) ? parseInt(lastKeyOrIndexString, 10) : lastKeyOrIndexString;
    if (Array.isArray(parentObject) && (targetKeyOrIndex < 0 || targetKeyOrIndex >= parentObject.length)) {
        console.error("데이터 업데이트 오류: 배열 인덱스 범위 초과.", {targetKeyOrIndex, arrayLength: parentObject.length});
        showConfirmationPopup({ title: '오류', text: '배열 인덱스 범위를 벗어났습니다.', icon: 'error', showCancelButton: false, hotInstance: hotInstanceRefForPopups }); return;
    }
    let fullRebuildNeeded = true; const originalValue = parentObject[targetKeyOrIndex];
    const typedValue = convertToTypedValue(String(newValueString), originalValue); parentObject[targetKeyOrIndex] = typedValue;
    if (!isBatchOperation) {
        const wasPrimitive = typeof originalValue !== 'object' || originalValue === null;
        const isNowPrimitive = typeof typedValue !== 'object' || typedValue === null;
        if (wasPrimitive && isNowPrimitive && treeViewContainer) {
            const nodeElement = treeViewContainer.querySelector(`.tree-node[data-path="${pathString}"]`);
            if (nodeElement) { const valueSpan = nodeElement.querySelector('.node-text-wrapper .tree-node-value'); if (valueSpan) { applyValueStyleToNode(valueSpan, typedValue); fullRebuildNeeded = false; } }
        }
    } else return;
    if (!isBatchOperation && fullRebuildNeeded) {
        refreshTreeView(pathString);
    }
}

function updateJsonKey(parentPathString, oldKey, newKey, directParentObjectRef) {
    let parentObject;
    if (directParentObjectRef && (parentPathString === "" || getObjectByPath(currentJsonData, parentPathString) === directParentObjectRef)) parentObject = directParentObjectRef;
    else parentObject = (parentPathString === "") ? currentJsonData : getObjectByPath(currentJsonData, parentPathString);
    if (typeof parentObject !== 'object' || parentObject === null || Array.isArray(parentObject)) {
        showConfirmationPopup({ title: '오류', text: '키를 업데이트할 부모 객체를 찾을 수 없습니다.', icon: 'error', showCancelButton: false, hotInstance: hotInstanceRefForPopups }); return;
    }
    if (!parentObject.hasOwnProperty(oldKey)) { showConfirmationPopup({ title: '오류', text: `기존 키 "${oldKey}"를 찾을 수 없습니다.`, icon: 'error', showCancelButton: false, hotInstance: hotInstanceRefForPopups }); return; }
    if (newKey === oldKey) { showConfirmationPopup({icon: 'info', title: '알림', text: '키 이름에 변경사항이 없습니다.', showCancelButton: false, hotInstance: hotInstanceRefForPopups}); return; }
    if (parentObject.hasOwnProperty(newKey)) { showConfirmationPopup({ title: '오류', text: `새 키 "${newKey}"가 이미 현재 객체에 존재합니다.`, icon: 'error', showCancelButton: false, hotInstance: hotInstanceRefForPopups }); return; }
    const newOrderedObject = {}; const valueToMove = parentObject[oldKey];
    for (const currentKeyInLoop in parentObject) if (parentObject.hasOwnProperty(currentKeyInLoop)) { if (currentKeyInLoop === oldKey) newOrderedObject[newKey] = valueToMove; else newOrderedObject[currentKeyInLoop] = parentObject[currentKeyInLoop]; }
    for (const keyInParent in parentObject) if (parentObject.hasOwnProperty(keyInParent)) delete parentObject[keyInParent];
    for (const keyInNewOrder in newOrderedObject) if (newOrderedObject.hasOwnProperty(keyInNewOrder)) parentObject[keyInNewOrder] = newOrderedObject[keyInNewOrder];
    showConfirmationPopup({icon: 'success', title: '성공', text: `키 "${oldKey}"가 "${newKey}"(으)로 변경되었습니다.`, showCancelButton: false, hotInstance: hotInstanceRefForPopups});
    refreshTreeView(`key_renamed_in_parent:${parentPathString}`);
    displayDataInTable(parentObject, newKey, currentJsonData, parentPathString);
}

export function refreshTreeView(changedPathForLog = "N/A") {
    if (treeViewContainer && !(currentJsonData === null || currentJsonData === undefined)) {
        const selectedPath = getSelectedNodePath(); const expandedPaths = getExpandedNodePaths(treeViewContainer);
        treeViewContainer.innerHTML = ''; const configForTree = buildTreeConfigObj();
        if (typeof currentJsonData === 'object' && currentJsonData !== null) buildTree(currentJsonData, treeViewContainer, '', currentJsonData, 0, configForTree);
        else { const tempRootKey = (typeof changedPathForLog === 'string' && changedPathForLog !== "N/A" && !changedPathForLog.includes('.')) ? changedPathForLog : 'value'; const tempRootData = {[tempRootKey]: currentJsonData}; buildTree(tempRootData, treeViewContainer, '', tempRootData, 0, configForTree); }
        expandNodesByPath(treeViewContainer, expandedPaths);
        if (selectedPath) { const reSelectedNode = treeViewContainer.querySelector(`.tree-node[data-path="${selectedPath}"]`); if (reSelectedNode) selectNode(reSelectedNode); }
    } else if (treeViewContainer) treeViewContainer.innerHTML = '';
}

function buildTreeConfigObj() {
    return { displayTableCallback: displayDataInTable, getObjectByPathCallback: getObjectByPath, rootJsonData: currentJsonData };
}

function handlePathSegmentClicked(path) {
    const dataForTable = getObjectByPath(currentJsonData, path);
    if (dataForTable !== undefined) {
        let newKeyName = 'context';
        if (path === '') newKeyName = 'root';
        else { const lastDot = path.lastIndexOf('.'); const lastBracketOpen = path.lastIndexOf('[');
            if (lastBracketOpen > -1 && path.endsWith(']')) { if (lastBracketOpen > lastDot) newKeyName = path.substring(lastBracketOpen + 1, path.length - 1); else newKeyName = path.substring(lastDot + 1); }
            else if (lastDot > -1) newKeyName = path.substring(lastDot + 1);
            else newKeyName = path;
        }
        displayDataInTable(dataForTable, newKeyName, currentJsonData, path, { syncTreeView: true });
    } else {
        console.warn(`Data not found for path: ${path}`);
        showConfirmationPopup({ title: '오류', text: `경로 '${path}'에 해당하는 데이터를 찾을 수 없습니다.`, icon: 'error', showCancelButton: false, hotInstance: hotInstanceRefForPopups });
    }
}

export function displayDataInTable(dataToDisplay, dataKeyNameToUse, rootJsonDataForContext, dataPathStringToRecord, options = { syncTreeView: true }) {
    historyManager.addStateToHistory({ dataPathString: dataPathStringToRecord, dataKeyName: dataKeyNameToUse });
    updateTableViewPathDisplay(dataPathStringToRecord, handlePathSegmentClicked);
    const configForTable = {
        tableViewDomElement: tableViewContainer,
        updateJsonDataCallback: updateJsonData,
        updateJsonKeyCallback: updateJsonKey,
        refreshTreeViewCallback: refreshTreeView,
        getObjectByPathCallback: getObjectByPath,
        convertToTypedValueCallback: convertToTypedValue,
        rootJsonData: rootJsonDataForContext,
        currentJsonDataRef: () => currentJsonData,
        dataPathString: dataPathStringToRecord,
        displayTableCallback: displayDataInTable,
        // Add template manager functions to config
        getTemplates: templateManager.getTemplates,
        addTemplate: templateManager.addTemplate
    };
    hotInstanceRefForPopups = displayTableInHot(dataToDisplay, dataKeyNameToUse, configForTable); // displayDataWithHandsontable in your context


    if (options.syncTreeView && treeViewContainer && dataPathStringToRecord !== undefined && dataPathStringToRecord !== null) {
        const targetNodeElement = treeViewContainer.querySelector(`.tree-node[data-path="${dataPathStringToRecord}"]`);
        if (targetNodeElement) {
            selectNode(targetNodeElement);
            // 자동 펼침 로직 제거: 사용자가 직접 화살표를 클릭해야 펼쳐짐
            // const pathsToEnsureExpanded = new Set();
            // if (dataPathStringToRecord !== "") {
            //     const segments = dataPathStringToRecord.split('.'); let currentCumulativePath = '';
            //     for (let i = 0; i < segments.length -1; i++) { currentCumulativePath = currentCumulativePath ? `${currentCumulativePath}.${segments[i]}` : segments[i]; pathsToEnsureExpanded.add(currentCumulativePath); }
            // }
            // if (pathsToEnsureExpanded.size > 0) expandNodesByPath(treeViewContainer, pathsToEnsureExpanded);

            setTimeout(() => {
                const finalTargetNode = treeViewContainer.querySelector(`.tree-node[data-path="${dataPathStringToRecord}"]`);
                if (finalTargetNode) {
                    // 자동 펼침 로직 제거
                    // const toggleIcon = finalTargetNode.querySelector('.toggle-icon'); const childrenContainer = finalTargetNode.nextElementSibling;
                    // if (toggleIcon && toggleIcon.textContent === '▶' && childrenContainer && childrenContainer.classList.contains('tree-node-children')) { childrenContainer.style.display = 'block'; toggleIcon.textContent = '▼'; }
                    finalTargetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 50);
        } else if (dataPathStringToRecord === "") {
            selectNode(null); if (treeViewContainer.firstChild) treeViewContainer.scrollTop = 0;
        } else {
            console.warn(`Tree node for path "${dataPathStringToRecord}" not found for synchronization.`);
        }
    }
}

function navigateHistory(direction) {
    const restoredPathInfo = historyManager.getNavigationState(direction);
    if (restoredPathInfo) {
        historyManager.setNavigationInProgress(true);
        try {
            const dataForPath = getObjectByPath(currentJsonData, restoredPathInfo.dataPathString);
            displayDataInTable(
                dataForPath,
                restoredPathInfo.dataKeyName,
                currentJsonData,
                restoredPathInfo.dataPathString,
                { syncTreeView: false }
            );
        } catch (error) {
            console.error("Error navigating history:", error);
            showConfirmationPopup({ title: '오류', text: '히스토리 복원 중 오류가 발생했습니다.', icon: 'error', showCancelButton: false, hotInstance: hotInstanceRefForPopups });
        } finally {
            historyManager.setNavigationInProgress(false);
        }
    }
}
document.addEventListener('DOMContentLoaded', initialLoad);