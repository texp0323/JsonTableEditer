import { minifyJson, prettyJson } from './jsonUtils.js';
import { showJsonDiffPopup, showTextInputPopup, showConfirmationPopup, showUrlProcessPopup } from './customPopup.js';
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
            showJsonDiffPopup({ //
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

    // Add this for the new CSV button
    const saveToCSVButton = document.getElementById("saveToCSV"); //
    if (saveToCSVButton) {
        saveToCSVButton.addEventListener("click", saveJsonToCSV);
    }
    // Add event listener for the new "Load CSV" button
    const loadFromCSVButton = document.getElementById("loadFromCSV");
    if (loadFromCSVButton) {
        loadFromCSVButton.addEventListener("click", loadCsvFromFile);
    }

    // End of CSV button addition

    const loadTemplatesFromFileBtn = document.getElementById("loadTemplatesFromFileBtn");
    if (loadTemplatesFromFileBtn) {
        loadTemplatesFromFileBtn.addEventListener("click", loadTemplatesFromFile);
    }

    const saveTemplatesToFileBtn = document.getElementById("saveTemplatesToFileBtn");
    if (saveTemplatesToFileBtn) {
        saveTemplatesToFileBtn.addEventListener("click", saveTemplatesToFile);
    }

    // ... (rest of the existing initialLoad function)
    searchInput = document.getElementById('searchInput'); //
    searchTargetSelect = document.getElementById('searchTargetSelect'); //
    searchResultsDropdown = document.getElementById('searchResultsDropdown'); //

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
        if (event.button === 3 || event.button === 4) { // Mouse back/forward buttons
            event.preventDefault();
            if (event.button === 3) { // Back button
                navigateHistory('back');
            } else if (event.button === 4) { // Forward button
                navigateHistory('forward');
            }
        }
    });
    window.addEventListener('contextmenu', (event) => { // Prevent default context menu
        event.preventDefault();
    });

    const jsonControlPanel = document.querySelector('.json-control-panel'); //
    if (jsonControlPanel) {
        jsonControlPanel.addEventListener('dragover', handleDragOver);
        jsonControlPanel.addEventListener('dragleave', handleDragLeave);
        jsonControlPanel.addEventListener('drop', handleFileDrop);
    } else {
        console.warn('.json-control-panel 요소를 찾을 수 없어 드래그앤드롭 기능을 활성화할 수 없습니다.');
    }

    const panelContainer = document.querySelector('.main-layout-triple-panel'); //
    const panels = [
        document.querySelector('.json-control-panel'), //
        document.querySelector('.tree-view-panel'), //
        document.querySelector('.table-view-panel') //
    ];
    const resizers = [
        document.getElementById('resizer-1'), //
        document.getElementById('resizer-2') //
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

    const encodeUrlBtn = document.getElementById("encodeUrlBtn");
    if (encodeUrlBtn) {
        encodeUrlBtn.addEventListener("click", async () => {
            const initialVal = jsonInputField ? jsonInputField.value : '';
            try {
                const result = await showUrlProcessPopup({
                    title: 'URL 인코딩',
                    initialInputValue: initialVal,
                    inputLabel: '인코딩할 원본 문자열:',
                    outputLabel: '인코딩된 결과:',
                    actionButtonText: '인코딩 실행',
                    onExecuteAction: (inputValue) => {
                        try {
                            return encodeUrlString(inputValue);
                        } catch (e) {
                            console.error("encodeUrlString 함수 실행 중 오류:", e);
                            return `오류: ${e.message}`;
                        }
                    },
                    confirmButtonText: '결과를 메인 편집기에 복사',
                    cancelButtonText: '팝업 닫기',
                    hotInstance: hotInstanceRefForPopups
                });

                if (result.isConfirmed && result.formData && result.formData !== false) {
                    const outputValue = result.formData;
                    if (jsonInputField) {
                        jsonInputField.value = outputValue;
                        if(saveFeedback) showTemporaryMessage(saveFeedback, '결과가 메인 편집기에 복사되었습니다.', 2000);
                    }
                } else if (result.isDismissed && result.dismiss === 'cancel') { // 여기가 중요! Swal.DismissReason.cancel 대신 'cancel' 문자열로 직접 비교
                    if(saveFeedback) showTemporaryMessage(saveFeedback, '인코딩 팝업을 닫았습니다.', 1500, 'info');
                } else if (result.isConfirmed && result.formData === false) {
                    // preConfirm이 false를 반환하여 팝업이 닫히지 않은 경우
                }

            } catch (error) {
                // 이 catch 블록은 showUrlProcessPopup 자체에서 발생한 예외 또는 promise 거부 시 실행됩니다.
                console.error("URL 인코딩 팝업 처리 중 오류:", error); // 여기서 error 객체가 ReferenceError("Swal is not defined") 였던 것입니다.
                if(errorOutput) errorOutput.textContent = 'URL 인코딩 팝업 오류: ' + error.message;
                if(saveFeedback) showTemporaryMessage(saveFeedback, 'URL 인코딩 팝업을 여는 중 문제가 발생했습니다.', 3000, 'error');
            }
        });
    }

    const decodeUrlBtn = document.getElementById("decodeUrlBtn");
    if (decodeUrlBtn) {
        decodeUrlBtn.addEventListener("click", async () => {
            const initialVal = jsonInputField ? jsonInputField.value : '';
            try {
                const result = await showUrlProcessPopup({
                    title: 'URL 디코딩',
                    initialInputValue: initialVal,
                    inputLabel: '디코딩할 URL 인코딩된 문자열:',
                    outputLabel: '디코딩된 결과:',
                    actionButtonText: '디코딩 실행',
                    onExecuteAction: (inputValue) => {
                        try {
                            return decodeUrlString(inputValue);
                        } catch (e) {
                            console.error("decodeUrlString 함수 실행 중 오류:", e);
                            return `오류: ${e.message}`;
                        }
                    },
                    confirmButtonText: '결과를 메인 편집기에 복사',
                    cancelButtonText: '팝업 닫기',
                    hotInstance: hotInstanceRefForPopups
                });

                if (result.isConfirmed && result.formData && result.formData !== false) {
                    const outputValue = result.formData;
                    if (jsonInputField) {
                        jsonInputField.value = outputValue;
                        if(saveFeedback) showTemporaryMessage(saveFeedback, '결과가 메인 편집기에 복사되었습니다.', 2000);
                    }
                } else if (result.isDismissed && result.dismiss === 'cancel') { // 여기도 'cancel' 문자열로 직접 비교
                    if(saveFeedback) showTemporaryMessage(saveFeedback, '디코딩 팝업을 닫았습니다.', 1500, 'info');
                } else if (result.isConfirmed && result.formData === false) {
                    // preConfirm이 false를 반환.
                }
            } catch (error) {
                console.error("URL 디코딩 팝업 처리 중 오류:", error);
                if(errorOutput) errorOutput.textContent = 'URL 디코딩 팝업 오류: ' + error.message;
                if(saveFeedback) showTemporaryMessage(saveFeedback, 'URL 디코딩 팝업을 여는 중 문제가 발생했습니다.', 3000, 'error');
            }
        });
    }

    initializeThemeSwitcher(); //
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

/**
 * 주어진 문자열을 URL 인코딩합니다 (퍼센트 인코딩).
 * 이 함수는 URI의 구성 요소(예: 쿼리 파라미터 값)를 인코딩하는 데 적합합니다.
 *
 * @param {string} str - 인코딩할 문자열
 * @returns {string} URL 인코딩된 문자열
 * @throws {TypeError} 입력값이 문자열이 아닐 경우 발생
 */
function encodeUrlString(str) {
    if (typeof str !== 'string') {
        throw new TypeError('입력값은 문자열이어야 합니다.');
    }
    try {
        return encodeURIComponent(str);
    } catch (e) {
        // URIError가 발생할 수 있는 경우 (예: 잘못된 형식의 URI 시퀀스)
        console.error("URL 인코딩 중 오류 발생:", e);
        return str; // 오류 발생 시 원본 문자열 반환 또는 다른 오류 처리
    }
}

/**
 * URL 인코딩된 문자열을 디코딩합니다.
 * 이 함수는 encodeURIComponent()로 인코딩된 문자열을 디코딩하는 데 사용됩니다.
 *
 * @param {string} encodedStr - 디코딩할 URL 인코딩된 문자열
 * @returns {string} 디코딩된 문자열
 * @throws {TypeError} 입력값이 문자열이 아닐 경우 발생
 */
function decodeUrlString(encodedStr) {
    if (typeof encodedStr !== 'string') {
        throw new TypeError('입력값은 문자열이어야 합니다.');
    }
    try {
        return decodeURIComponent(encodedStr);
    } catch (e) {
        // URIError (예: 잘못된 퍼센트 인코딩 시퀀스)
        console.error("URL 디코딩 중 오류 발생:", e);
        return encodedStr; // 오류 발생 시 원본 문자열 반환 또는 다른 오류 처리
    }
}

function parseCsvLine(line) {
    const values = [];
    let currentVal = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                // Escaped quote ("")
                currentVal += '"';
                i++; // Skip next quote
            } else {
                inQuotes = !inQuotes; // Toggle inQuotes state
            }
        } else if (char === ',' && !inQuotes) {
            values.push(currentVal); // No trim here, autoTypeConvert will trim
            currentVal = "";
        } else {
            currentVal += char;
        }
    }
    values.push(currentVal); // Add the last value
    return values;
}

