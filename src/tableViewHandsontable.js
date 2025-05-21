import Handsontable from 'handsontable';
import 'handsontable/dist/handsontable.full.min.css';
import { showTextInputPopup, showConfirmationPopup } from './customPopup.js'; // customPopup.js 의존성
import Swal from 'sweetalert2'; // Import Swal for the select popup

let hotInstance = null;
let cellMetaMap = new Map();
let lastClickInfo = { row: -1, col: -1, time: 0 };

function prepareHotCell(value, dataPath, keyOrIndex, isKeyColumn = false, configForCellPrep) {
    let displayValue = String(value);
    let cellMeta = { isDrillable: false, drillPath: null, originalKey: String(keyOrIndex), originalValue: value, readOnly: isKeyColumn };
    const currentItemPathResolver = () => {
        if (keyOrIndex === '' || keyOrIndex === null || keyOrIndex === undefined) return dataPath;
        if (!dataPath) { const rootData = configForCellPrep.getObjectByPathCallback(configForCellPrep.rootJsonData, ''); if (Array.isArray(rootData)) return `[${keyOrIndex}]`; return String(keyOrIndex); }
        const parentActual = configForCellPrep.getObjectByPathCallback(configForCellPrep.rootJsonData, dataPath);
        if (Array.isArray(parentActual)) return `${dataPath}[${keyOrIndex}]`; return `${dataPath}.${keyOrIndex}`;
    };
    if (value === undefined) { displayValue = "undefined"; cellMeta.readOnly = false; }
    else if (typeof value === 'object' && value !== null) { displayValue = Array.isArray(value) ? `[Array (${value.length})]` : `{Object}`; cellMeta.isDrillable = true; cellMeta.drillPath = currentItemPathResolver(); cellMeta.readOnly = true; }
    else if (value === null) { displayValue = "null"; cellMeta.readOnly = false; }
    else { displayValue = String(value); if (!isKeyColumn && !cellMeta.isDrillable) cellMeta.readOnly = false; }
    if (isKeyColumn) cellMeta.readOnly = true;
    return { displayValue, cellMeta };
}

function _prepareTableData(data, dataKeyName, config) {
    let localHotData = [];
    let localColHeaders = true;
    let newLocalCellMetaMap = new Map();
    const configForCellPrep = { rootJsonData: config.rootJsonData, getObjectByPathCallback: config.getObjectByPathCallback };
    const currentDataPath = config.dataPathString || '';

    if (Array.isArray(data)) {
        const firstItem = data.length > 0 ? data[0] : null;
        if (firstItem && typeof firstItem === 'object' && firstItem !== null && !Array.isArray(firstItem)) {
            let potentialColHeaders = Object.keys(firstItem);
            if (potentialColHeaders.length === 0) {
                for (let i = 1; i < data.length; i++) {
                    if (data[i] && typeof data[i] === 'object' && Object.keys(data[i]).length > 0) {
                        potentialColHeaders = Object.keys(data[i]);
                        break;
                    }
                }
            }
            localColHeaders = potentialColHeaders.length > 0 ? potentialColHeaders : ((data.length > 0) ? ["(내용 없음)"] : ["새 열"]);

            data.forEach((obj, rowIndex) => {
                const rowValues = [];
                const currentItemObject = (typeof obj === 'object' && obj !== null) ? obj : {};
                (localColHeaders).forEach((key, colIndex) => {
                    const value = currentItemObject[key];
                    const itemPath = `${currentDataPath}[${rowIndex}]`;
                    const { displayValue, cellMeta } = prepareHotCell(value, itemPath, key, false, configForCellPrep);
                    rowValues.push(displayValue);
                    newLocalCellMetaMap.set(`${rowIndex}-${colIndex}`, cellMeta);
                });
                localHotData.push(rowValues);
            });
            if (data.length === 0 && Array.isArray(localColHeaders) && localColHeaders.length === 1 && (localColHeaders[0] === "새 열" || localColHeaders[0] === "(내용 없음)" || localColHeaders[0] === "데이터 없음")) {
            }

        } else {
            localColHeaders = ["Index", "Value"];
            localHotData = data.map((item, index) => {
                const itemPath = currentDataPath;
                const { displayValue: indexDisplay, cellMeta: indexMeta } = prepareHotCell(index, itemPath, String(index), true, configForCellPrep);
                const { displayValue: valueDisplay, cellMeta: valueMeta } = prepareHotCell(item, itemPath, String(index), false, configForCellPrep);
                newLocalCellMetaMap.set(`${index}-0`, indexMeta);
                newLocalCellMetaMap.set(`${index}-1`, valueMeta);
                return [indexDisplay, valueDisplay];
            });
        }
    } else if (typeof data === 'object' && data !== null) {
        const objectKeys = Object.keys(data);
        const shouldExpandArrays = objectKeys.length > 0 && objectKeys.every(key => Array.isArray(data[key]));

        if (shouldExpandArrays) {
            let maxExpandedLength = 0;
            objectKeys.forEach(key => { maxExpandedLength = Math.max(maxExpandedLength, data[key].length); });
            const tempColHeaders = ["항목 (Key)"];
            for (let i = 0; i < maxExpandedLength; i++) { tempColHeaders.push(String(i)); }
            localColHeaders = tempColHeaders;

            localHotData = objectKeys.map((key, rowIndex) => {
                const valueArray = data[key];
                const rowCells = [];
                const keyItemPath = currentDataPath;
                const { displayValue: keyDisplay, cellMeta: keyMeta } = prepareHotCell(key, keyItemPath, key, true, configForCellPrep);
                rowCells.push(keyDisplay);
                newLocalCellMetaMap.set(`${rowIndex}-0`, keyMeta);

                for (let arrIdx = 0; arrIdx < maxExpandedLength; arrIdx++) {
                    if (arrIdx < valueArray.length) {
                        const item = valueArray[arrIdx];
                        const itemContainerPath = `${currentDataPath ? currentDataPath + '.' : ''}${key}`;
                        const { displayValue: itemDisplay, cellMeta: itemMeta } = prepareHotCell(item, itemContainerPath, String(arrIdx), false, configForCellPrep);
                        rowCells.push(itemDisplay);
                        newLocalCellMetaMap.set(`${rowIndex}-${1 + arrIdx}`, itemMeta);
                    } else {
                        rowCells.push("");
                        newLocalCellMetaMap.set(`${rowIndex}-${1 + arrIdx}`, { readOnly: true, originalValue: null, isPadding: true });
                    }
                }
                return rowCells;
            });
        } else {
            localColHeaders = ["항목 (Key)", "값 (Value)"];
            localHotData = objectKeys.map((key, rowIndex) => {
                const value = data[key];
                const itemPath = currentDataPath;
                const { displayValue: keyDisplay, cellMeta: keyMeta } = prepareHotCell(key, itemPath, key, true, configForCellPrep);
                const { displayValue: valueDisplay, cellMeta: valueMeta } = prepareHotCell(value, itemPath, key, false, configForCellPrep);
                newLocalCellMetaMap.set(`${rowIndex}-0`, keyMeta);
                newLocalCellMetaMap.set(`${rowIndex}-1`, valueMeta);
                return [keyDisplay, valueDisplay];
            });
        }
    } else {
        localColHeaders = ["항목", "값"];
        const keyStr = dataKeyName || (data === null || data === undefined ? String(data) : "Value");
        const itemPath = currentDataPath;
        const { displayValue: keyDisplay, cellMeta: keyMeta } = prepareHotCell(keyStr, itemPath, '', true, configForCellPrep);
        const { displayValue: valueDisplay, cellMeta: valueMeta } = prepareHotCell(data, itemPath, '', false, configForCellPrep);
        newLocalCellMetaMap.set(`0-0`, keyMeta);
        newLocalCellMetaMap.set(`0-1`, valueMeta);
        localHotData = [[keyDisplay, valueDisplay]];
    }
    return { preparedHotData: localHotData, preparedColHeaders: localColHeaders, preparedCellMetaMap: newLocalCellMetaMap };
}

