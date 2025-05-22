import { minifyJson, prettyJson } from './jsonUtils.js';
import {
    showJsonDiffPopup, showTextInputPopup, showConfirmationPopup, showCustomFormPopup,
    showUrlProcessPopup, showTemplateSelectionPopup, showTemplateContentPopup, showTemplateManagementPopup
} from './customPopup.js';
import {
    jsonInputField, saveFeedback, errorOutput, treeViewContainer, tableViewContainer,
    showTemporaryMessage, updateTableViewPathDisplay, resetBaseUI
} from './domUtils.js';
import { getObjectByPath, convertToTypedValue } from './dataUtils.js';
import { buildTree, selectNode, getSelectedNodePath, getExpandedNodePaths, expandNodesByPath } from './treeView.js';
import { applyValueStyleToNode } from './treeViewStyleUtils.js';
import { displayDataWithHandsontable as displayTableInHot, destroyHotInstance } from './tableViewHandsontable.js';
import * as historyManager from './historyManager.js';
import * as searchController from './searchController.js';
import * as templateManager from './templateManager.js';
import { initializeThemeSwitcher } from './theme-switcher.js';
import { initVisualSchemaEditor } from './visualSchemaEditor.js';

let currentJsonData = null;
let originalJsonDataAtLoad = null;
let searchInput, searchTargetSelect, searchResultsDropdown;
let hotInstanceRefForPopups = null;

const mainLayoutTriplePanel = document.querySelector('.main-layout-triple-panel');
const schemaEditorPanelContainer = document.getElementById('schemaEditorPanelContainer');
const toggleSchemaEditorBtn = document.getElementById('toggleSchemaEditorBtn');

let isSchemaEditorVisible = false;

function encodeUrlString(str) {
    if (typeof str !== 'string') { throw new TypeError('입력값은 문자열이어야 합니다.'); }
    try { return encodeURIComponent(str); }
    catch (e) { console.error("URL 인코딩 중 오류 발생:", e); throw e; }
}

function decodeUrlString(encodedStr) {
    if (typeof encodedStr !== 'string') { throw new TypeError('입력값은 문자열이어야 합니다.'); }
    try { return decodeURIComponent(encodedStr); }
    catch (e) { console.error("URL 디코딩 중 오류 발생:", e); throw e; }
}

async function openTemplateManagement() {
    const refreshManagementPopup = async (message = '', messageType = 'success') => {
        if (message && saveFeedback) showTemporaryMessage(saveFeedback, message, 2500, messageType);
        await new Promise(resolve => setTimeout(resolve, 50));
        openTemplateManagement();
    };

    const currentUserTemplates = templateManager.getUserTemplates();

    await showTemplateManagementPopup({
        userTemplates: currentUserTemplates,
        callbacks: {
            onViewRequest: async (templateName) => {
                const template = templateManager.getUserTemplates().find(t => t.name === templateName);
                if (template) {
                    await showTemplateContentPopup({
                        templateName: template.name,
                        templateValue: template.value,
                        hotInstance: hotInstanceRefForPopups
                    });
                }
                await refreshManagementPopup('템플릿 내용을 확인했습니다.', 'info');
            },
            onRenameRequest: async (oldName) => {
                const templateToRename = templateManager.getUserTemplates().find(t => t.name === oldName);
                if (!templateToRename) {
                    await refreshManagementPopup('변경할 템플릿을 찾지 못했습니다.', 'error');
                    return;
                }
                const renameResult = await showTextInputPopup({
                    title: `'${oldName}' 템플릿 이름 변경`,
                    inputLabel: '새로운 템플릿 이름을 입력하세요:',
                    inputValue: oldName,
                    confirmButtonText: '변경 저장',
                    inputValidator: (value) => {
                        const newName = value.trim();
                        if (!newName) return '템플릿 이름은 비워둘 수 없습니다.';
                        if (newName === oldName) return null;
                        if (templateManager.getTemplates().some(t => t.name === newName)) {
                            return `'${newName}' 이름은 이미 사용 중입니다.`;
                        }
                        return null;
                    },
                    hotInstance: hotInstanceRefForPopups
                });

                if (renameResult.isConfirmed && typeof renameResult.value === 'string') {
                    const newName = renameResult.value.trim();
                    if (newName === oldName) {
                        await refreshManagementPopup('이름이 변경되지 않았습니다.', 'info');
                        return;
                    }
                    const resultStatus = templateManager.renameUserTemplate(oldName, newName);
                    if (resultStatus === true) {
                        await refreshManagementPopup(`템플릿 '${oldName}'이(가) '${newName}'(으)로 변경되었습니다.`);
                    } else {
                        let errorMsg = '알 수 없는 오류로 이름 변경에 실패했습니다.';
                        if (resultStatus === 'empty_name') errorMsg = '새 템플릿 이름은 비워둘 수 없습니다.';
                        else if (resultStatus === 'not_found') errorMsg = `템플릿 '${oldName}'을(를) 찾을 수 없습니다.`;
                        else if (resultStatus === 'duplicate_name') errorMsg = `새 이름 '${newName}'은(는) 이미 사용 중입니다.`;
                        else if (resultStatus === 'default_conflict') errorMsg = `새 이름 '${newName}'은(는) 기본 템플릿 이름과 충돌합니다.`;
                        await showConfirmationPopup({title: '이름 변경 오류', text: errorMsg, icon: 'error', showCancelButton:false, hotInstance: hotInstanceRefForPopups});
                        await refreshManagementPopup('이름 변경 중 문제가 발생했습니다.', 'error');
                    }
                } else {
                    await refreshManagementPopup('이름 변경이 취소되었습니다.', 'info');
                }
            },
            onDeleteRequest: async (templateName) => {
                const confirmation = await showConfirmationPopup({
                    title: `'${templateName}' 템플릿 삭제`,
                    text: `정말로 '${templateName}' 템플릿을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`,
                    icon: 'warning', showCancelButton: true, confirmButtonText: '삭제', cancelButtonText: '취소',
                    hotInstance: hotInstanceRefForPopups
                });

                if (confirmation.isConfirmed) {
                    const success = templateManager.deleteUserTemplate(templateName);
                    if (success) {
                        await refreshManagementPopup(`템플릿 '${templateName}'이(가) 삭제되었습니다.`);
                    } else {
                        await showConfirmationPopup({title: '삭제 오류', text: `템플릿 '${templateName}' 삭제에 실패했습니다.`, icon: 'error', showCancelButton:false, hotInstance: hotInstanceRefForPopups});
                        await refreshManagementPopup('삭제 중 문제가 발생했습니다.', 'error');
                    }
                } else {
                    await refreshManagementPopup('삭제가 취소되었습니다.', 'info');
                }
            }
        },
        hotInstance: hotInstanceRefForPopups
    });
}