// Helper for basic automatic type conversion from CSV string values
function autoTypeConvert(value) {
    if (typeof value !== 'string') return value;

    const trimmedValue = value.trim();

    // 불리언 및 null 변환 (convertToTypedValue 우선순위 및 CSV의 빈 문자열 처리 방식 적용)
    if (trimmedValue.toLowerCase() === 'null') return null;
    if (trimmedValue.toLowerCase() === 'true') return true;
    if (trimmedValue.toLowerCase() === 'false') return false;
    if (trimmedValue === "") return null; // CSV 특화: 빈 문자열은 null로 처리

    // 숫자 변환 (dataUtils.js의 convertToTypedValue 숫자 변환 로직 차용)
    // 이 로직은 "1e3"과 같은 문자열은 숫자로 직접 변환하지 않고 문자열로 유지합니다.
    // 이는 convertToTypedValue의 동작과 일치합니다.
    if (trimmedValue !== '' && !isNaN(Number(trimmedValue))) {
        if (trimmedValue.includes('.') ||
            /^-?\d+$/.test(trimmedValue) || // "123", "-123", "007"과 같은 정수형 문자열 일치
            String(Number(trimmedValue)) === trimmedValue.replace(/^0+(?=\d)/, '')) { // "01"을 1로 변환 후 문자열 비교
            return Number(trimmedValue);
        }
    }

    // JSON 배열/객체 형태의 문자열 변환 (dataUtils.js의 convertToTypedValue 로직 차용)
    // CSV 필드가 "[1,2]" 또는 "{\"key\":\"val\"}" 같은 JSON 문자열을 포함하는 경우 파싱합니다.
    if ((trimmedValue.startsWith('[') && trimmedValue.endsWith(']')) || (trimmedValue.startsWith('{') && trimmedValue.endsWith('}'))) {
        try {
            // JSON 문자열을 실제 배열/객체로 파싱
            return JSON.parse(trimmedValue);
        } catch (e) {
            // JSON.parse 실패 시, 유효한 JSON 문자열이 아님.
            // CSV 자동 변환 맥락에서는 이를 리터럴 문자열로 처리.
            return trimmedValue;
        }
    }

    // 위의 어떤 경우에도 해당하지 않으면 원본 문자열(trim된 상태) 그대로 반환
    return trimmedValue;
}