export function destroyHotInstance() {
    if (hotInstance) {
        hotInstance.destroy();
        hotInstance = null;
    }
    cellMetaMap.clear();
    lastClickInfo = { row: -1, col: -1, time: 0 };
    return null;
}

export function displayDataWithHandsontable(data, dataKeyName, config) {
    const container = config.tableViewDomElement;
    destroyHotInstance();
    if (container) container.innerHTML = '';

    const { preparedHotData, preparedColHeaders, preparedCellMetaMap: newMap } = _prepareTableData(data, dataKeyName, config);
    cellMetaMap = newMap;

    if (!container) {
        console.error("Handsontable 컨테이너를 찾을 수 없습니다.");
        return null;
    }

    hotInstance = new Handsontable(container, {
        data: preparedHotData,
        rowHeaders: true,
        colHeaders: preparedColHeaders,
        manualColumnResize: true,
        manualRowResize: true,
        contextMenu: {
            items: {
                "view_key_content": {
                    name: '내용 보기 (View Content)',
                    hidden: function() {
                        const hotMenu = this;
                        const selection = hotMenu.getSelectedRangeLast();
                        if (!selection) return true;

                        const { from } = selection;
                        const r = from.row;
                        const c = from.col;

                        if (c !== 0) return true;
                        if (typeof data !== 'object' || data === null || Array.isArray(data)) {
                            return true;
                        }
                        const objectKeys = Object.keys(data);
                        if (r >= objectKeys.length) {
                            return true;
                        }
                        const keyName = objectKeys[r];
                        const value = data[keyName];
                        if (typeof value !== 'object' || value === null) {
                            return true;
                        }
                        return false;
                    },
                    callback: function(_key, selection) {
                        const hotMenu = this;

                        if (!selection || selection.length === 0 || !selection[0] || !selection[0].start) {
                            console.error('View Content callback: 유효하지 않은 selection 객체입니다.', selection);
                            return;
                        }

                        const startCell = selection[0].start;
                        const r = startCell.row;

                        const objectKeys = Object.keys(data);
                        if (r >= objectKeys.length) {
                            console.error('View Content callback: 행 인덱스가 범위를 벗어났습니다.', r, objectKeys);
                            return;
                        }
                        const keyName = objectKeys[r];
                        const valueToDisplay = data[keyName];

                        if (typeof valueToDisplay !== 'object' || valueToDisplay === null) {
                            console.error('View Content callback: 대상 값이 객체나 배열이 아닙니다.', valueToDisplay);
                            showConfirmationPopup({ title: '오류', text: '내용을 볼 수 있는 대상(객체/배열)이 아닙니다.', icon: 'error', showCancelButton: false, hotInstance: hotMenu });
                            return;
                        }

                        const basePath = config.dataPathString || "";
                        const drillPath = basePath ? `${basePath}.${keyName}` : keyName;

                        config.displayTableCallback(
                            valueToDisplay,
                            keyName,
                            config.rootJsonData,
                            drillPath
                        );
                    }
                },
                "row_above": { name: '위에 행 삽입' },
                "row_below": { name: '아래에 행 삽입' },
                "col_left": { name: '왼쪽에 열 삽입' },
                "col_right": { name: '오른쪽에 열 삽입' },
                "remove_row": { name: '선택한 행 삭제' },
                "remove_col": { name: '선택한 열 삭제' },
                "---------": Handsontable.plugins.ContextMenu.SEPARATOR,
                "duplicate_row": {
                    name: "선택 행 복제",
                    hidden: function() { const s = this.getSelectedRangeLast(); return !s ? true : !(Array.isArray(data) || (typeof data === 'object' && data !== null && !Array.isArray(data))); },
                    callback: async function(_key, selection) {
                        const hot = this;
                        const startRow = selection[0].start.row;
                        if (Array.isArray(data)) {
                            if (startRow >= 0 && startRow < data.length) {
                                const clonedItem = JSON.parse(JSON.stringify(data[startRow]));
                                data.splice(startRow + 1, 0, clonedItem);
                                config.refreshTreeViewCallback('row_duplicated_array_hot');

                                const { preparedHotData, preparedColHeaders, preparedCellMetaMap: newMap } = _prepareTableData(data, dataKeyName, config);
                                cellMetaMap = newMap;
                                hot.updateSettings({ colHeaders: preparedColHeaders });
                                hot.loadData(preparedHotData);
                            }
                        } else if (typeof data === 'object' && data !== null) {
                            const objectKeys = Object.keys(data);
                            if (startRow < 0 || startRow >= objectKeys.length) return;
                            const originalKey = objectKeys[startRow];
                            let newKeyBase = originalKey + "_복제본";
                            let newKeySuggestion = newKeyBase;
                            let counter = 1;
                            while (data.hasOwnProperty(newKeySuggestion)) { newKeySuggestion = `${newKeyBase}_${counter++}`; }

                            showTextInputPopup({
                                title: '새 키 입력 (행 복제)',
                                inputValue: newKeySuggestion,
                                confirmButtonText: '복제',
                                inputValidator:(v)=>{const n=v.trim();if(!n)return '키 이름은 비워둘 수 없습니다!';if(n!==originalKey&&data.hasOwnProperty(n))return '이미 사용 중인 키입니다.';return null;},
                                hotInstance: hot
                            }).then(res => {
                                if (res.isConfirmed && res.value !== undefined) {
                                    const finalNewKey = res.value.trim();
                                    const clonedValue = JSON.parse(JSON.stringify(data[originalKey]));
                                    const orderedData = {};
                                    for (const k_ of Object.keys(data)) {
                                        orderedData[k_] = data[k_];
                                        if (k_ === originalKey) orderedData[finalNewKey] = clonedValue;
                                    }
                                    Object.keys(data).forEach(k_d => delete data[k_d]);
                                    Object.assign(data, orderedData);

                                    config.refreshTreeViewCallback('row_duplicated_object_hot_ordered');
                                    const { preparedHotData, preparedColHeaders, preparedCellMetaMap: newMap } = _prepareTableData(data, dataKeyName, config);
                                    cellMetaMap = newMap;
                                    hot.updateSettings({ colHeaders: preparedColHeaders });
                                    hot.loadData(preparedHotData);
                                }
                            });
                        }
                    }
                },
                "duplicate_col": {
                    name: "선택 열 복제",
                    hidden: function() { const s = this.getSelectedRangeLast(); return !s ? true : !(Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null && !Array.isArray(data[0])); },
                    callback: async function(_key, selection) {
                        const hot = this;
                        const startCol = selection[0].start.col;
                        const currentHeaders = hot.getColHeader();

                        if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null && !Array.isArray(data[0]) && Array.isArray(currentHeaders) && startCol >= 0 && startCol < currentHeaders.length) {
                            const originalHeader = currentHeaders[startCol];
                            if (typeof originalHeader !== 'string') return;

                            let newHeaderBase = originalHeader + "_복제본";
                            let newHeaderSuggestion = newHeaderBase;
                            let counter = 1;
                            while (data[0].hasOwnProperty(newHeaderSuggestion)) { newHeaderSuggestion = `${newHeaderBase}_${counter++}`; }

                            showTextInputPopup({
                                title: '새 열 키 입력 (열 복제)',
                                inputValue: newHeaderSuggestion,
                                confirmButtonText: '복제',
                                inputValidator: (v) => { const n = v.trim(); if (!n) return '키 이름은 비워둘 수 없습니다!'; if (data.length > 0 && data[0].hasOwnProperty(n) && n !== originalHeader) return '첫 번째 객체에 이미 해당 키가 존재합니다.'; return null; },
                                hotInstance: hot
                            }).then(res => {
                                if (res.isConfirmed && res.value !== undefined) {
                                    const finalNewHeader = res.value.trim();
                                    data.forEach(obj => {
                                        if (typeof obj === 'object' && obj !== null) {
                                            const clonedColumnValue = obj.hasOwnProperty(originalHeader) ? JSON.parse(JSON.stringify(obj[originalHeader])) : null;

                                            const newOrderedObj = {};
                                            let inserted = false;
                                            for (const currentKeyInLoop in obj) {
                                                if (obj.hasOwnProperty(currentKeyInLoop)) {
                                                    newOrderedObj[currentKeyInLoop] = obj[currentKeyInLoop];
                                                    if (currentKeyInLoop === originalHeader) {
                                                        newOrderedObj[finalNewHeader] = clonedColumnValue;
                                                        inserted = true;
                                                    }
                                                }
                                            }
                                            if (!inserted) {
                                                newOrderedObj[finalNewHeader] = clonedColumnValue;
                                            }

                                            Object.keys(obj).forEach(k_o => delete obj[k_o]);
                                            Object.assign(obj, newOrderedObj);
                                        }
                                    });
                                    config.refreshTreeViewCallback('col_duplicated_array_obj_hot_ordered');
                                    const { preparedHotData, preparedColHeaders, preparedCellMetaMap: newMap } = _prepareTableData(data, dataKeyName, config);
                                    cellMetaMap = newMap;
                                    hot.updateSettings({ colHeaders: preparedColHeaders });
                                    hot.loadData(preparedHotData);
                                }
                            });
                        }
                    }
                },
                "set_template": {
                    name: '템플릿으로 채우기',
                    hidden: function() {
                        const hotMenu = this;
                        const selection = hotMenu.getSelectedRangeLast();
                        if (!selection) return true;
                        const { from } = selection;
                        const r = from.row;
                        const c = from.col;
                        const currentCellMeta = cellMetaMap.get(`${r}-${c}`);
                        if (currentCellMeta && currentCellMeta.isPadding) return true;
                        const colHeadersArray = hotMenu.getColHeader();
                        const structureInfo = {
                            sourceData: data, pathPrefix: config.dataPathString, headers: Array.isArray(colHeadersArray) ? colHeadersArray : (colHeadersArray === true ? [] : []),
                            isSourceArray: Array.isArray(data), isSourceArrayOfObjects: Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && !Array.isArray(data[0]) && data[0] !== null,
                            cellMetaMap: cellMetaMap
                        };
                        const path = getPathForHotChange(r, c, structureInfo);
                        return path === null;
                    },
                    callback: async function(_key, selection) {
                        const hotMenu = this;
                        const cellCoords = selection[0].start ? selection[0].start : selection[0].from;
                        const r = cellCoords.row;
                        const c = cellCoords.col;

                        if (hotMenu && typeof hotMenu.deselectCell === 'function') {
                            hotMenu.deselectCell();
                        }

                        const currentAvailableTemplates = config.getTemplates();
                        if (!currentAvailableTemplates || currentAvailableTemplates.length === 0) {
                            showConfirmationPopup({ title: '알림', text: '사용 가능한 템플릿이 없습니다. 먼저 템플릿을 추가해주세요.', icon: 'info', showCancelButton: false, hotInstance: hotMenu });
                            return;
                        }

                        const templateOptions = {};
                        currentAvailableTemplates.forEach((template, index) => {
                            templateOptions[`tpl_idx_${index}`] = template.name;
                        });

                        const { value: selectedTemplateKey } = await Swal.fire({
                            title: '템플릿 선택 (Select Template)',
                            input: 'select',
                            inputOptions: templateOptions,
                            inputPlaceholder: '적용할 템플릿을 선택하세요',
                            showCancelButton: true,
                            confirmButtonText: '적용 (Apply)',
                            cancelButtonText: '취소 (Cancel)',
                            customClass: { popup: 'custom-swal-popup' }
                        });

                        if (selectedTemplateKey) {
                            const templateIndex = parseInt(selectedTemplateKey.replace('tpl_idx_', ''), 10);
                            const selectedTemplateObject = currentAvailableTemplates[templateIndex].value;
                            const stringifiedTemplate = JSON.stringify(selectedTemplateObject);

                            const colHeadersArray = hotMenu.getColHeader();
                            const structureInfo = {
                                sourceData: data, pathPrefix: config.dataPathString, headers: Array.isArray(colHeadersArray) ? colHeadersArray : (colHeadersArray === true ? [] : []),
                                isSourceArray: Array.isArray(data), isSourceArrayOfObjects: Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && !Array.isArray(data[0]) && data[0] !== null,
                                cellMetaMap: cellMetaMap
                            };
                            const pathToUpdate = getPathForHotChange(r, c, structureInfo);

                            if (pathToUpdate !== null) {
                                config.updateJsonDataCallback(pathToUpdate, stringifiedTemplate, false);
                                let updatedViewData = data;
                                const rootJsonContext = config.currentJsonDataRef ? config.currentJsonDataRef() : config.rootJsonData;
                                if (config.dataPathString) {
                                    updatedViewData = config.getObjectByPathCallback(rootJsonContext, config.dataPathString);
                                } else {
                                    updatedViewData = rootJsonContext;
                                }
                                if (updatedViewData === undefined) {
                                    updatedViewData = (pathToUpdate.includes('[') || pathToUpdate.includes('.')) ? {} : null;
                                }
                                const { preparedHotData, preparedColHeaders, preparedCellMetaMap: newMap } = _prepareTableData(updatedViewData, dataKeyName, config);
                                cellMetaMap = newMap;
                                hotMenu.updateSettings({ colHeaders: preparedColHeaders });
                                hotMenu.loadData(preparedHotData);
                            } else {
                                showConfirmationPopup({ title: '오류', text: '템플릿을 적용할 수 없는 셀입니다.', icon: 'error', showCancelButton: false, hotInstance: hotMenu });
                            }
                        }
                    }
                },
                "add_as_template": {
                    name: '템플릿에 추가',
                    hidden: function() {
                        const hotMenu = this;
                        const selection = hotMenu.getSelectedRangeLast();
                        if (!selection) return true;
                        const { from } = selection;
                        const r = from.row;
                        const c = from.col;

                        const colHeadersArray = hotMenu.getColHeader();
                        const structureInfo = {
                            sourceData: data, pathPrefix: config.dataPathString, headers: Array.isArray(colHeadersArray) ? colHeadersArray : (colHeadersArray === true ? [] : []),
                            isSourceArray: Array.isArray(data), isSourceArrayOfObjects: Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && !Array.isArray(data[0]) && data[0] !== null,
                            cellMetaMap: cellMetaMap
                        };
                        const path = getPathForHotChange(r, c, structureInfo);
                        if (path === null) return true;

                        const rootJsonContext = config.currentJsonDataRef ? config.currentJsonDataRef() : config.rootJsonData;
                        const cellValue = config.getObjectByPathCallback(rootJsonContext, path);

                        return !(typeof cellValue === 'object' && cellValue !== null);
                    },
                    callback: async function(_key, selection) {
                        const hotMenu = this;
                        const cellCoords = selection[0].start ? selection[0].start : selection[0].from;
                        const r = cellCoords.row;
                        const c = cellCoords.col;

                        const colHeadersArray = hotMenu.getColHeader();
                        const structureInfo = {
                            sourceData: data, pathPrefix: config.dataPathString, headers: Array.isArray(colHeadersArray) ? colHeadersArray : (colHeadersArray === true ? [] : []),
                            isSourceArray: Array.isArray(data), isSourceArrayOfObjects: Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && !Array.isArray(data[0]) && data[0] !== null,
                            cellMetaMap: cellMetaMap
                        };
                        const path = getPathForHotChange(r, c, structureInfo);
                        if (path === null) return;

                        const rootJsonContext = config.currentJsonDataRef ? config.currentJsonDataRef() : config.rootJsonData;
                        const cellValue = config.getObjectByPathCallback(rootJsonContext, path);

                        if (!(typeof cellValue === 'object' && cellValue !== null)) {
                            showConfirmationPopup({ title: '알림', text: '객체 또는 배열 형식의 값만 템플릿으로 추가할 수 있습니다.', icon: 'info', showCancelButton: false, hotInstance: hotMenu });
                            return;
                        }

                        if (hotMenu && typeof hotMenu.deselectCell === 'function') {
                            hotMenu.deselectCell();
                        }

                        const { value: templateName } = await showTextInputPopup({
                            title: '새 템플릿 이름 입력',
                            inputLabel: '저장할 템플릿의 이름을 입력하세요:',
                            inputValue: '',
                            confirmButtonText: '추가',
                            inputValidator: (value) => {
                                const trimmedVal = value.trim();
                                if (!trimmedVal) return '템플릿 이름은 비워둘 수 없습니다.';
                                const existingTemplates = config.getTemplates();
                                if (existingTemplates.some(t => t.name === trimmedVal)) {
                                    return '이미 사용중인 템플릿 이름입니다.';
                                }
                                return null;
                            },
                            hotInstance: hotMenu
                        });

                        if (templateName && templateName.trim()) {
                            const type = Array.isArray(cellValue) ? "array" : "object";
                            const addResult = config.addTemplate(templateName.trim(), type, cellValue);

                            if (addResult === true) {
                                showConfirmationPopup({ title: '성공', text: `템플릿 "${templateName.trim()}"이(가) 추가되었습니다.`, icon: 'success', showCancelButton: false, hotInstance: hotMenu });
                            } else if (addResult === 'duplicate_name') {
                                showConfirmationPopup({ title: '오류', text: `템플릿 이름 "${templateName.trim()}"이(가) 이미 존재합니다. 다른 이름을 사용해주세요.`, icon: 'error', showCancelButton: false, hotInstance: hotMenu });
                            } else {
                                showConfirmationPopup({ title: '오류', text: '템플릿 추가에 실패했습니다.', icon: 'error', showCancelButton: false, hotInstance: hotMenu });
                            }
                        }
                    }
                },
                "undo":{name:'실행 취소'},"redo":{name:'다시 실행'}
            }
        },
        fillHandle: true,
        licenseKey: 'non-commercial-and-evaluation',
        minSpareRows: 0,
        cells: function(row, col, prop) {
            const cellProperties = {};
            const meta = cellMetaMap.get(`${row}-${col}`);
            if (meta) {
                cellProperties.readOnly = meta.readOnly;
                if (meta.isDrillable) {
                    cellProperties.renderer = function(instance, td, r, c, p, value) {
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
            if (event.button !== 0) return;
            const currentTime = new Date().getTime();
            const { row, col } = coords;
            const meta = cellMetaMap.get(`${row}-${col}`);
            const DOUBLE_CLICK_THRESHOLD = 300;

            let isDoubleClick = false;
            if (meta && row === lastClickInfo.row && col === lastClickInfo.col && (currentTime - lastClickInfo.time) < DOUBLE_CLICK_THRESHOLD) {
                isDoubleClick = true;
                lastClickInfo = { row: -1, col: -1, time: 0 };
            } else {
                lastClickInfo = { row, col, time: currentTime };
            }

            if (isDoubleClick) {
                let isObjectKeyCell = false;
                const colHeaders = this.getColHeader();
                if (typeof data === 'object' && data !== null && !Array.isArray(data) && Array.isArray(colHeaders) && colHeaders.length > 0 && colHeaders[0] === "항목 (Key)" && col === 0 && meta) {
                    isObjectKeyCell = true;
                }
                if (isObjectKeyCell) {
                    const originalKey = meta.originalKey;
                    const parentObject = data;
                    const parentPath = config.dataPathString;

                    showTextInputPopup({
                        title: `키 이름 변경: "${originalKey}"`, inputValue: originalKey, customClass: { popup: 'custom-swal-popup' }, confirmButtonText: '저장',
                        inputValidator: (v) => { const n = v.trim(); if (!n) return '키 이름은 비워둘 수 없습니다!'; if (parentObject.hasOwnProperty(n) && n !== originalKey) return '이미 사용 중인 키입니다!'; return null; },
                        hotInstance: this
                    }).then(res => {
                        if (res.isConfirmed && res.value !== undefined) {
                            const newKey = res.value.trim();
                            if (newKey !== originalKey && config.updateJsonKeyCallback) {
                                config.updateJsonKeyCallback(parentPath, originalKey, newKey, parentObject);
                            }
                        }
                    });
                    return;
                }
            }
            if (meta && meta.isDrillable && meta.originalValue !== undefined) {
                const isObjectKeyColumnDrill = (typeof data === 'object' && data !== null && !Array.isArray(data) && col === 0 && meta && meta.isDrillable);
                if (!isDoubleClick || (isDoubleClick && !isObjectKeyColumnDrill && meta.drillPath)) {
                    if (typeof meta.originalValue === 'object' && meta.originalValue !== null) {
                        config.displayTableCallback(meta.originalValue, meta.originalKey, config.rootJsonData, meta.drillPath);
                    }
                }
            }
        },
        afterChange: function(changes, source) {
            if (source === 'loadData' || !changes || !Array.isArray(changes) || changes.length === 0) return;
            const isBatchOperation = (source === 'CopyPaste.paste' || source === 'Autofill.fill' || changes.length > 1);
            const colHeadersArray = this.getColHeader();

            changes.forEach(([row, prop, oldValue, newValue]) => {
                let actualColumnIndex = -1;
                if (typeof prop === 'number') { actualColumnIndex = prop; }
                else if (typeof prop === 'string' && Array.isArray(colHeadersArray)) { actualColumnIndex = colHeadersArray.indexOf(prop); }

                if (actualColumnIndex === -1) {
                    if (typeof prop === 'number' && colHeadersArray === true) { actualColumnIndex = prop; }
                    else { console.warn("afterChange: 컬럼 인덱스 결정 불가:", row, prop, colHeadersArray); return; }
                }

                const structureInfoForPath = {
                    sourceData: data, pathPrefix: config.dataPathString, headers: Array.isArray(colHeadersArray) ? colHeadersArray : (colHeadersArray === true ? [] : []),
                    isSourceArray: Array.isArray(data), isSourceArrayOfObjects: Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && !Array.isArray(data[0]) && data[0] !== null,
                    cellMetaMap: cellMetaMap
                };
                let pathToUpdate = getPathForHotChange(row, actualColumnIndex, structureInfoForPath);

                if (pathToUpdate !== null) {
                    config.updateJsonDataCallback(pathToUpdate, String(newValue), isBatchOperation, oldValue);
                    if (typeof config.convertToTypedValueCallback(String(newValue), oldValue) !== typeof oldValue && oldValue !== null ) {
                    }

                }
            });

            if (isBatchOperation && config.refreshTreeViewCallback) {
                config.refreshTreeViewCallback("batch_update_handsontable_afterChange");
            }
        },
        afterCreateRow: function(index, amount, source) {
            if (source === 'loadData' || !config.currentJsonDataRef) return;
            const hot = this;
            let currentViewData = data;
            let dataWasModified = false;

            if (Array.isArray(currentViewData)) {
                const columnHeaders = hot.getColHeader();
                for (let i = 0; i < amount; i++) {
                    let newItem = null;
                    if (Array.isArray(columnHeaders) && columnHeaders.length > 0 && (columnHeaders.length !==2 || columnHeaders[0] !== "Index" || columnHeaders[1] !== "Value")) {
                        newItem = {};
                        columnHeaders.forEach(headerKey => {
                            if (typeof headerKey === 'string') { newItem[headerKey] = null; }
                        });
                    }
                    currentViewData.splice(index + i, 0, newItem);
                }
                dataWasModified = true;
                if (dataWasModified) config.refreshTreeViewCallback('row_added_array_hot');

            } else if (typeof currentViewData === 'object' && currentViewData !== null && !Array.isArray(currentViewData)) {
                (async () => {
                    let tempObjectData = { ...currentViewData };
                    let keysAddedSuccessCount = 0;

                    for (let i = 0; i < amount; i++) {
                        const visualIndexToInsertAt = index + i;
                        const popupResult = await showTextInputPopup({
                            title: `새 항목 키 입력 (${i + 1}/${amount})`, inputPlaceholder: '새로운 키 이름을 입력하세요', confirmButtonText: '추가',
                            inputValidator: (value) => { const trimmedValue = value.trim(); if (!trimmedValue) return '키 이름은 비워둘 수 없습니다!'; if (tempObjectData.hasOwnProperty(trimmedValue)) return '이미 사용 중인 키입니다.'; return null; },
                            hotInstance: hot
                        });

                        if (popupResult.isConfirmed && popupResult.value !== undefined) {
                            const newKey = popupResult.value.trim();
                            const valueToInsert = null;
                            const currentKeysInOrder = Object.keys(tempObjectData);
                            const newStructuredObject = {};
                            let keyInserted = false;
                            for (let k_idx = 0; k_idx < currentKeysInOrder.length; k_idx++) {
                                if (k_idx === visualIndexToInsertAt && !keyInserted) {
                                    newStructuredObject[newKey] = valueToInsert;
                                    keyInserted = true;
                                }
                                newStructuredObject[currentKeysInOrder[k_idx]] = tempObjectData[currentKeysInOrder[k_idx]];
                            }
                            if (!keyInserted) newStructuredObject[newKey] = valueToInsert;
                            tempObjectData = newStructuredObject;
                            keysAddedSuccessCount++;
                        } else { break; }
                    }

                    if (keysAddedSuccessCount > 0) {
                        Object.keys(currentViewData).forEach(key => delete currentViewData[key]);
                        Object.assign(currentViewData, tempObjectData);
                        dataWasModified = true;
                        config.refreshTreeViewCallback('key_added_object_hot_ordered');
                    }

                    const { preparedHotData, preparedColHeaders, preparedCellMetaMap: newMap } = _prepareTableData(currentViewData, dataKeyName, config);
                    cellMetaMap = newMap;
                    hot.updateSettings({ colHeaders: preparedColHeaders });
                    hot.loadData(preparedHotData);
                })();
                return;
            }

            if (dataWasModified || source !== 'loadData') {
                const { preparedHotData, preparedColHeaders, preparedCellMetaMap: newMap } = _prepareTableData(currentViewData, dataKeyName, config);
                cellMetaMap = newMap;
                hot.updateSettings({ colHeaders: preparedColHeaders });
                hot.loadData(preparedHotData);
            }
        },
        afterCreateCol: function(index, amount, source) {
            if (source === 'loadData' || !config.currentJsonDataRef) return;
            const hot = this;
            let currentViewData = data;
            let dataWasModified = false;

            if (Array.isArray(currentViewData) && currentViewData.length > 0 && typeof currentViewData[0] === 'object' && currentViewData[0] !== null && !Array.isArray(currentViewData[0])) {
                (async () => {
                    for (let i = 0; i < amount; i++) {
                        const visualColIndexToInsertAt = index + i;
                        const popupResult = await showTextInputPopup({
                            title: `새 열(속성)의 키 입력 (${i + 1}/${amount})`, inputPlaceholder: '새로운 키 이름을 입력하세요', confirmButtonText: '추가',
                            inputValidator: (value) => { const trimmedValue = value.trim(); if (!trimmedValue) return '키 이름은 비워둘 수 없습니다!'; if (currentViewData[0].hasOwnProperty(trimmedValue)) return '첫 번째 객체에 이미 해당 키가 존재합니다.'; return null; },
                            hotInstance: hot
                        });

                        if (popupResult.isConfirmed && popupResult.value !== undefined) {
                            const newKeyName = popupResult.value.trim();
                            currentViewData.forEach(obj => {
                                if (typeof obj === 'object' && obj !== null) {
                                    const currentKeys = Object.keys(obj);
                                    const newOrderedObj = {};
                                    let inserted = false;
                                    if (visualColIndexToInsertAt >= currentKeys.length) {
                                        obj[newKeyName] = null;
                                    } else {
                                        for(let k_idx=0; k_idx < currentKeys.length; k_idx++) {
                                            if (k_idx === visualColIndexToInsertAt && !inserted) { newOrderedObj[newKeyName] = null; inserted = true; }
                                            newOrderedObj[currentKeys[k_idx]] = obj[currentKeys[k_idx]];
                                        }
                                        if (!inserted) newOrderedObj[newKeyName] = null;
                                        Object.keys(obj).forEach(k_o => delete obj[k_o]);
                                        Object.assign(obj, newOrderedObj);
                                    }
                                }
                            });
                            dataWasModified = true;
                        } else { break; }
                    }
                    if (dataWasModified) config.refreshTreeViewCallback('col_added_array_of_obj_hot_ordered');

                    const { preparedHotData, preparedColHeaders, preparedCellMetaMap: newMap } = _prepareTableData(currentViewData, dataKeyName, config);
                    cellMetaMap = newMap;
                    hot.updateSettings({ colHeaders: preparedColHeaders });
                    hot.loadData(preparedHotData);
                })();
                return;
            } else if (typeof currentViewData === 'object' && currentViewData !== null && !Array.isArray(currentViewData)) {
                showConfirmationPopup({ title: '오류', text: '현재 데이터 구조에는 열을 추가할 수 없습니다.', icon: 'error', showCancelButton: false, hotInstance: hot })
                    .then(() => {
                        const { preparedHotData, preparedColHeaders, preparedCellMetaMap: newMap } = _prepareTableData(currentViewData, dataKeyName, config);
                        cellMetaMap = newMap;
                        hot.updateSettings({ colHeaders: preparedColHeaders });
                        hot.loadData(preparedHotData);
                    });
            } else {
                showConfirmationPopup({ title: '오류', text: '현재 데이터 구조에는 열을 추가할 수 없습니다.', icon: 'error', showCancelButton: false, hotInstance: hot });
                const { preparedHotData, preparedColHeaders, preparedCellMetaMap: newMap } = _prepareTableData(currentViewData, dataKeyName, config);
                cellMetaMap = newMap;
                hot.updateSettings({ colHeaders: preparedColHeaders });
                hot.loadData(preparedHotData);
            }
        },
        beforeRemoveRow: function(index, amount, physicalRows, source) {
            if (source === 'loadData' || !config.currentJsonDataRef) return true;
            let currentViewData = data;
            physicalRows.sort((a, b) => b - a);

            if (Array.isArray(currentViewData)) {
                physicalRows.forEach(rowIndex => {
                    if (rowIndex >= 0 && rowIndex < currentViewData.length) { currentViewData.splice(rowIndex, 1); }
                });
            } else if (typeof currentViewData === 'object' && currentViewData !== null && !Array.isArray(currentViewData)) {
                const keys = Object.keys(currentViewData);
                const keysToRemove = physicalRows.map(rowIndex => keys[rowIndex]).filter(key => key !== undefined);
                if (keysToRemove.length > 0) { keysToRemove.forEach(key => { delete currentViewData[key]; });}
            } else {
                return false;
            }
            return true;
        },
        afterRemoveRow: function(index, amount, physicalRows, source) {
            if (source === 'loadData' || !config.currentJsonDataRef || source === 'ContextMenu.remove_row_custom') return;
            const hot = this;
            let currentViewData = data;

            config.refreshTreeViewCallback('row_removed_hot');
            const { preparedHotData, preparedColHeaders, preparedCellMetaMap: newMap } = _prepareTableData(currentViewData, dataKeyName, config);
            cellMetaMap = newMap;
            hot.updateSettings({ colHeaders: preparedColHeaders });
            hot.loadData(preparedHotData);
        },
        beforeRemoveCol: function(index, amount, physicalCols, source) {
            if (source === 'loadData' || !config.currentJsonDataRef) return true;
            let currentViewData = data;
            const colHeaders = this.getColHeader();

            if (Array.isArray(currentViewData) && currentViewData.length > 0 && typeof currentViewData[0] === 'object' && currentViewData[0] !== null && !Array.isArray(currentViewData[0])) {
                if (!Array.isArray(colHeaders)) { showConfirmationPopup({ title: '오류', text: '열 헤더 정보를 가져올 수 없습니다.', icon: 'error', showCancelButton: false, hotInstance: this }); return false; }
                physicalCols.sort((a, b) => b - a);
                physicalCols.forEach(colIndex => {
                    if (colIndex >= 0 && colIndex < colHeaders.length) {
                        const keyToRemove = colHeaders[colIndex];
                        if (typeof keyToRemove === 'string') {
                            currentViewData.forEach(obj => {
                                if (typeof obj === 'object' && obj !== null) { delete obj[keyToRemove]; }
                            });
                        }
                    }
                });
            } else if (typeof currentViewData === 'object' && currentViewData !== null && !Array.isArray(currentViewData)) {
                showConfirmationPopup({ title: '오류', text: '이 뷰에서 특정 열 부분 삭제는 지원되지 않습니다.', icon: 'error', showCancelButton: false, hotInstance: this });
                return false;
            } else {
                showConfirmationPopup({ title: '오류', text: '현재 데이터 구조에서는 열을 삭제할 수 없습니다.', icon: 'error', showCancelButton: false, hotInstance: this });
                return false;
            }
            return true;
        },
        afterRemoveCol: function(index, amount, physicalCols, source) {
            if (source === 'loadData' || !config.currentJsonDataRef) return;
            const hot = this;
            let currentViewData = data;

            config.refreshTreeViewCallback('col_removed_hot');
            const { preparedHotData, preparedColHeaders, preparedCellMetaMap: newMap } = _prepareTableData(currentViewData, dataKeyName, config);
            cellMetaMap = newMap;
            hot.updateSettings({ colHeaders: preparedColHeaders });
            hot.loadData(preparedHotData);
        }
    });
    return hotInstance;
}

function getPathForHotChange(row, col, structureInfo) {
    const { sourceData, pathPrefix, headers, isSourceArray, isSourceArrayOfObjects, cellMetaMap: currentCellMetaMap } = structureInfo;
    let itemSubPath = "";

    if (isSourceArray) {
        if (row < sourceData.length) {
            if (isSourceArrayOfObjects) {
                if (Array.isArray(headers) && col >= 0 && col < headers.length) {
                    const propertyName = headers[col];
                    itemSubPath = `[${row}].${propertyName}`;
                } else { return null; }
            } else {
                if (col === 1) { itemSubPath = `[${row}]`; }
                else { return null; }
            }
        } else { return null; }
    } else if (typeof sourceData === 'object' && sourceData !== null && !Array.isArray(sourceData)) {
        const metaKeyCell = currentCellMetaMap.get(`${row}-0`);
        if (!metaKeyCell || metaKeyCell.originalKey === undefined) return null;

        const objectKeyForRow = metaKeyCell.originalKey;
        if (col === 0) return null;

        const isArrayExpandedInObjectView = Array.isArray(headers) && headers.length > 1 && headers[0] === "항목 (Key)" && !isNaN(parseInt(headers[1],10)) ;
        const isSimpleObjectView = Array.isArray(headers) && headers.length === 2 && headers[0] === "항목 (Key)" && headers[1] === "값 (Value)";

        if (isArrayExpandedInObjectView) {
            if (col > 0 && col < headers.length) {
                const arrayIndexString = headers[col];
                const valueAtKey = sourceData[objectKeyForRow];
                if (Array.isArray(valueAtKey)) {
                    const currentCellMeta = currentCellMetaMap.get(`${row}-${col}`);
                    if (currentCellMeta && currentCellMeta.isPadding) return null;
                    itemSubPath = `.${objectKeyForRow}[${arrayIndexString}]`;
                } else { return null; }
            } else { return null; }
        } else if (isSimpleObjectView) {
            if (col === 1) { itemSubPath = `.${objectKeyForRow}`; }
            else { return null; }
        } else {
            if (Object.keys(sourceData).length === 0 && Array.isArray(headers) && headers.length === 2 && headers[0] === "항목 (Key)" && headers[1] === "값 (Value)") return null;
            return null;
        }
    } else {
        if (row === 0 && col === 1) { return pathPrefix || ""; }
        else { return null; }
    }

    if (pathPrefix) {
        if (itemSubPath.startsWith('.')) { return pathPrefix + itemSubPath; }
        else if (itemSubPath.startsWith('[')) { return pathPrefix + itemSubPath; }
        else if (itemSubPath) { return pathPrefix + '.' + itemSubPath; }
        return pathPrefix;
    } else {
        return itemSubPath.startsWith('.') ? itemSubPath.substring(1) : itemSubPath;
    }
}