function showMainJsonEditorView() {
    if (mainLayoutTriplePanel) mainLayoutTriplePanel.style.display = 'flex';
    if (schemaEditorPanelContainer) schemaEditorPanelContainer.style.display = 'none';
    if (toggleSchemaEditorBtn) toggleSchemaEditorBtn.textContent = '📜 스키마 편집기';
    isSchemaEditorVisible = false;
}

function showSchemaEditorView() {
    if (mainLayoutTriplePanel) mainLayoutTriplePanel.style.display = 'none';
    if (schemaEditorPanelContainer) {
        schemaEditorPanelContainer.style.display = 'flex';

        const editorContentArea = document.getElementById('schema-editor-content-area');
        const mainSchemaTextarea = document.getElementById('jsonSchema');

        let initialSchemaForEditor = {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {},
            description: ""
        };
        if (mainSchemaTextarea && mainSchemaTextarea.value) {
            try {
                const parsedSchema = JSON.parse(mainSchemaTextarea.value);
                if (typeof parsedSchema === 'object' && parsedSchema !== null) {
                    initialSchemaForEditor = parsedSchema;
                } else {
                    console.warn("메인 스키마 텍스트 영역의 내용이 유효한 객체가 아니므로 기본 스키마로 초기화합니다.");
                }
            } catch (e) {
                console.warn("메인 스키마 텍스트 영역 파싱 실패, 기본 스키마로 시각적 편집기 초기화:", e.message);
            }
        }

        if(editorContentArea){
            initVisualSchemaEditor(editorContentArea, initialSchemaForEditor, (updatedSchema) => {
                if (mainSchemaTextarea) {
                    mainSchemaTextarea.value = JSON.stringify(updatedSchema, null, 2);
                }
            });
        } else {
            console.error("Schema editor content area ('schema-editor-content-area') not found.");
        }
    }
    if (toggleSchemaEditorBtn) toggleSchemaEditorBtn.textContent = 'JSON 편집기로 돌아가기';
    isSchemaEditorVisible = true;
}