// Function to convert CSV string to JSON (array of objects)
function convertCsvToJson(csvString) {
    const allLines = csvString.trim().split(/\r\n|\n|\r/);
    if (allLines.length === 0) return []; // 빈 CSV는 빈 배열 반환

    let headerLineIndex = -1;
    for (let i = 0; i < allLines.length; i++) {
        if (allLines[i].trim() !== "") {
            headerLineIndex = i;
            break;
        }
    }

    if (headerLineIndex === -1) return []; // 헤더를 찾을 수 없으면 빈 배열 반환

    let headers = parseCsvLine(allLines[headerLineIndex]).map((h, index) => {
        const trimmedHeader = h.trim();
        // 빈 헤더에 대한 기본 이름 생성은 여기서 유지하거나, 키-값 모드에서는 다르게 처리 가능
        return trimmedHeader === "" ? `column_${index + 1}` : trimmedHeader;
    });

    // --- 키-값 쌍 CSV 감지 로직 추가 ---
    const trimmedLowerHeaders = headers.map(h => h.toLowerCase());
    const keyColumnNames = ['key', 'property', 'name', 'field', 'item']; // 키로 인식할 헤더 이름들
    const valueColumnName = 'value'; // 값으로 인식할 헤더 이름

    const isKeyValueCsv = headers.length === 2 &&
        keyColumnNames.includes(trimmedLowerHeaders[0]) &&
        trimmedLowerHeaders[1] === valueColumnName;

    if (isKeyValueCsv) {
        // 키-값 쌍 CSV로 판단되면, 단일 객체로 통합
        const singleJsonObject = {};
        for (let i = headerLineIndex + 1; i < allLines.length; i++) {
            const currentLine = allLines[i];
            if (currentLine.trim() === "") continue;

            const values = parseCsvLine(currentLine);
            if (values.every(v => v.trim() === "")) continue;

            if (values.length >= 2) {
                const key = values[0].trim(); // 첫 번째 열을 키로 사용
                if (key === "") continue; // 키가 비어있으면 해당 행 무시
                const rawValue = values[1];   // 두 번째 열을 값으로 사용
                singleJsonObject[key] = autoTypeConvert(rawValue);
            }
        }
        return singleJsonObject; // 단일 객체 반환
    } else {
        // 일반 테이블 형식 CSV 처리 (기존 로직)
        const jsonData = [];
        for (let i = headerLineIndex + 1; i < allLines.length; i++) {
            const currentLine = allLines[i];
            if (currentLine.trim() === "") continue;

            const values = parseCsvLine(currentLine);
            if (values.every(v => v.trim() === "")) continue;

            const entry = {};
            let rowHasMeaningfulData = false;
            const maxIteration = Math.max(headers.length, values.length);

            for (let j = 0; j < maxIteration; j++) {
                const key = (j < headers.length && headers[j]) ? headers[j] : `column_${j + 1}`;
                const rawValue = values[j] !== undefined ? values[j] : "";
                const typedValue = autoTypeConvert(rawValue);
                entry[key] = typedValue;
                if (typedValue !== null && String(typedValue).trim() !== "") {
                    rowHasMeaningfulData = true;
                }
            }
            if (rowHasMeaningfulData) {
                jsonData.push(entry);
            }
        }
        return jsonData; // 객체의 배열 반환
    }
}

