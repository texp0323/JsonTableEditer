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
import { initializeThemeSwitcher } from './theme-switcher.js';

let currentJsonData = null;
let originalJsonDataAtLoad = null;
let searchInput, searchTargetSelect, searchResultsDropdown;
let hotInstanceRefForPopups = null;

function initialLoad() {
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

    const uglifyBtn = document.getElementById("uglifyBtn");
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
                showConfirmationPopup({ title: '오류', text: '변경점 확인 중 오류가 발생했습니다.', icon: 'error', showCancelButton: false, hotInstance: hotInstanceRefForPopups });
            });
        });
    }

    const loadFromFileButton = document.getElementById("loadFromFileBtn");
    if (loadFromFileButton) {
        loadFromFileButton.addEventListener("click", loadJsonFromFile);
    }

    const saveToFileButton = document.getElementById("saveToFileBtn");
    if (saveToFileButton) {
        saveToFileButton.addEventListener("click", saveJsonToFile);
    }

    const loadTemplatesFromFileBtn = document.getElementById("loadTemplatesFromFileBtn");
    if (loadTemplatesFromFileBtn) {
        loadTemplatesFromFileBtn.addEventListener("click", loadTemplatesFromFile);
    }

    const saveTemplatesToFileBtn = document.getElementById("saveTemplatesToFileBtn");
    if (saveTemplatesToFileBtn) {
        saveTemplatesToFileBtn.addEventListener("click", saveTemplatesToFile);
    }

    searchInput = document.getElementById('searchInput');
    searchTargetSelect = document.getElementById('searchTargetSelect');
    searchResultsDropdown = document.getElementById('searchResultsDropdown');

    if (searchInput) {
        searchInput.addEventListener('input', handleSearchInput);
    }
    if (searchTargetSelect) {
        searchTargetSelect.addEventListener('change', handleSearchInput);
    }
    document.addEventListener('click', (event) => {
        if (searchResultsDropdown && searchInput && !searchInput.contains(event.target) && !searchResultsDropdown.contains(event.target)) {
            searchResultsDropdown.style.display = 'none';
        }
    });
    if (searchResultsDropdown) {
        searchResultsDropdown.addEventListener('click', (event) => event.stopPropagation());
    }

    window.addEventListener('mousedown', (event) => {
        if (event.button === 3 || event.button === 4) {
            event.preventDefault();
            if (event.button === 3) {
                navigateHistory('back');
            } else if (event.button === 4) {
                navigateHistory('forward');
            }
        }
    });
    window.addEventListener('contextmenu', (event) => {
        event.preventDefault();
    });

    const jsonControlPanel = document.querySelector('.json-control-panel');
    if (jsonControlPanel) {
        jsonControlPanel.addEventListener('dragover', handleDragOver);
        jsonControlPanel.addEventListener('dragleave', handleDragLeave);
        jsonControlPanel.addEventListener('drop', handleFileDrop);
    } else {
        console.warn('.json-control-panel 요소를 찾을 수 없어 드래그앤드롭 기능을 활성화할 수 없습니다.');
    }

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
        setInitialPanelWidths(panelContainer, panels, resizers);
        window.addEventListener('resize', () => setInitialPanelWidths(panelContainer, panels, resizers));

        resizers.forEach((resizer, index) => {
            let isResizing = false;
            let startX = 0;
            let initialWidths = [];

            resizer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                isResizing = true;
                startX = e.clientX;
                initialWidths = [panels[index].offsetWidth, panels[index + 1].offsetWidth];
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
            });

            function handleMouseMove(e) {
                if (!isResizing) return;
                const deltaX = e.clientX - startX;
                const minPanelWidth = 50;
                let newLeftWidth = initialWidths[0] + deltaX;
                let newRightWidth = initialWidths[1] - deltaX;
                if (newLeftWidth < minPanelWidth) {
                    newLeftWidth = minPanelWidth;
                    newRightWidth = initialWidths[0] + initialWidths[1] - newLeftWidth;
                }
                if (newRightWidth < minPanelWidth) {
                    newRightWidth = minPanelWidth;
                    newLeftWidth = initialWidths[0] + initialWidths[1] - newRightWidth;
                }
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
    initializeThemeSwitcher();
}

function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget && typeof event.currentTarget.classList !== 'undefined') {
        event.currentTarget.classList.add('dragover-active');
    }
    event.dataTransfer.dropEffect = 'copy';
}

function handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget && typeof event.currentTarget.classList !== 'undefined') {
        event.currentTarget.classList.remove('dragover-active');
    }
}

function handleFileDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget && typeof event.currentTarget.classList !== 'undefined') {
        event.currentTarget.classList.remove('dragover-active');
    }

    const files = event.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];

        if (file.type === "application/json" || file.name.toLowerCase().endsWith('.json')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const fileContent = e.target.result;
                    if (jsonInputField) {
                        jsonInputField.value = fileContent;
                        loadJson();
                        showTemporaryMessage(saveFeedback, `${file.name} 파일이 드롭되어 로드되었습니다.`, 3000);
                    } else {
                        showConfirmationPopup({ title: '오류', text: 'JSON 입력 필드를 찾을 수 없습니다.', icon: 'error', showCancelButton: false, hotInstance: hotInstanceRefForPopups });
                    }
                } catch (err) {
                    if(errorOutput) errorOutput.textContent = `파일 오류 (드롭): ${err.message}`;
                    showConfirmationPopup({ title: '파일 로드 오류 (드롭)', text: `파일을 로드하거나 파싱하는 중 오류가 발생했습니다: ${err.message}`, icon: 'error', showCancelButton: false, hotInstance: hotInstanceRefForPopups });
                }
            };
            reader.onerror = (e) => {
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

function loadJsonFromFile() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';
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
                    jsonInputField.value = fileContent;
                    loadJson();
                    showTemporaryMessage(saveFeedback, `${file.name} 파일이 로드되었습니다.`, 3000);
                } else {
                    showConfirmationPopup({ title: '오류', text: 'JSON 입력 필드를 찾을 수 없습니다.', icon: 'error', showCancelButton: false, hotInstance: hotInstanceRefForPopups });
                }
            } catch (err) {
                if(errorOutput) errorOutput.textContent = `파일 오류: ${err.message}`;
                showConfirmationPopup({ title: '파일 로드 오류', text: `파일을 로드하거나 파싱하는 중 오류가 발생했습니다: ${err.message}`, icon: 'error', showCancelButton: false, hotInstance: hotInstanceRefForPopups });
            }
        };
        reader.onerror = (e) => {
            if(errorOutput) errorOutput.textContent = '파일을 읽는 중 오류가 발생했습니다.';
            showConfirmationPopup({ title: '파일 읽기 오류', text: '파일을 읽는 중 오류가 발생했습니다.', icon: 'error', showCancelButton: false, hotInstance: hotInstanceRefForPopups });
        };
        reader.readAsText(file);
        document.body.removeChild(fileInput);
    });

    document.body.appendChild(fileInput);
    fileInput.click();
}

async function saveJsonToFile() {
    if (currentJsonData === null || currentJsonData === undefined) {
        showTemporaryMessage(saveFeedback, '저장할 JSON 데이터가 없습니다.', 3000);
        return;
    }

    try {
        const result = await showTextInputPopup({
            title: '파일 이름 입력',
            inputLabel: '저장할 파일 이름을 입력해주세요 (.json 확장자는 자동으로 추가됩니다):',
            inputValue: 'data',
            confirmButtonText: '저장',
            inputValidator: (value) => {
                if (!value || value.trim().length === 0) {
                    return '파일 이름은 비워둘 수 없습니다.';
                }
                return null;
            },
            hotInstance: hotInstanceRefForPopups
        });

        if (result.isConfirmed && result.value) {
            let filename = result.value.trim();
            if (!filename.toLowerCase().endsWith('.json')) {
                filename += '.json';
            }

            const jsonString = JSON.stringify(currentJsonData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showTemporaryMessage(saveFeedback, `${filename} 파일이 성공적으로 저장되었습니다!`, 3000);
        } else {
            showTemporaryMessage(saveFeedback, '파일 저장이 취소되었습니다.', 3000);
        }

    } catch (e) {
        if(errorOutput) errorOutput.textContent = 'JSON 파일 저장 오류: ' + e.message;
        showConfirmationPopup({
            title: '파일 저장 오류',
            text: `JSON 데이터를 파일로 저장하는 중 오류가 발생했습니다: ${e.message}`,
            icon: 'error',
            showCancelButton: false,
            hotInstance: hotInstanceRefForPopups
        });
    }
}

function loadTemplatesFromFile() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';
    fileInput.style.display = 'none';

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const fileContent = e.target.result;
                const loadedTemplatesArray = JSON.parse(fileContent);
                if (!Array.isArray(loadedTemplatesArray)) {
                    throw new Error("템플릿 파일은 배열 형태여야 합니다.");
                }

                const count = templateManager.setAndSaveUserTemplates(loadedTemplatesArray);
                showTemporaryMessage(saveFeedback, `템플릿 파일 '${file.name}'에서 ${count}개의 사용자 템플릿을 로드했습니다.`, 3000);
            } catch (err) {
                if(errorOutput) errorOutput.textContent = `템플릿 파일 오류: ${err.message}`;
                showConfirmationPopup({
                    title: '템플릿 파일 로드 오류',
                    text: `템플릿 파일을 로드하거나 파싱하는 중 오류: ${err.message}`,
                    icon: 'error',
                    showCancelButton: false,
                    hotInstance: hotInstanceRefForPopups
                });
            }
        };
        reader.onerror = (e) => {
            if(errorOutput) errorOutput.textContent = '템플릿 파일을 읽는 중 오류가 발생했습니다.';
            showConfirmationPopup({
                title: '템플릿 파일 읽기 오류',
                text: '템플릿 파일을 읽는 중 오류가 발생했습니다.',
                icon: 'error',
                showCancelButton: false,
                hotInstance: hotInstanceRefForPopups
            });
        };
        reader.readAsText(file);
        document.body.removeChild(fileInput);
    });

    document.body.appendChild(fileInput);
    fileInput.click();
}

