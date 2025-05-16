import { minifyJson, prettyJson } from './json-utils.js';
import { showJsonDiffPopup } from './customPopup.js';

import 'sweetalert2/dist/sweetalert2.min.css';

import Handsontable from 'handsontable';
import 'handsontable/dist/handsontable.full.min.css';

let currentJsonData = null;
let originalJsonDataAtLoad = null;
let selectedNodeElement = null;
let hotInstance = null;

const jsonInputField = document.getElementById('json-input');
const saveFeedback = document.getElementById('save-message');
const errorOutput = document.getElementById('json-error');

function buildTree(data, parentDomElement, currentPathString, rootJsonData, depth) {
    for (const key in data) {
        if (!data.hasOwnProperty(key)) continue;
        const value = data[key];
        const nodePath = currentPathString ? `${currentPathString}.${key}` : key;
        const nodeContainerDiv = document.createElement('div');
        const nodeElementDiv = createNodeElement(key, value, nodePath);
        nodeContainerDiv.appendChild(nodeElementDiv);
        if (typeof value === 'object' && value !== null) {
            const childrenContainerDiv = createChildrenContainer(nodeElementDiv, value, nodePath, rootJsonData, depth);
            if (childrenContainerDiv) {
                nodeContainerDiv.appendChild(childrenContainerDiv);
            }
            const nodeTextWrapperSpan = nodeElementDiv.querySelector('.node-text-wrapper');
            nodeTextWrapperSpan.onclick = (event) => {
                event.stopPropagation();
                selectNode(nodeElementDiv);
                displayDataWithHandsontable(value, key, rootJsonData, nodePath);
            };
        } else {
            setupPrimitiveNodeClickHandler(nodeElementDiv, key, value, nodePath, rootJsonData, depth);
        }
        parentDomElement.appendChild(nodeContainerDiv);
    }
}

function createNodeElement(key, value, nodePath) {
    const nodeElementDiv = document.createElement('div');
    nodeElementDiv.classList.add('tree-node');
    nodeElementDiv.dataset.path = nodePath;
    const toggleIconSpan = document.createElement('span');
    toggleIconSpan.classList.add('toggle-icon');
    nodeElementDiv.appendChild(toggleIconSpan);
    const nodeTextWrapperSpan = document.createElement('span');
    nodeTextWrapperSpan.classList.add('node-text-wrapper');
    nodeElementDiv.appendChild(nodeTextWrapperSpan);
    const keySpan = document.createElement('span');
    keySpan.classList.add('tree-node-key');
    keySpan.textContent = `${key}: `;
    nodeTextWrapperSpan.appendChild(keySpan);
    if (typeof value === 'object' && value !== null) {
        setupObjectNodeStyle(toggleIconSpan, nodeTextWrapperSpan, value);
    } else {
        setupPrimitiveNodeStyle(toggleIconSpan, nodeTextWrapperSpan, value);
    }
    return nodeElementDiv;
}

function setupObjectNodeStyle(toggleIconSpan, nodeTextWrapperSpan, value) {
    const typeSpan = document.createElement('span');
    typeSpan.classList.add('tree-node-type');
    typeSpan.textContent = Array.isArray(value) ? `[Array (${value.length})]` : '{Object}';
    nodeTextWrapperSpan.appendChild(typeSpan);
    const hasChildren = Object.keys(value).length > 0;
    toggleIconSpan.textContent = hasChildren ? '▶' : ' ';
}

function setupPrimitiveNodeStyle(toggleIconSpan, nodeTextWrapperSpan, value) {
    toggleIconSpan.innerHTML = '&nbsp;';
    const valueSpan = document.createElement('span');
    valueSpan.classList.add('tree-node-value');
    applyValueStyle(valueSpan, value);
    nodeTextWrapperSpan.appendChild(valueSpan);
}

function applyValueStyle(valueSpan, value) {
    let displayValue = String(value);
    let color = '';
    if (typeof value === 'string') { displayValue = `"${value}"`; color = '#28a745'; }
    else if (typeof value === 'number') { color = '#17a2b8'; }
    else if (typeof value === 'boolean') { color = '#fd7e14'; }
    else if (value === null) { displayValue = 'null'; color = '#6c757d'; }
    valueSpan.textContent = displayValue;
    if (color) valueSpan.style.color = color;
}