function initialLoad() {
    const loadBtn = document.getElementById("loadBtn");
    if (loadBtn) loadBtn.addEventListener("click", loadJson);

    const saveBtn = document.getElementById("saveBtn");
    if (saveBtn) saveBtn.addEventListener('click', saveJson);

    const minifyBtn = document.getElementById("minifyBtn");
    if (minifyBtn) {
        minifyBtn.addEventListener("click", () => {
            if (jsonInputField && jsonInputField.value) {
                try { jsonInputField.value = minifyJson(jsonInputField.value); }
                catch (e) { if(errorOutput) errorOutput.textContent = 'Minify 오류: ' + e.message; }
            } else if (jsonInputField) { jsonInputField.value = ""; }
        });
    }

    const uglifyBtn = document.getElementById("uglifyBtn");
    if (uglifyBtn) {
        uglifyBtn.addEventListener("click", () => {
            if (jsonInputField && jsonInputField.value) {
                try { jsonInputField.value = prettyJson(jsonInputField.value); }
                catch (e) { if(errorOutput) errorOutput.textContent = 'Uglify(포맷팅) 오류: ' + e.message; }
            } else if (jsonInputField) { jsonInputField.value = ""; }
        });
    }

    const diffBtn = document.getElementById("diffBtn");
    if (diffBtn) {
        diffBtn.addEventListener('click', () => {
            if (!originalJsonDataAtLoad && !currentJsonData) {
                showConfirmationPopup({ title: '알림', text: '먼저 JSON 데이터를 로드해주세요.', icon: 'info', showCancelButton: false, hotInstance: hotInstanceRefForPopups }); return;
            }
            if (!originalJsonDataAtLoad) {
                showConfirmationPopup({ title: '알림', text: '로드 시점의 원본 JSON 데이터가 없습니다.', icon: 'info', showCancelButton: false, hotInstance: hotInstanceRefForPopups }); return;
            }
            const dataForDiffRight = currentJsonData === null ? {} : currentJsonData;
            showJsonDiffPopup({
                title: 'JSON 데이터 변경사항', jsonDiffData: { left: originalJsonDataAtLoad, right: dataForDiffRight },
                buttons: [{ text: '닫기', role: 'confirm' }], hotInstance: hotInstanceRefForPopups
            }).catch(error => {
                showConfirmationPopup({ title: '오류', text: '변경점 확인 중 오류가 발생했습니다.', icon: 'error', showCancelButton: false, hotInstance: hotInstanceRefForPopups });
            });
        });
    }

    const loadFromFileButton = document.getElementById("loadFromFileBtn");
    if (loadFromFileButton) loadFromFileButton.addEventListener("click", loadJsonFromFile);

    const saveToFileButton = document.getElementById("saveToFileBtn");
    if (saveToFileButton) saveToFileButton.addEventListener("click", saveJsonToFile);

    const saveToCSVButton = document.getElementById("saveToCSV");
    if (saveToCSVButton) saveToCSVButton.addEventListener("click", saveJsonToCSV);

    const loadFromCSVButton = document.getElementById("loadFromCSV");
    if (loadFromCSVButton) loadFromCSVButton.addEventListener("click", loadCsvFromFile);

    const loadTemplatesFromFileBtn = document.getElementById("loadTemplatesFromFileBtn");
    if (loadTemplatesFromFileBtn) loadTemplatesFromFileBtn.addEventListener("click", loadTemplatesFromFile);

    const saveTemplatesToFileBtn = document.getElementById("saveTemplatesToFileBtn");
    if (saveTemplatesToFileBtn) saveTemplatesToFileBtn.addEventListener("click", saveTemplatesToFile);

    const manageTemplatesBtn = document.getElementById("manageTemplatesBtn");
    if (manageTemplatesBtn) manageTemplatesBtn.addEventListener('click', openTemplateManagement);

    const encodeUrlBtn = document.getElementById("encodeUrlBtn");
    if (encodeUrlBtn) {
        encodeUrlBtn.addEventListener("click", async () => {
            const initialVal = jsonInputField ? jsonInputField.value : '';
            try {
                const result = await showUrlProcessPopup({
                    title: 'URL 인코딩', initialInputValue: initialVal, inputLabel: '인코딩할 원본 문자열:', outputLabel: '인코딩된 결과:', actionButtonText: '인코딩 실행',
                    onExecuteAction: (inputValue) => { try { return encodeUrlString(inputValue); } catch (e) { return `오류: ${e.message}`; } },
                    confirmButtonText: '결과를 메인 편집기에 복사', cancelButtonText: '팝업 닫기', hotInstance: hotInstanceRefForPopups
                });
                if (result.isConfirmed && result.formData && result.formData !== false) {
                    if (jsonInputField) { jsonInputField.value = result.formData; if(saveFeedback) showTemporaryMessage(saveFeedback, '결과가 메인 편집기에 복사되었습니다.', 2000); }
                } else if (result.isDismissed && result.dismiss === 'cancel') { if(saveFeedback) showTemporaryMessage(saveFeedback, 'URL 인코딩 작업창을 닫았습니다.', 1500, 'info'); }
            } catch (error) {
                if(errorOutput) errorOutput.textContent = 'URL 인코딩 팝업 오류: ' + error.message;
                if(saveFeedback) showTemporaryMessage(saveFeedback, 'URL 인코딩 팝업 처리 중 문제가 발생했습니다.', 3000, 'error');
            }
        });
    }

    const decodeUrlBtn = document.getElementById("decodeUrlBtn");
    if (decodeUrlBtn) {
        decodeUrlBtn.addEventListener("click", async () => {
            const initialVal = jsonInputField ? jsonInputField.value : '';
            try {
                const result = await showUrlProcessPopup({
                    title: 'URL 디코딩', initialInputValue: initialVal, inputLabel: '디코딩할 URL 인코딩된 문자열:', outputLabel: '디코딩된 결과:', actionButtonText: '디코딩 실행',
                    onExecuteAction: (inputValue) => { try { return decodeUrlString(inputValue); } catch (e) { return `오류: ${e.message}`; } },
                    confirmButtonText: '결과를 메인 편집기에 복사', cancelButtonText: '팝업 닫기', hotInstance: hotInstanceRefForPopups
                });
                if (result.isConfirmed && result.formData && result.formData !== false) {
                    if (jsonInputField) { jsonInputField.value = result.formData; if(saveFeedback) showTemporaryMessage(saveFeedback, '결과가 메인 편집기에 복사되었습니다.', 2000); }
                } else if (result.isDismissed && result.dismiss === 'cancel') { if(saveFeedback) showTemporaryMessage(saveFeedback, 'URL 디코딩 작업창을 닫았습니다.', 1500, 'info'); }
            } catch (error) {
                if(errorOutput) errorOutput.textContent = 'URL 디코딩 팝업 오류: ' + error.message;
                if(saveFeedback) showTemporaryMessage(saveFeedback, 'URL 디코딩 팝업 처리 중 문제가 발생했습니다.', 3000, 'error');
            }
        });
    }

    searchInput = document.getElementById('searchInput');
    searchTargetSelect = document.getElementById('searchTargetSelect');
    searchResultsDropdown = document.getElementById('searchResultsDropdown');

    if (searchInput) searchInput.addEventListener('input', handleSearchInput);
    if (searchTargetSelect) searchTargetSelect.addEventListener('change', handleSearchInput);

    document.addEventListener('click', (event) => {
        if (searchResultsDropdown && searchInput && !searchInput.contains(event.target) && !searchResultsDropdown.contains(event.target)) {
            searchResultsDropdown.style.display = 'none';
        }
    });
    if (searchResultsDropdown) searchResultsDropdown.addEventListener('click', (event) => event.stopPropagation());

    window.addEventListener('mouseup', (event) => {
        if (event.button === 3 || event.button === 4) {
            event.preventDefault();
            if (event.button === 3) navigateHistory('back');
            else if (event.button === 4) navigateHistory('forward');
        }
    });
    window.addEventListener('contextmenu', (event) => { event.preventDefault(); });

    const jsonControlPanel = document.querySelector('.json-control-panel');
    if (jsonControlPanel) {
        jsonControlPanel.addEventListener('dragover', handleDragOver);
        jsonControlPanel.addEventListener('dragleave', handleDragLeave);
        jsonControlPanel.addEventListener('drop', handleFileDrop);
    } else { console.warn('.json-control-panel 요소를 찾을 수 없어 드래그앤드롭 기능을 활성화할 수 없습니다.'); }

    const panelContainer = document.querySelector('.main-layout-triple-panel');
    const panels = [ document.querySelector('.json-control-panel'), document.querySelector('.tree-view-panel'), document.querySelector('.table-view-panel') ];
    const resizers = [ document.getElementById('resizer-1'), document.getElementById('resizer-2') ];

    if (panelContainer && panels.every(p => p) && resizers.every(r => r)) {
        setInitialPanelWidths(panelContainer, panels, resizers);
        window.addEventListener('resize', () => setInitialPanelWidths(panelContainer, panels, resizers));
        resizers.forEach((resizer, index) => {
            let isResizing = false; let startX = 0; let initialWidths = [];
            resizer.addEventListener('mousedown', (e) => {
                e.preventDefault(); isResizing = true; startX = e.clientX; initialWidths = [panels[index].offsetWidth, panels[index + 1].offsetWidth];
                document.addEventListener('mousemove', handleMouseMove); document.addEventListener('mouseup', handleMouseUp);
            });
            function handleMouseMove(e) {
                if (!isResizing) return; const deltaX = e.clientX - startX; const minPanelWidth = 50;
                let newLeftWidth = initialWidths[0] + deltaX; let newRightWidth = initialWidths[1] - deltaX;
                if (newLeftWidth < minPanelWidth) { newLeftWidth = minPanelWidth; newRightWidth = initialWidths[0] + initialWidths[1] - newLeftWidth; }
                if (newRightWidth < minPanelWidth) { newRightWidth = minPanelWidth; newLeftWidth = initialWidths[0] + initialWidths[1] - newRightWidth; }
                panels[index].style.flexBasis = `${newLeftWidth}px`; panels[index + 1].style.flexBasis = `${newRightWidth}px`;
            }
            function handleMouseUp() {
                if (!isResizing) return; isResizing = false;
                document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp);
            }
        });
    } else { console.warn('3-패널 레이아웃에 필요한 요소를 모두 찾을 수 없습니다. 리사이저가 동작하지 않을 수 있습니다.'); }

    if (toggleSchemaEditorBtn) {
        toggleSchemaEditorBtn.addEventListener('click', () => {
            if (isSchemaEditorVisible) {
                showMainJsonEditorView();
            } else {
                showSchemaEditorView();
            }
        });
    }

    initializeThemeSwitcher();
}