async function saveTemplatesToFile() {
    const userTemplates = templateManager.getUserTemplates();

    if (!userTemplates || userTemplates.length === 0) {
        showTemporaryMessage(saveFeedback, '저장할 사용자 정의 템플릿이 없습니다.', 3000);
        return;
    }

    try {
        const result = await showTextInputPopup({
            title: '템플릿 파일 이름 입력',
            inputLabel: '저장할 템플릿 파일 이름을 입력해주세요 (.json 확장자는 자동으로 추가됩니다):',
            inputValue: 'user_templates',
            confirmButtonText: '저장',
            inputValidator: (value) => {
                if (!value || value.trim().length === 0) {
                    return '파일 이름은 비워둘 수 없습니다.';
                }
                return null;
            },
            hotInstance: hotInstanceRefForPopups
        });

        if (result.isConfirmed && result.value) {
            let filename = result.value.trim();
            if (!filename.toLowerCase().endsWith('.json')) {
                filename += '.json';
            }

            const jsonString = JSON.stringify(userTemplates, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showTemporaryMessage(saveFeedback, `사용자 템플릿이 ${filename} 파일로 성공적으로 저장되었습니다!`, 3000);
        } else {
            showTemporaryMessage(saveFeedback, '템플릿 파일 저장이 취소되었습니다.', 3000);
        }

    } catch (e) {
        if(errorOutput) errorOutput.textContent = '템플릿 파일 저장 오류: ' + e.message;
        showConfirmationPopup({
            title: '템플릿 파일 저장 오류',
            text: `템플릿을 파일로 저장하는 중 오류가 발생했습니다: ${e.message}`,
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
    if (currentJsonData === null || currentJsonData === undefined) { return; }
    const keys = pathString.replace(/\[(\d+)\]/g, '.$1').split('.'); const lastKeyOrIndexString = keys.pop(); const parentPath = keys.join('.');
    let parentObject; if (parentPath === "") parentObject = currentJsonData; else parentObject = getObjectByPath(currentJsonData, parentPath);
    if (parentPath === "" && pathString === lastKeyOrIndexString && (typeof currentJsonData !== 'object' || currentJsonData === null)) {
        currentJsonData = convertToTypedValue(newValueString, currentJsonData); if (isBatchOperation) return; refreshTreeView(pathString);
        displayDataInTable(currentJsonData, 'value', currentJsonData, ''); return;
    }
    if (!parentObject || (typeof parentObject !== 'object' && !Array.isArray(parentObject))) {
        showConfirmationPopup({ title: '오류', text: '데이터 업데이트 중 오류가 발생했습니다 (부모 경로 확인 필요).', icon: 'error', showCancelButton: false, hotInstance: hotInstanceRefForPopups }); return;
    }
    const targetKeyOrIndex = /^\d+$/.test(lastKeyOrIndexString) && Array.isArray(parentObject) ? parseInt(lastKeyOrIndexString, 10) : lastKeyOrIndexString;
    if (Array.isArray(parentObject) && (targetKeyOrIndex < 0 || targetKeyOrIndex >= parentObject.length)) {
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
        getTemplates: templateManager.getTemplates,
        addTemplate: templateManager.addTemplate
    };
    hotInstanceRefForPopups = displayTableInHot(dataToDisplay, dataKeyNameToUse, configForTable);


    if (options.syncTreeView && treeViewContainer && dataPathStringToRecord !== undefined && dataPathStringToRecord !== null) {
        const targetNodeElement = treeViewContainer.querySelector(`.tree-node[data-path="${dataPathStringToRecord}"]`);
        if (targetNodeElement) {
            selectNode(targetNodeElement);
            setTimeout(() => {
                const finalTargetNode = treeViewContainer.querySelector(`.tree-node[data-path="${dataPathStringToRecord}"]`);
                if (finalTargetNode) {
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
            showConfirmationPopup({ title: '오류', text: '히스토리 복원 중 오류가 발생했습니다.', icon: 'error', showCancelButton: false, hotInstance: hotInstanceRefForPopups });
        } finally {
            historyManager.setNavigationInProgress(false);
        }
    }
}

document.addEventListener('DOMContentLoaded', initialLoad);