function createChildrenContainer(nodeElementDiv, value, nodePath, rootJsonData, depth) {
    const hasChildren = Object.keys(value).length > 0;
    if (!hasChildren) return null;
    const childrenContainerDiv = document.createElement('div');
    childrenContainerDiv.classList.add('tree-node-children');
    childrenContainerDiv.style.display = 'none';
    const toggleIcon = nodeElementDiv.querySelector('.toggle-icon');
    if (toggleIcon) {
        toggleIcon.onclick = (event) => {
            event.stopPropagation();
            const isHidden = childrenContainerDiv.style.display === 'none';
            childrenContainerDiv.style.display = isHidden ? 'block' : 'none';
            toggleIcon.textContent = isHidden ? '▼' : '▶';
        };
    }
    buildTree(value, childrenContainerDiv, nodePath, rootJsonData, depth + 1);
    return childrenContainerDiv;
}

function selectNode(nodeElementDiv) {
    if (selectedNodeElement) selectedNodeElement.classList.remove('selected-node');
    selectedNodeElement = nodeElementDiv;
    if (selectedNodeElement) selectedNodeElement.classList.add('selected-node');
}

function setupPrimitiveNodeClickHandler(nodeElementDiv, key, value, nodePath, rootJsonData, depth) {
    const nodeTextWrapperSpan = nodeElementDiv.querySelector('.node-text-wrapper');
    nodeTextWrapperSpan.onclick = (event) => {
        event.stopPropagation();
        selectNode(nodeElementDiv);
        const lastDotIndex = nodePath.lastIndexOf('.');
        const parentPath = lastDotIndex === -1 ? '' : nodePath.substring(0, lastDotIndex);
        const parentKey = parentPath.split('.').pop() || (Object.keys(rootJsonData)[0] === key && depth === 0 ? 'root' : '');
        const parentObject = getObjectByPath(rootJsonData, parentPath);
        if (parentObject && typeof parentObject === 'object') {
            displayDataWithHandsontable(parentObject, parentKey, rootJsonData, parentPath);
        } else {
            const singleValueDisplayData = { [key]: value };
            displayDataWithHandsontable(singleValueDisplayData, 'root', rootJsonData, key);
        }
    };
}

function getObjectByPath(obj, path) {
    if (!path) return obj;
    const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.');
    let current = obj;
    for (const key of keys) {
        if (current && typeof current === 'object' && key in current) {
            current = current[key];
        } else {
            return undefined;
        }
    }
    return current;
}

function initialLoad() {
    document.getElementById("loadBtn").addEventListener("click", loadJson);
    document.getElementById("saveBtn").addEventListener('click', saveJson);
    document.getElementById("minifyBtn").addEventListener("click", () => {
        jsonInputField.value = minifyJson(jsonInputField.value);
    });
    document.getElementById("uglifyBtn").addEventListener("click", () => {
        jsonInputField.value = prettyJson(jsonInputField.value);
    });
    document.getElementById("diffBtn").addEventListener('click', () => {
        if (!originalJsonDataAtLoad && !currentJsonData) {
            Swal.fire('알림', '먼저 JSON 데이터를 로드해주세요.', 'info'); return;
        }
        if (!originalJsonDataAtLoad) {
            Swal.fire('알림', '로드된 원본 JSON 데이터가 없습니다.', 'info'); return;
        }
        const dataForDiffRight = currentJsonData === null ? {} : currentJsonData;
        showJsonDiffPopup({
            title: 'JSON 데이터 변경사항',
            jsonDiffData: { left: originalJsonDataAtLoad, right: dataForDiffRight },
            buttons: [{ text: '닫기', role: 'confirm' }]
        }).catch(error => {
            console.error('showCustomPopup (diff2html) 실행 중 오류:', error);
            Swal.fire('오류', '변경점 확인 중 오류가 발생했습니다.', 'error');
        });
    });
}

function loadJson() {
    const treeViewContainer = document.getElementById('tree-view');
    const tableViewContainer = document.getElementById('table-view');
    resetUI(treeViewContainer, tableViewContainer, errorOutput, saveFeedback);
    try {
        const jsonString = jsonInputField.value.trim();
        if (!jsonString) {
            currentJsonData = null; originalJsonDataAtLoad = null; updateTableViewPathDisplay(null);
            if (hotInstance) { hotInstance.destroy(); hotInstance = null; }
            return;
        }
        currentJsonData = JSON.parse(jsonString);
        originalJsonDataAtLoad = JSON.parse(JSON.stringify(currentJsonData));
        buildTree(currentJsonData, treeViewContainer, '', currentJsonData, 0);
        if (hotInstance) { hotInstance.destroy(); hotInstance = null; }
        updateTableViewPathDisplay(null);
    } catch (e) {
        errorOutput.textContent = 'JSON 파싱 오류: ' + e.message;
        currentJsonData = null; originalJsonDataAtLoad = null;
        if (hotInstance) { hotInstance.destroy(); hotInstance = null; }
        updateTableViewPathDisplay(null);
    }
}