async function loadCsvFromFile() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv,text/csv';
    fileInput.style.display = 'none';

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const csvContent = e.target.result;
                // convertCsvToJson은 이제 단일 객체 또는 객체의 배열을 반환할 수 있습니다.
                const conversionResult = convertCsvToJson(csvContent);

                let finalJsonDataToLoad;
                let feedbackMessage = `${file.name} CSV 파일이 성공적으로 JSON으로 변환 및 로드되었습니다.`;

                if (Array.isArray(conversionResult)) {
                    // convertCsvToJson이 배열을 반환한 경우 (일반 테이블 CSV)
                    // 사용자 요청("유일할 때가 아니라 그냥 벗겨줘" -> "배열이 비어있지 않으면 첫 번째 요소만 취한다")을 따름
                    if (conversionResult.length > 0) {
                        finalJsonDataToLoad = conversionResult[0];
                        if (conversionResult.length > 1) {
                            console.warn("CSV contained multiple records; only the first record has been loaded into the editor. Subsequent records were ignored.");
                            feedbackMessage = `${file.name} CSV 로드됨 (주의: 여러 레코드 중 첫 번째 레코드만 표시됨).`;
                        }
                    } else {
                        // 빈 CSV는 빈 배열로 처리
                        finalJsonDataToLoad = [];
                    }
                } else if (typeof conversionResult === 'object' && conversionResult !== null) {
                    // convertCsvToJson이 단일 객체를 반환한 경우 (키-값 쌍 CSV)
                    // 이것이 "직접적으로 넣어서 가져온" 결과입니다.
                    finalJsonDataToLoad = conversionResult;
                    feedbackMessage = `${file.name} Key-Value CSV가 단일 JSON 객체로 로드되었습니다.`;
                } else {
                    // 예외적인 경우 (null, undefined 등), 빈 객체로 기본 처리
                    console.error("Unexpected data type from CSV conversion:", conversionResult);
                    finalJsonDataToLoad = {};
                    feedbackMessage = `${file.name} CSV 변환 중 예상치 못한 결과 발생.`;
                }

                const jsonString = JSON.stringify(finalJsonDataToLoad, null, 2);

                if (jsonInputField) {
                    jsonInputField.value = jsonString;
                    loadJson();
                    showTemporaryMessage(saveFeedback, feedbackMessage, 5000);
                } else {
                    showConfirmationPopup({ title: '오류', text: 'JSON 입력 필드를 찾을 수 없습니다.', icon: 'error', showCancelButton: false, hotInstance: hotInstanceRefForPopups });
                }
            } catch (err) {
                console.error("CSV Parsing Error in loadCsvFromFile:", err);
                if (errorOutput) errorOutput.textContent = `CSV 파일 파싱 오류: ${err.message}`;
                showConfirmationPopup({ title: 'CSV 파일 파싱 오류', text: `CSV 파일을 JSON으로 변환하는 중 오류가 발생했습니다: ${err.message}`, icon: 'error', showCancelButton: false, hotInstance: hotInstanceRefForPopups });
            }
        };
        // ... (reader.onerror 및 나머지 부분은 동일)
        reader.readAsText(file);
        if (fileInput.parentNode === document.body) {
            document.body.removeChild(fileInput);
        }
    });

    document.body.appendChild(fileInput);
    fileInput.click();
}