function handleDragOver(event) {
    event.preventDefault(); event.stopPropagation();
    if (event.currentTarget && typeof event.currentTarget.classList !== 'undefined') event.currentTarget.classList.add('dragover-active');
    event.dataTransfer.dropEffect = 'copy';
}

function handleDragLeave(event) {
    event.preventDefault(); event.stopPropagation();
    if (event.currentTarget && typeof event.currentTarget.classList !== 'undefined') event.currentTarget.classList.remove('dragover-active');
}

function handleFileDrop(event) {
    event.preventDefault(); event.stopPropagation();
    if (event.currentTarget && typeof event.currentTarget.classList !== 'undefined') event.currentTarget.classList.remove('dragover-active');
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        if (file.type === "application/json" || file.name.toLowerCase().endsWith('.json')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const fileContent = e.target.result;
                    if (jsonInputField) {
                        jsonInputField.value = fileContent; loadJson();
                        showTemporaryMessage(saveFeedback, `${file.name} 파일이 드롭되어 로드되었습니다.`, 3000);
                    } else { showConfirmationPopup({ title: '오류', text: 'JSON 입력 필드를 찾을 수 없습니다.', icon: 'error', showCancelButton: false, hotInstance: hotInstanceRefForPopups }); }
                } catch (err) {
                    if(errorOutput) errorOutput.textContent = `파일 오류 (드롭): ${err.message}`;
                    showConfirmationPopup({ title: '파일 로드 오류 (드롭)', text: `파일을 로드하거나 파싱하는 중 오류가 발생했습니다: ${err.message}`, icon: 'error', showCancelButton: false, hotInstance: hotInstanceRefForPopups });
                }
            };
            reader.onerror = () => {
                if(errorOutput) errorOutput.textContent = '파일을 읽는 중 오류가 발생했습니다 (드롭).';
                showConfirmationPopup({ title: '파일 읽기 오류 (드롭)', text: '파일을 읽는 중 오류가 발생했습니다.', icon: 'error', showCancelButton: false, hotInstance: hotInstanceRefForPopups });
            };
            reader.readAsText(file);
        } else { showConfirmationPopup({ title: '잘못된 파일 타입', text: 'JSON 파일(.json)만 드롭해주세요.', icon: 'warning', showCancelButton: false, hotInstance: hotInstanceRefForPopups }); }
    }
}