function resetUI(treeViewContainer, tableViewContainer, errorOutputElement, saveFeedbackElement) {
    treeViewContainer.innerHTML = '';
    if (hotInstance) {
        hotInstance.destroy();
        hotInstance = null;
    }
    tableViewContainer.innerHTML = '';
    errorOutputElement.textContent = '';
    saveFeedbackElement.textContent = '';
    selectedNodeElement = null;
    updateTableViewPathDisplay(null);
}

function saveJson() {
    errorOutput.textContent = '';
    if (currentJsonData) {
        try {
            const jsonString = JSON.stringify(currentJsonData, null, 2);
            jsonInputField.value = jsonString;
            showTemporaryMessage(saveFeedback, 'JSON이 텍스트 영역에 저장되었습니다!', 3000);
        } catch (e) {
            errorOutput.textContent = 'JSON 문자열 변환 오류: ' + e.message;
            saveFeedback.textContent = '';
        }
    } else {
        jsonInputField.value = '';
        showTemporaryMessage(saveFeedback, '저장할 JSON 데이터가 없습니다.', 3000);
    }
}

function showTemporaryMessage(element, message, duration) {
    element.textContent = message;
    setTimeout(() => { element.textContent = ''; }, duration);
}

function prepareHotCell(value, dataPath, keyOrIndex, isKeyColumn = false) {
    let displayValue = value;
    let cellMeta = {
        isDrillable: false,
        drillPath: null,
        originalKey: String(keyOrIndex),
        originalValue: value,
        readOnly: isKeyColumn
    };

    if (typeof value === 'object' && value !== null) {
        displayValue = Array.isArray(value) ? `[Array (${value.length})]` : `{Object}`;
        cellMeta.isDrillable = true;
        cellMeta.drillPath = dataPath ? `${dataPath}.${keyOrIndex}` : String(keyOrIndex);
        if (Array.isArray(value) && value.length === 0) cellMeta.isDrillable = false;
        if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) cellMeta.isDrillable = false;
        cellMeta.readOnly = true;
    } else if (value === null) {
        displayValue = "null";
    } else {
        displayValue = String(value);
    }
    return { displayValue, cellMeta };
}