function convertJsonToCSV(jsonData) {
    if (jsonData === null || jsonData === undefined) {
        throw new Error("데이터가 없어 CSV로 변환할 수 없습니다.");
    }

    let csvString = "";

    const escapeCSVValue = (value) => {
        if (value === null || value === undefined) return "";

        let stringValue;
        if (typeof value === 'object') { // Handles arrays and objects
            stringValue = JSON.stringify(value);
        } else {
            stringValue = String(value);
        }

        // If the string contains a comma, newline, or double quote, enclose it in double quotes.
        // Also escape existing double quotes by doubling them up.
        if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('\r') || stringValue.includes('"')) {
            stringValue = '"' + stringValue.replace(/"/g, '""') + '"';
        }
        return stringValue;
    };

    if (Array.isArray(jsonData)) {
        if (jsonData.length === 0) {
            // For an empty array, we can return an empty string or a header-only CSV.
            // Let's return an empty string for simplicity, or you could define default headers.
            return ""; // Or handle as an error/specific message if preferred
        }

        // Check if it's an array of objects (common case for CSV)
        if (typeof jsonData[0] === 'object' && jsonData[0] !== null && !Array.isArray(jsonData[0])) {
            const headers = [];
            // Collect all unique keys from all objects to form the header row
            jsonData.forEach(obj => {
                if (typeof obj === 'object' && obj !== null) { // Ensure obj is an object
                    Object.keys(obj).forEach(key => {
                        if (!headers.includes(key)) {
                            headers.push(key);
                        }
                    });
                }
            });

            if (headers.length > 0) {
                csvString += headers.map(escapeCSVValue).join(',') + '\r\n'; // Header row
            } else {
                // Array of objects, but all objects are empty or not structured as expected
                // Or jsonData might be an array of empty objects e.g. [{}, {}]
                // Fallback to treating as array of primitives if no headers found
                if (jsonData.every(item => typeof item !== 'object' || item === null)) {
                    csvString += "value\r\n"; // Default header
                    jsonData.forEach(item => {
                        csvString += escapeCSVValue(item) + '\r\n';
                    });
                    return csvString;
                } else {
                    // Potentially an array of empty objects or mixed types not fitting object structure
                    // You might want to throw an error or return a specific message here.
                    // For now, let's try to process rows even if headers were not fully derived.
                }
            }


            jsonData.forEach(obj => {
                if (typeof obj === 'object' && obj !== null) { // Process only if obj is an object
                    const row = headers.map(header => {
                        return escapeCSVValue(obj[header]);
                    });
                    csvString += row.join(',') + '\r\n';
                } else {
                    // Handle cases where an item in the array is not an object (e.g. [{}, null, {"a":1}])
                    // This will create an empty line or a line with empty values based on headers.
                    const row = headers.map(() => escapeCSVValue(null)); // Create empty cells for this row
                    csvString += row.join(',') + '\r\n';
                }
            });
        } else {
            // Array of primitives (e.g., strings, numbers) or mixed non-object types
            csvString += "value\r\n"; // Default header for an array of primitive values
            jsonData.forEach(item => {
                csvString += escapeCSVValue(item) + '\r\n';
            });
        }
    } else if (typeof jsonData === 'object' && jsonData !== null) {
        // Single object: convert to key-value pairs
        csvString += "key,value\r\n";
        Object.keys(jsonData).forEach(key => {
            csvString += escapeCSVValue(key) + ',' + escapeCSVValue(jsonData[key]) + '\r\n';
        });
    } else {
        // Single primitive value
        csvString += "value\r\n";
        csvString += escapeCSVValue(jsonData) + '\r\n';
    }
    return csvString;
}