function setInitialPanelWidths(container, panelsArray, resizersArray) {
    const containerWidth = container.offsetWidth;
    const totalResizerWidth = resizersArray.reduce((sum, r) => sum + r.offsetWidth, 0);
    const availableWidth = containerWidth - totalResizerWidth;
    const ratios = [0.15, 0.15, 0.70];
    const minW = 50;

    if (availableWidth > 0) {
        let w1 = Math.max(minW, Math.floor(availableWidth * ratios[0]));
        let w2 = Math.max(minW, Math.floor(availableWidth * ratios[1]));
        let w3 = Math.max(minW, availableWidth - w1 - w2); // w3는 w1, w2 결정 후 남은 공간으로 초기 계산

        // 너비의 합이 사용 가능한 전체 너비를 초과하는 경우 조정
        if (w1 + w2 + w3 > availableWidth) {
            // w3를 먼저 사용 가능한 공간에 맞게 재조정
            w3 = availableWidth - w1 - w2;
            if (w3 < minW) { // 재조정된 w3가 최소 너비보다 작으면
                w3 = minW; // w3를 최소 너비로 설정
                const remaining = availableWidth - w3; // w1과 w2에 할당할 수 있는 남은 너비

                // w1과 w2를 원래 비율에 따라 남은 공간에 분배
                w1 = Math.floor(remaining * (ratios[0] / (ratios[0] + ratios[1])));
                w2 = remaining - w1;

                // w1이 최소 너비보다 작으면 조정
                if (w1 < minW) {
                    w1 = minW;
                    w2 = remaining - w1; // w2를 다시 계산
                }
                // w2가 최소 너비보다 작으면 조정 (이때 w1도 다시 계산해야 함)
                if (w2 < minW) {
                    w2 = minW;
                    // 수정된 부분: w1을 w2가 설정된 후 남은 공간으로 올바르게 재계산
                    w1 = remaining - w2;
                }
            }
        }
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
    if (params && typeof displayDataInTable === 'function' && params.data !== undefined) {
        displayDataInTable(params.data, params.dataKeyName, params.rootJsonData, params.dataPathString || '');
        if (searchResultsDropdown) searchResultsDropdown.style.display = 'none';
    }
}

function parseCsvLine(line) {
    const values = []; let currentVal = ""; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') { if (inQuotes && i + 1 < line.length && line[i + 1] === '"') { currentVal += '"'; i++; } else { inQuotes = !inQuotes; } }
        else if (char === ',' && !inQuotes) { values.push(currentVal); currentVal = ""; }
        else { currentVal += char; }
    }
    values.push(currentVal); return values;
}

function autoTypeConvert(value) {
    if (typeof value !== 'string') return value;
    const trimmedValue = value.trim();
    if (trimmedValue.toLowerCase() === 'null') return null;
    if (trimmedValue.toLowerCase() === 'true') return true;
    if (trimmedValue.toLowerCase() === 'false') return false;
    if (trimmedValue === "") return null;
    if (trimmedValue !== '' && !isNaN(Number(trimmedValue))) {
        if (trimmedValue.includes('.') || /^-?\d+$/.test(trimmedValue) || String(Number(trimmedValue)) === trimmedValue.replace(/^0+(?=\d)/, '')) {
            return Number(trimmedValue);
        }
    }
    if ((trimmedValue.startsWith('[') && trimmedValue.endsWith(']')) || (trimmedValue.startsWith('{') && trimmedValue.endsWith('}'))) {
        try { return JSON.parse(trimmedValue); } catch (e) { return trimmedValue; }
    }
    return trimmedValue;
}

function convertCsvToJson(csvString) {
    const allLines = csvString.trim().split(/\r\n|\n|\r/); if (allLines.length === 0) return [];
    let headerLineIndex = -1; for (let i = 0; i < allLines.length; i++) { if (allLines[i].trim() !== "") { headerLineIndex = i; break; } }
    if (headerLineIndex === -1) return [];
    let headers = parseCsvLine(allLines[headerLineIndex]).map((h, index) => { const trimmedHeader = h.trim(); return trimmedHeader === "" ? `column_${index + 1}` : trimmedHeader; });
    const trimmedLowerHeaders = headers.map(h => h.toLowerCase());
    const keyColumnNames = ['key', 'property', 'name', 'field', 'item']; const valueColumnName = 'value';
    const isKeyValueCsv = headers.length === 2 && keyColumnNames.includes(trimmedLowerHeaders[0]) && trimmedLowerHeaders[1] === valueColumnName;

    if (isKeyValueCsv) {
        const singleJsonObject = {};
        for (let i = headerLineIndex + 1; i < allLines.length; i++) {
            const currentLine = allLines[i]; if (currentLine.trim() === "") continue;
            const values = parseCsvLine(currentLine); if (values.every(v => v.trim() === "")) continue;
            if (values.length >= 2) { const key = values[0].trim(); if (key === "") continue; const rawValue = values[1]; singleJsonObject[key] = autoTypeConvert(rawValue); }
        }
        return singleJsonObject;
    } else {
        const jsonData = [];
        for (let i = headerLineIndex + 1; i < allLines.length; i++) {
            const currentLine = allLines[i]; if (currentLine.trim() === "") continue;
            const values = parseCsvLine(currentLine); if (values.every(v => v.trim() === "")) continue;
            const entry = {}; let rowHasMeaningfulData = false; const maxIteration = Math.max(headers.length, values.length);
            for (let j = 0; j < maxIteration; j++) {
                const key = (j < headers.length && headers[j]) ? headers[j] : `column_${j + 1}`;
                const rawValue = values[j] !== undefined ? values[j] : ""; const typedValue = autoTypeConvert(rawValue);
                entry[key] = typedValue; if (typedValue !== null && String(typedValue).trim() !== "") rowHasMeaningfulData = true;
            }
            if (rowHasMeaningfulData) jsonData.push(entry);
        }
        return jsonData;
    }
}