function displayDataWithHandsontable(data, dataKeyName, rootJsonData, dataPathString) {
    const container = document.getElementById('table-view');
    updateTableViewPathDisplay(dataPathString);

    if (hotInstance) {
        hotInstance.destroy();
        hotInstance = null;
    }
    container.innerHTML = '';

    let hotData = [];
    let colHeaders = true;
    const cellMetaMap = new Map();

    // ... (이전 답변의 hotData 및 cellMetaMap 생성 로직은 동일하게 유지) ...
    // (이전 답변에서 제공된 hotData 및 cellMetaMap 생성 로직을 여기에 삽입하세요)
    if (Array.isArray(data)) {
        if (data.length === 0) {
            container.textContent = '빈 배열입니다.';
            return;
        }
        const firstItem = data[0];
        if (typeof firstItem === 'object' && firstItem !== null && !Array.isArray(firstItem)) {
            const headers = Object.keys(firstItem);
            colHeaders = headers;
            const newHotData = [];
            data.forEach((obj, rowIndex) => {
                const rowValues = [];
                headers.forEach((key, colIndex) => {
                    const value = obj[key];
                    const { displayValue, cellMeta } = prepareHotCell(value, dataPathString + `[${rowIndex}]`, key, false);
                    rowValues.push(displayValue);
                    cellMetaMap.set(`${rowIndex}-${colIndex}`, cellMeta);
                });
                newHotData.push(rowValues);
            });
            hotData = newHotData;
        } else {
            colHeaders = ["인덱스", "값"];
            hotData = data.map((item, index) => {
                const { displayValue: indexDisplay, cellMeta: indexMeta } = prepareHotCell(index, dataPathString, index, true);
                const { displayValue: valueDisplay, cellMeta: valueMeta } = prepareHotCell(item, dataPathString + `[${index}]`, index, false);
                cellMetaMap.set(`${index}-0`, indexMeta);
                cellMetaMap.set(`${index}-1`, valueMeta);
                return [indexDisplay, valueDisplay];
            });
        }
    } else if (typeof data === 'object' && data !== null) {
        if (Object.keys(data).length === 0) {
            container.textContent = '빈 객체입니다.';
            return;
        }
        colHeaders = ["항목 (Key)", "값 (Value)"];
        hotData = Object.entries(data).map(([key, value], rowIndex) => {
            const { displayValue: keyDisplay, cellMeta: keyMeta } = prepareHotCell(key, dataPathString, key, true);
            const { displayValue: valueDisplay, cellMeta: valueMeta } = prepareHotCell(value, dataPathString, key, false);
            cellMetaMap.set(`${rowIndex}-0`, keyMeta);
            cellMetaMap.set(`${rowIndex}-1`, valueMeta);
            return [keyDisplay, valueDisplay];
        });
    } else {
        colHeaders = ["항목", "값"];
        const keyStr = dataKeyName || "Value";
        const { displayValue: keyDisplay, cellMeta: keyMeta } = prepareHotCell(keyStr, dataPathString, '', true);
        const { displayValue: valueDisplay, cellMeta: valueMeta } = prepareHotCell(data, dataPathString, '', false);
        cellMetaMap.set(`0-0`, keyMeta);
        cellMetaMap.set(`0-1`, valueMeta);
        hotData = [[keyDisplay, valueDisplay]];
    }


    hotInstance = new Handsontable(container, {
        data: hotData,
        rowHeaders: true,
        colHeaders: colHeaders,
        contextMenu: true,
        licenseKey: 'non-commercial-and-evaluation',

        cells: function(row, col, prop) {
            const cellProperties = {};
            const meta = cellMetaMap.get(`${row}-${col}`);
            if (meta) {
                cellProperties.readOnly = meta.readOnly;
                if (meta.isDrillable) {
                    cellProperties.renderer = function(instance, td, r, c, p, value, cellProps) {
                        Handsontable.renderers.TextRenderer.apply(this, arguments);
                        td.style.color = '#007bff';
                        td.style.textDecoration = 'underline';
                        td.style.cursor = 'pointer';
                    };
                }
            }
            return cellProperties;
        },

        afterOnCellMouseDown: function(event, coords, TD) {
            const meta = cellMetaMap.get(`${coords.row}-${coords.col}`);
            if (meta && meta.isDrillable && meta.originalValue && typeof meta.originalValue === 'object') {
                let nextDataKeyName = meta.originalKey;
                if(Array.isArray(data) && typeof data[0] === 'object' && Array.isArray(colHeaders) && colHeaders[coords.col]){
                    nextDataKeyName = colHeaders[coords.col];
                }
                displayDataWithHandsontable(meta.originalValue, nextDataKeyName, rootJsonData, meta.drillPath);
            }
        },

        afterChange: function(changes, source) {
            if (source === 'loadData') {
                return;
            }
            changes.forEach(([row, colIndexOrProp, oldValue, newValue]) => {
                const meta = cellMetaMap.get(`${row}-${colIndexOrProp}`);
                let pathToUpdate = "";
                let actualColIndex = typeof colIndexOrProp === 'number' ? colIndexOrProp : (Array.isArray(colHeaders) ? colHeaders.indexOf(colIndexOrProp) : -1);

                if (meta && meta.readOnly) return;

                if (Array.isArray(data)) {
                    if (row < data.length) {
                        const originalRowData = data[row];
                        if (typeof originalRowData === 'object' && originalRowData !== null && !Array.isArray(originalRowData)) {
                            const propName = Array.isArray(colHeaders) && actualColIndex >= 0 && actualColIndex < colHeaders.length ? colHeaders[actualColIndex] : colIndexOrProp;
                            if(propName !== undefined) pathToUpdate = `${dataPathString}[${row}].${propName}`;
                        } else {
                            if (actualColIndex === 1) {
                                pathToUpdate = `${dataPathString}[${row}]`;
                            } else return;
                        }
                    }
                } else if (typeof data === 'object' && data !== null) {
                    if (actualColIndex === 1) {
                        const objectKeys = Object.keys(data);
                        if (row < objectKeys.length) {
                            const objectKey = objectKeys[row];
                            pathToUpdate = dataPathString ? `${dataPathString}.${objectKey}` : objectKey;
                        }
                    } else return;
                } else {
                    if (row === 0 && actualColIndex === 1) {
                        pathToUpdate = dataPathString;
                    } else return;
                }

                if (pathToUpdate) {
                    updateJsonData(rootJsonData, pathToUpdate, newValue);
                } else {
                    console.warn("Could not determine path for HOT update: ", {row, colIndexOrProp, dataPathString, data_type: Array.isArray(data) ? 'array' : typeof data});
                }
            });
        }
    });
}