async function saveJsonToCSV() {
    if (currentJsonData === null || currentJsonData === undefined) {
        showTemporaryMessage(saveFeedback, '저장할 JSON 데이터가 없습니다.', 3000);
        return;
    }

    try {
        const result = await showTextInputPopup({ //
            title: 'CSV 파일 이름 입력',
            inputLabel: '저장할 파일 이름을 입력해주세요 (.csv 확장자는 자동으로 추가됩니다):',
            inputValue: 'data', // Default filename suggestion
            confirmButtonText: '저장',
            inputValidator: (value) => {
                if (!value || value.trim().length === 0) {
                    return '파일 이름은 비워둘 수 없습니다.';
                }
                return null; // Valid
            },
            hotInstance: hotInstanceRefForPopups //
        });

        if (result.isConfirmed && result.value) {
            let filename = result.value.trim();
            if (!filename.toLowerCase().endsWith('.csv')) {
                filename += '.csv';
            }

            const csvString = convertJsonToCSV(currentJsonData);

            // The convertJsonToCSV function should ideally throw an error for truly unconvertible types
            // or return an empty string for empty data, which is fine.

            const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showTemporaryMessage(saveFeedback, `${filename} 파일이 성공적으로 CSV로 저장되었습니다!`, 3000);
        } else {
            showTemporaryMessage(saveFeedback, 'CSV 파일 저장이 취소되었습니다.', 3000);
        }

    } catch (e) {
        if(errorOutput) errorOutput.textContent = 'CSV 파일 저장/변환 오류: ' + e.message;
        showConfirmationPopup({ //
            title: 'CSV 저장/변환 오류',
            text: `JSON 데이터를 CSV로 저장하거나 변환하는 중 오류가 발생했습니다: ${e.message}`,
            icon: 'error',
            showCancelButton: false,
            hotInstance: hotInstanceRefForPopups
        });
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