async function loadCsvFromFile() {
    const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = '.csv,text/csv'; fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) { if (fileInput.parentNode) fileInput.remove(); return; }
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const csvContent = e.target.result; const conversionResult = convertCsvToJson(csvContent);
                let finalJsonDataToLoad; let feedbackMessage = `${file.name} CSV 로드 완료.`;
                if (Array.isArray(conversionResult)) {
                    if (conversionResult.length > 0) {
                        finalJsonDataToLoad = conversionResult[0];
                        if (conversionResult.length > 1) feedbackMessage = `${file.name} CSV 로드됨 (주의: 여러 레코드 중 첫 번째만 표시).`;
                    } else { finalJsonDataToLoad = []; }
                } else if (typeof conversionResult === 'object' && conversionResult !== null) {
                    finalJsonDataToLoad = conversionResult; feedbackMessage = `${file.name} Key-Value CSV가 단일 JSON 객체로 로드되었습니다.`;
                } else { finalJsonDataToLoad = {}; feedbackMessage = `${file.name} CSV 변환 중 예상치 못한 결과.`; }
                const jsonString = JSON.stringify(finalJsonDataToLoad, null, 2);
                if (jsonInputField) { jsonInputField.value = jsonString; loadJson(); showTemporaryMessage(saveFeedback, feedbackMessage, 5000); }
                else { showConfirmationPopup({ title: '오류', text: 'JSON 입력 필드를 찾을 수 없습니다.', icon: 'error', showCancelButton:false, hotInstance: hotInstanceRefForPopups }); }
            } catch (err) {
                if (errorOutput) errorOutput.textContent = `CSV 파일 파싱 오류: ${err.message}`;
                showConfirmationPopup({ title: 'CSV 파일 파싱 오류', text: `CSV 파일을 JSON으로 변환 중 오류: ${err.message}`, icon: 'error', showCancelButton:false, hotInstance: hotInstanceRefForPopups });
            } finally { if (fileInput.parentNode) fileInput.remove(); }
        };
        reader.onerror = () => {
            if(errorOutput) errorOutput.textContent = 'CSV 파일을 읽는 중 오류.';
            showConfirmationPopup({ title: 'CSV 파일 읽기 오류', text: 'CSV 파일을 읽는 중 오류가 발생했습니다.', icon: 'error', showCancelButton:false, hotInstance: hotInstanceRefForPopups });
            if (fileInput.parentNode) fileInput.remove();
        };
        reader.readAsText(file);
    });
    fileInput.click();
}

function convertJsonToCSV(jsonData) {
    if (jsonData === null || jsonData === undefined) throw new Error("데이터가 없어 CSV로 변환할 수 없습니다.");
    let csvString = "";
    const escapeCSVValue = (value) => {
        if (value === null || value === undefined) return ""; let stringValue;
        if (typeof value === 'object') { stringValue = JSON.stringify(value); } else { stringValue = String(value); }
        if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('\r') || stringValue.includes('"')) {
            stringValue = '"' + stringValue.replace(/"/g, '""') + '"';
        } return stringValue;
    };
    if (Array.isArray(jsonData)) {
        if (jsonData.length === 0) return "";
        if (typeof jsonData[0] === 'object' && jsonData[0] !== null && !Array.isArray(jsonData[0])) {
            const headers = [];
            jsonData.forEach(obj => { if (typeof obj === 'object' && obj !== null) { Object.keys(obj).forEach(key => { if (!headers.includes(key)) headers.push(key); }); } });
            if (headers.length > 0) csvString += headers.map(escapeCSVValue).join(',') + '\r\n';
            else {
                if (jsonData.every(item => typeof item !== 'object' || item === null)) {
                    csvString += "value\r\n"; jsonData.forEach(item => { csvString += escapeCSVValue(item) + '\r\n'; }); return csvString;
                }
            }
            jsonData.forEach(obj => {
                if (typeof obj === 'object' && obj !== null) { const row = headers.map(header => escapeCSVValue(obj[header])); csvString += row.join(',') + '\r\n'; }
                else { const row = headers.map(() => escapeCSVValue(null)); csvString += row.join(',') + '\r\n'; }
            });
        } else { csvString += "value\r\n"; jsonData.forEach(item => { csvString += escapeCSVValue(item) + '\r\n'; }); }
    } else if (typeof jsonData === 'object' && jsonData !== null) {
        csvString += "key,value\r\n"; Object.keys(jsonData).forEach(key => { csvString += escapeCSVValue(key) + ',' + escapeCSVValue(jsonData[key]) + '\r\n'; });
    } else { csvString += "value\r\n"; csvString += escapeCSVValue(jsonData) + '\r\n'; }
    return csvString;
}

async function saveJsonToCSV() {
    if (currentJsonData === null || currentJsonData === undefined) { showTemporaryMessage(saveFeedback, '저장할 JSON 데이터가 없습니다.', 3000); return; }
    try {
        const result = await showTextInputPopup({
            title: 'CSV 파일 이름 입력', inputLabel: '저장할 파일 이름을 입력해주세요 (.csv 확장자는 자동으로 추가됩니다):', inputValue: 'data', confirmButtonText: '저장',
            inputValidator: (value) => { if (!value || value.trim().length === 0) return '파일 이름은 비워둘 수 없습니다.'; return null; },
            hotInstance: hotInstanceRefForPopups
        });
        if (result.isConfirmed && result.value) {
            let filename = result.value.trim(); if (!filename.toLowerCase().endsWith('.csv')) filename += '.csv';
            const csvString = convertJsonToCSV(currentJsonData);
            const BOM = "\uFEFF"; // BOM for UTF-8 for Excel compatibility
            const blob = new Blob([BOM + csvString], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob); const a = document.createElement('a');
            a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
            showTemporaryMessage(saveFeedback, `${filename} 파일이 성공적으로 CSV로 저장되었습니다!`, 3000);
        } else { showTemporaryMessage(saveFeedback, 'CSV 파일 저장이 취소되었습니다.', 3000); }
    } catch (e) {
        if(errorOutput) errorOutput.textContent = 'CSV 파일 저장/변환 오류: ' + e.message;
        showConfirmationPopup({ title: 'CSV 저장/변환 오류', text: `JSON 데이터를 CSV로 저장/변환 중 오류: ${e.message}`, icon: 'error', showCancelButton:false, hotInstance: hotInstanceRefForPopups });
    }
}