function updateJsonData(rootJsonDataRef, pathString, newValueString) {
    const keys = pathString.replace(/\[(\d+)\]/g, '.$1').split('.');
    const lastKeyOrIndexString = keys.pop();
    const parentPath = keys.join('.');
    let parentObject = getObjectByPath(currentJsonData, parentPath);
    const targetKeyOrIndex = /^\d+$/.test(lastKeyOrIndexString) ? parseInt(lastKeyOrIndexString, 10) : lastKeyOrIndexString;

    if (parentObject && (typeof parentObject === 'object' || Array.isArray(parentObject))) {
        const originalValue = parentObject[targetKeyOrIndex];
        const typedValue = convertToTypedValue(newValueString, originalValue);
        parentObject[targetKeyOrIndex] = typedValue;
        const treeViewContainer = document.getElementById('tree-view');
        if (treeViewContainer) {
            const selectedPathBeforeReload = selectedNodeElement ? selectedNodeElement.dataset.path : null;
            treeViewContainer.innerHTML = '';
            if (currentJsonData && (typeof currentJsonData !== 'object' || Object.keys(currentJsonData).length > 0)) {
                if (typeof currentJsonData === 'object') {
                    buildTree(currentJsonData, treeViewContainer, '', currentJsonData, 0);
                } else {
                    const tempRootKey = pathString.split('.')[0] || 'value';
                    buildTree({[tempRootKey]: currentJsonData} , treeViewContainer, '', {[tempRootKey]: currentJsonData}, 0);
                }
            }
            if (selectedPathBeforeReload) {
                const reSelectedNode = treeViewContainer.querySelector(`.tree-node[data-path="${selectedPathBeforeReload}"]`);
                if (reSelectedNode) selectNode(reSelectedNode);
            }
        }
    } else if (!parentPath && pathString === targetKeyOrIndex) {
        currentJsonData = convertToTypedValue(newValueString, currentJsonData);
        const treeViewContainer = document.getElementById('tree-view');
        treeViewContainer.innerHTML = '';
        if (currentJsonData !== null && currentJsonData !== undefined) {
            const tempRootKey = pathString || 'value';
            buildTree({[tempRootKey]: currentJsonData}, treeViewContainer, '', {[tempRootKey]: currentJsonData}, 0);
        }
    } else {
        console.error("데이터 업데이트 오류:", "Path:", pathString, "Parent Path:", parentPath, "Parent Object:", parentObject);
    }
}

function convertToTypedValue(newValue, originalValue) {
    if (typeof newValue === 'string') {
        const str = newValue.trim();
        if (str.toLowerCase() === 'null') return null;
        if (str.toLowerCase() === 'true') return true;
        if (str.toLowerCase() === 'false') return false;

        if (str !== '' && !isNaN(Number(str))) {
            if (typeof originalValue === 'number' || str.includes('.') || /^-?\d+$/.test(str) || String(Number(str)) === str.replace(/^0+(?=\d)/, '')) {
                return Number(str);
            }
        }
        return newValue;
    }
    return newValue;
}

function updateTableViewPathDisplay(dataPathString) {
    const headers = document.querySelectorAll('h2');
    let titleElement = null;
    headers.forEach(h => { if (h.textContent.includes('데이터 테이블 뷰')) titleElement = h; });
    if (!titleElement) {
        const existingPathSpan = document.getElementById('table-view-current-path-display');
        if (existingPathSpan) existingPathSpan.textContent = '';
        return;
    }
    let pathSpan = document.getElementById('table-view-current-path-display');
    if (!pathSpan) {
        pathSpan = document.createElement('span');
        pathSpan.id = 'table-view-current-path-display';
        pathSpan.style.marginLeft = '10px'; pathSpan.style.fontSize = '0.8em'; pathSpan.style.fontWeight = 'normal';
        titleElement.appendChild(pathSpan);
    }
    if (dataPathString === null || dataPathString === undefined || dataPathString === '') {
        pathSpan.textContent = dataPathString === '' ? '(현재 경로: root)' : '';
    } else {
        pathSpan.textContent = `(현재 경로: ${dataPathString})`;
    }
}

window.onload = initialLoad;