function loadJsonFromFile() {
    const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = '.json,application/json'; fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) { if (fileInput.parentNode) fileInput.remove(); return; }
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const fileContent = e.target.result;
                if (jsonInputField) { jsonInputField.value = fileContent; loadJson(); showTemporaryMessage(saveFeedback, `${file.name} 파일이 로드되었습니다.`, 3000); }
                else { showConfirmationPopup({ title: '오류', text: 'JSON 입력 필드를 찾을 수 없습니다.', icon: 'error', showCancelButton:false, hotInstance: hotInstanceRefForPopups }); }
            } catch (err) {
                if(errorOutput) errorOutput.textContent = `파일 오류: ${err.message}`;
                showConfirmationPopup({ title: '파일 로드 오류', text: `파일을 로드하거나 파싱하는 중 오류: ${err.message}`, icon: 'error', showCancelButton:false, hotInstance: hotInstanceRefForPopups });
            } finally { if (fileInput.parentNode) fileInput.remove(); }
        };
        reader.onerror = () => {
            if(errorOutput) errorOutput.textContent = '파일을 읽는 중 오류.';
            showConfirmationPopup({ title: '파일 읽기 오류', text: '파일을 읽는 중 오류가 발생했습니다.', icon: 'error', showCancelButton:false, hotInstance: hotInstanceRefForPopups });
            if (fileInput.parentNode) fileInput.remove();
        };
        reader.readAsText(file);
    });
    fileInput.click();
}

async function saveJsonToFile() {
    if (currentJsonData === null || currentJsonData === undefined) { showTemporaryMessage(saveFeedback, '저장할 JSON 데이터가 없습니다.', 3000); return; }
    try {
        const result = await showTextInputPopup({
            title: '파일 이름 입력', inputLabel: '저장할 파일 이름을 입력해주세요 (.json 확장자는 자동으로 추가됩니다):', inputValue: 'data', confirmButtonText: '저장',
            inputValidator: (value) => { if (!value || value.trim().length === 0) return '파일 이름은 비워둘 수 없습니다.'; return null; },
            hotInstance: hotInstanceRefForPopups
        });
        if (result.isConfirmed && result.value) {
            let filename = result.value.trim(); if (!filename.toLowerCase().endsWith('.json')) filename += '.json';
            const jsonString = JSON.stringify(currentJsonData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' }); const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
            showTemporaryMessage(saveFeedback, `${filename} 파일이 성공적으로 저장되었습니다!`, 3000);
        } else { showTemporaryMessage(saveFeedback, '파일 저장이 취소되었습니다.', 3000); }
    } catch (e) {
        if(errorOutput) errorOutput.textContent = 'JSON 파일 저장 오류: ' + e.message;
        showConfirmationPopup({ title: '파일 저장 오류', text: `JSON 데이터를 파일로 저장 중 오류: ${e.message}`, icon: 'error', showCancelButton:false, hotInstance: hotInstanceRefForPopups });
    }
}

async function loadTemplatesFromFile() {
    const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = '.json,application/json'; fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    fileInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) { if (fileInput.parentNode) fileInput.remove(); return; }
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const fileContent = e.target.result;
                const loadedTemplatesArray = JSON.parse(fileContent);
                if (!Array.isArray(loadedTemplatesArray)) throw new Error("템플릿 파일은 배열 형태여야 합니다.");

                const existingUserNames = templateManager.getUserTemplates().map(t => t.name);

                const popupResult = await showTemplateSelectionPopup({
                    title: `'${file.name}' 파일에서 템플릿 불러오기`, templates: loadedTemplatesArray,
                    message: '아래 목록에서 불러올 템플릿을 선택하세요. <span style="color: var(--color-warning, orange); font-weight:bold;">(덮어씀)</span> 표시는 이름이 같은 기존 사용자 템플릿을 이 파일의 내용으로 변경함을 의미합니다.',
                    confirmButtonText: '선택한 템플릿 불러오기', cancelButtonText: '취소',
                    hotInstance: hotInstanceRefForPopups, existingUserTemplateNames: existingUserNames
                });

                if (popupResult.isConfirmed) {
                    if (popupResult.selectedTemplates.length > 0) {
                        const count = templateManager.loadSelectedUserTemplates(popupResult.selectedTemplates);
                        showTemporaryMessage(saveFeedback, `선택된 ${count}개의 사용자 템플릿을 '${file.name}'에서 로드 및 병합했습니다.`, 3000);
                    } else { showTemporaryMessage(saveFeedback, '선택된 템플릿이 없어 아무것도 로드하지 않았습니다.', 3000, 'info'); }
                } else { showTemporaryMessage(saveFeedback, '템플릿 파일 로드가 취소되었습니다.', 3000, 'info'); }
            } catch (err) {
                if(errorOutput) errorOutput.textContent = `템플릿 파일 처리 오류: ${err.message}`;
                showConfirmationPopup({ title: '템플릿 파일 처리 오류', text: `템플릿 파일을 처리하는 중 오류: ${err.message}`, icon: 'error', showCancelButton:false, hotInstance: hotInstanceRefForPopups });
            } finally { if (fileInput.parentNode) fileInput.remove(); }
        };
        reader.onerror = () => {
            if(errorOutput) errorOutput.textContent = '템플릿 파일을 읽는 중 오류.';
            showConfirmationPopup({ title: '파일 읽기 오류', text: '템플릿 파일을 읽는 중 오류가 발생했습니다.', icon: 'error', showCancelButton:false, hotInstance: hotInstanceRefForPopups });
            if (fileInput.parentNode) fileInput.remove();
        };
        reader.readAsText(file);
    });
    fileInput.click();
}

async function saveTemplatesToFile() {
    const userTemplates = templateManager.getUserTemplates();
    if (!userTemplates || userTemplates.length === 0) { showTemporaryMessage(saveFeedback, '저장할 사용자 정의 템플릿이 없습니다.', 3000, 'info'); return; }
    try {
        const popupResult = await showTemplateSelectionPopup({
            title: '파일로 저장할 템플릿 선택', templates: userTemplates, message: '파일로 저장할 사용자 정의 템플릿을 선택하세요.',
            confirmButtonText: '선택한 템플릿 저장하기', cancelButtonText: '취소', hotInstance: hotInstanceRefForPopups
        });

        if (popupResult.isConfirmed && popupResult.selectedTemplates.length > 0) {
            const selectedUserTemplatesToSave = popupResult.selectedTemplates.map(({ name, type, value }) => ({ name, type, value }));
            const filenameResult = await showTextInputPopup({
                title: '템플릿 파일 이름 입력', inputLabel: '저장할 템플릿 파일 이름을 입력해주세요 (.json 확장자는 자동으로 추가됩니다):',
                inputValue: 'user_templates', confirmButtonText: '저장',
                inputValidator: (value) => { if (!value || value.trim().length === 0) return '파일 이름은 비워둘 수 없습니다.'; return null; },
                hotInstance: hotInstanceRefForPopups
            });
            if (filenameResult.isConfirmed && filenameResult.value) {
                let filename = filenameResult.value.trim(); if (!filename.toLowerCase().endsWith('.json')) filename += '.json';
                const jsonString = JSON.stringify(selectedUserTemplatesToSave, null, 2);
                const blob = new Blob([jsonString], { type: 'application/json' }); const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
                showTemporaryMessage(saveFeedback, `선택된 사용자 템플릿이 ${filename} 파일로 성공적으로 저장되었습니다!`, 3000);
            } else { showTemporaryMessage(saveFeedback, '템플릿 파일 이름 입력이 취소되어 저장이 중단되었습니다.', 3000, 'info'); }
        } else if (popupResult.isConfirmed && popupResult.selectedTemplates.length === 0 ) {
            showTemporaryMessage(saveFeedback, '선택된 템플릿이 없어 아무것도 저장하지 않았습니다.', 3000, 'info');
        } else if (popupResult.isDismissed) {
            showTemporaryMessage(saveFeedback, '템플릿 파일 저장이 취소되었습니다.', 3000, 'info');
        }
    } catch (e) {
        if(errorOutput) errorOutput.textContent = '템플릿 파일 저장 오류: ' + e.message;
        showConfirmationPopup({ title: '템플릿 파일 저장 오류', text: `템플릿을 파일로 저장하는 중 오류: ${e.message}`, icon: 'error', showCancelButton:false, hotInstance: hotInstanceRefForPopups });
    }
}

function loadJson() {
    resetUI(); historyManager.clearHistory();
    try {
        const jsonString = jsonInputField.value.trim();
        if (!jsonString) { currentJsonData = null; originalJsonDataAtLoad = null; updateTableViewPathDisplay(null, handlePathSegmentClicked); destroyHotInstanceAndUpdateRef(); return; }
        currentJsonData = JSON.parse(jsonString); originalJsonDataAtLoad = JSON.parse(JSON.stringify(currentJsonData)); // Deep copy for diff
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
    if (!Object.prototype.hasOwnProperty.call(parentObject, oldKey)) { showConfirmationPopup({ title: '오류', text: `기존 키 "${oldKey}"를 찾을 수 없습니다.`, icon: 'error', showCancelButton: false, hotInstance: hotInstanceRefForPopups }); return; }
    if (newKey === oldKey) { showConfirmationPopup({icon: 'info', title: '알림', text: '키 이름에 변경사항이 없습니다.', showCancelButton: false, hotInstance: hotInstanceRefForPopups}); return; }
    if (Object.prototype.hasOwnProperty.call(parentObject,newKey)) { showConfirmationPopup({ title: '오류', text: `새 키 "${newKey}"가 이미 현재 객체에 존재합니다.`, icon: 'error', showCancelButton: false, hotInstance: hotInstanceRefForPopups }); return; }
    const newOrderedObject = {}; const valueToMove = parentObject[oldKey];
    for (const currentKeyInLoop in parentObject) if (Object.prototype.hasOwnProperty.call(parentObject,currentKeyInLoop)) { if (currentKeyInLoop === oldKey) newOrderedObject[newKey] = valueToMove; else newOrderedObject[currentKeyInLoop] = parentObject[currentKeyInLoop]; }
    for (const keyInParent in parentObject) if (Object.prototype.hasOwnProperty.call(parentObject,keyInParent)) delete parentObject[keyInParent];
    for (const keyInNewOrder in newOrderedObject) if (Object.prototype.hasOwnProperty.call(newOrderedObject,keyInNewOrder)) parentObject[keyInNewOrder] = newOrderedObject[keyInNewOrder];
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