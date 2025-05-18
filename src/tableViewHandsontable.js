import Handsontable from 'handsontable';
import 'handsontable/dist/handsontable.full.min.css';
import { showTextInputPopup, showConfirmationPopup } from './customPopup.js';

let hotInstance = null; // 현재 Handsontable 인스턴스를 저장하는 변수
let cellMetaMap = new Map(); // 셀 메타 정보를 저장하는 맵
let lastClickInfo = { row: -1, col: -1, time: 0 }; // 마지막 클릭 정보를 저장하여 더블 클릭을 감지하는 객체

// 특정 값에 대한 표시 텍스트와 셀 메타데이터를 준비합니다.
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

// Handsontable에 표시할 데이터, 컬럼 헤더, 셀 메타 정보를 준비합니다.
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
            if (data.length === 0) { // 데이터가 없는 배열이지만, 객체의 배열 컨텍스트를 가질 수 있음
                if (Array.isArray(config.rootJsonData) && config.rootJsonData.length > 0 && typeof config.rootJsonData[0] === 'object' && config.rootJsonData[0] !== null && Object.keys(config.rootJsonData[0]).length > 0 ) {
                    // 비어있는 배열이 실제로 객체 배열의 일부였던 경우, 루트 데이터에서 헤더를 시도
                    // localColHeaders = Object.keys(config.rootJsonData[0]); // 이 방식은 dataPathString의 컨텍스트에 따라 달라짐
                } else if (localColHeaders === true || (Array.isArray(localColHeaders) && localColHeaders.length === 0)) {
                    localColHeaders = ["데이터 없음"]; // 기본 헤더
                }
            }
        } else {
            localColHeaders = ["Index", "Value"];
            localHotData = data.map((item, index) => {
                const { displayValue: indexDisplay, cellMeta: indexMeta } = prepareHotCell(index, currentDataPath, String(index), true, configForCellPrep);
                const { displayValue: valueDisplay, cellMeta: valueMeta } = prepareHotCell(item, currentDataPath, String(index), false, configForCellPrep);
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
                const { displayValue: keyDisplay, cellMeta: keyMeta } = prepareHotCell(key, currentDataPath, key, true, configForCellPrep);
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
                const { displayValue: keyDisplay, cellMeta: keyMeta } = prepareHotCell(key, currentDataPath, key, true, configForCellPrep);
                const { displayValue: valueDisplay, cellMeta: valueMeta } = prepareHotCell(value, currentDataPath, key, false, configForCellPrep);
                newLocalCellMetaMap.set(`${rowIndex}-0`, keyMeta);
                newLocalCellMetaMap.set(`${rowIndex}-1`, valueMeta);
                return [keyDisplay, valueDisplay];
            });
        }
    } else {
        localColHeaders = ["항목", "값"];
        const keyStr = dataKeyName || (data === null || data === undefined ? String(data) : "Value");
        const { displayValue: keyDisplay, cellMeta: keyMeta } = prepareHotCell(keyStr, currentDataPath, '', true, configForCellPrep);
        const { displayValue: valueDisplay, cellMeta: valueMeta } = prepareHotCell(data, currentDataPath, '', false, configForCellPrep);
        newLocalCellMetaMap.set(`0-0`, keyMeta);
        newLocalCellMetaMap.set(`0-1`, valueMeta);
        localHotData = [[keyDisplay, valueDisplay]];
    }
    return { preparedHotData: localHotData, preparedColHeaders: localColHeaders, preparedCellMetaMap: newLocalCellMetaMap };
}

// 현재 Handsontable 인스턴스를 파괴합니다.
export function destroyHotInstance() {
    if (hotInstance) {
        hotInstance.destroy();
        hotInstance = null;
    }
    return null;
}

// 주어진 데이터를 사용하여 Handsontable 인스턴스를 생성하고 화면에 표시합니다.
export function displayDataWithHandsontable(data, dataKeyName, config) {
    const container = config.tableViewDomElement;
    destroyHotInstance();
    if (container) container.innerHTML = '';

    const { preparedHotData, preparedColHeaders, preparedCellMetaMap: newMap } = _prepareTableData(data, dataKeyName, config);
    cellMetaMap = newMap;
    lastClickInfo = { row: -1, col: -1, time: 0 }; // 새 인스턴스 생성 시 더블클릭 정보 초기화

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
                "row_above": { name: '위에 행 삽입' },
                "row_below": { name: '아래에 행 삽입' },
                "col_left": { name: '왼쪽에 열 삽입' },
                "col_right": { name: '오른쪽에 열 삽입' },
                "remove_row": { name: '선택한 행 삭제' },
                "remove_col": { name: '선택한 열 삭제' },
                "---------": Handsontable.plugins.ContextMenu.SEPARATOR,
                "duplicate_row": { // 선택한 행을 복제합니다.
                    name: "선택 행 복제",
                    hidden: function() { const s = this.getSelectedRangeLast(); return !s ? true : !(Array.isArray(data) || (typeof data === 'object' && data !== null && !Array.isArray(data))); },
                    callback: async function(key, selection) {
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
                                inputValidator:(v)=>{const n=v.trim();if(!n)return '키 이름은 비워둘 수 없습니다!';if(n!==originalKey&&data.hasOwnProperty(n))return '이미 사용 중인 키입니다.';if(/^\d+$/.test(n))return '키 이름은 숫자만으로 구성될 수 없습니다.';return null;},
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
                "duplicate_col": { // 선택한 열을 복제합니다. (객체의 배열 뷰에서 사용)
                    name: "선택 열 복제",
                    hidden: function() { const s = this.getSelectedRangeLast(); return !s ? true : !(Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null && !Array.isArray(data[0])); },
                    callback: async function(key, selection) {
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
                                inputValidator: (v) => { const n = v.trim(); if (!n) return '키 이름은 비워둘 수 없습니다!'; if (data.length > 0 && data[0].hasOwnProperty(n) && n !== originalHeader) return '첫 번째 객체에 이미 해당 키가 존재합니다.'; if (/^\d+$/.test(n)) return '키 이름은 숫자만으로 구성될 수 없습니다.'; return null; },
                                hotInstance: hot
                            }).then(res => {
                                if (res.isConfirmed && res.value !== undefined) {
                                    const finalNewHeader = res.value.trim();
                                    data.forEach(obj => {
                                        if (typeof obj === 'object' && obj !== null) {
                                            const clonedColumnValue = obj.hasOwnProperty(originalHeader) ? JSON.parse(JSON.stringify(obj[originalHeader])) : null;
                                            const orderedObject = {};
                                            let inserted = false;
                                            const keys = Object.keys(obj);
                                            for(let k_idx = 0; k_idx < keys.length; k_idx++){
                                                const currentKey = keys[k_idx];
                                                orderedObject[currentKey] = obj[currentKey];
                                                if(currentKey === originalHeader){
                                                    // 삽입 위치를 원본 열 다음으로 하거나, 선택한 열의 인덱스를 활용
                                                    const temp = {};
                                                    temp[finalNewHeader] = clonedColumnValue;
                                                    // 객체 키 순서 변경 로직 (복잡할 수 있으므로, 여기서는 단순 추가 후 재정렬 또는 마지막에 추가)
                                                    // 여기서는 원본 키 다음에 새 키를 삽입하는 효과를 내기 위해, 전체 객체를 재구성하는 방식을 택합니다.
                                                    // 실제로는 사용자가 열 순서를 직접 변경할 수 있도록 하는 것이 더 나을 수 있습니다.
                                                    // 아래는 단순화된 접근으로, 원본 키 다음에 새 키를 두도록 시도합니다.
                                                }
                                            }
                                            // 더 간단하게는, 기존 객체에 새 키를 추가하고, 필요시 순서는 _prepareTableData에서 처리
                                            obj[finalNewHeader] = clonedColumnValue;
                                            // 만약 특정 위치에 삽입해야 한다면, Object.entries, splice, Object.fromEntries 사용
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
                "make_array":{ // 선택한 값을 빈 배열 []로 변경합니다. (객체의 값 셀에서 사용)
                    name:'값을 빈 배열 [] 로 변경',
                    hidden:function(){const s=this.getSelectedRangeLast();if(!s)return true;const{from}=s; return !(typeof data==='object'&&data!==null&&!Array.isArray(data)&&from.col===1);}, // 값 컬럼(1)에서만
                    callback:function(key,selection){
                        const hot = this;
                        const row = selection[0].start.row;
                        const metaKeyCell = cellMetaMap.get(`${row}-0`); // 키 컬럼의 메타 정보
                        if(metaKeyCell && metaKeyCell.originalKey && typeof data==='object' && data!==null){
                            data[metaKeyCell.originalKey]=[];
                            config.refreshTreeViewCallback('value_to_array_hot');
                            const { preparedHotData, preparedColHeaders, preparedCellMetaMap: newMap } = _prepareTableData(data, dataKeyName, config);
                            cellMetaMap = newMap;
                            hot.updateSettings({ colHeaders: preparedColHeaders });
                            hot.loadData(preparedHotData);
                        }
                    }
                },
                "make_object":{ // 선택한 값을 빈 객체 {}로 변경합니다. (객체의 값 셀에서 사용)
                    name:'값을 빈 객체 {} 로 변경',
                    hidden:function(){const s=this.getSelectedRangeLast();if(!s)return true;const{from}=s;return !(typeof data==='object'&&data!==null&&!Array.isArray(data)&&from.col===1);},
                    callback:function(key,selection){
                        const hot = this;
                        const row = selection[0].start.row;
                        const metaKeyCell = cellMetaMap.get(`${row}-0`);
                        if(metaKeyCell && metaKeyCell.originalKey && typeof data==='object' && data!==null){
                            data[metaKeyCell.originalKey]={};
                            config.refreshTreeViewCallback('value_to_object_hot');
                            const { preparedHotData, preparedColHeaders, preparedCellMetaMap: newMap } = _prepareTableData(data, dataKeyName, config);
                            cellMetaMap = newMap;
                            hot.updateSettings({ colHeaders: preparedColHeaders });
                            hot.loadData(preparedHotData);
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
            const DOUBLE_CLICK_THRESHOLD = 300; // 더블 클릭 간격 (ms)

            let isDoubleClick = false;
            if (meta && row === lastClickInfo.row && col === lastClickInfo.col && (currentTime - lastClickInfo.time) < DOUBLE_CLICK_THRESHOLD) {
                isDoubleClick = true;
                lastClickInfo = { row: -1, col: -1, time: 0 }; // 더블 클릭 후 초기화
            } else {
                lastClickInfo = { row, col, time: currentTime };
            }

            if (isDoubleClick) {
                let isObjectKeyCell = false;
                const colHeaders = this.getColHeader(); // 'this'는 hotInstance
                if (typeof data === 'object' && data !== null && !Array.isArray(data) && Array.isArray(colHeaders) && colHeaders.length > 0 && colHeaders[0] === "항목 (Key)" && col === 0 && meta) {
                    isObjectKeyCell = true;
                }
                if (isObjectKeyCell) {
                    const originalKey = meta.originalKey;
                    const parentObject = data; // 현재 뷰의 데이터 객체
                    const parentPath = config.dataPathString;

                    showTextInputPopup({
                        title: `키 이름 변경: "${originalKey}"`,
                        inputValue: originalKey,
                        customClass: { popup: 'custom-swal-popup' },
                        confirmButtonText: '저장',
                        inputValidator: (v) => { const n = v.trim(); if (!n) return '키 이름은 비워둘 수 없습니다!'; if (/^\d+$/.test(n)) return '키 이름은 숫자만으로 구성될 수 없습니다!'; if (parentObject.hasOwnProperty(n) && n !== originalKey) return '이미 사용 중인 키입니다!'; return null; },
                        hotInstance: this
                    }).then(res => {
                        if (res.isConfirmed && res.value !== undefined) {
                            const newKey = res.value.trim();
                            if (newKey !== originalKey && config.updateJsonKeyCallback) {
                                // updateJsonKeyCallback은 app.js에 있으며, 전체 JSON 데이터를 업데이트하고
                                // refreshTreeView와 displayDataInTable을 호출하여 UI를 완전히 새로고침합니다.
                                // 따라서 여기서는 추가적인 loadData가 필요 없습니다.
                                config.updateJsonKeyCallback(parentPath, originalKey, newKey, parentObject);
                            }
                        }
                    });
                    return; // 키 이름 변경 팝업 후 추가 동작 방지
                }
            }
            // 드릴다운 로직 (더블클릭이 아니거나, 더블클릭이지만 키 수정 셀이 아닌 경우)
            if (meta && meta.isDrillable && meta.originalValue !== undefined) {
                const isObjectKeyColumnDrill = (typeof data === 'object' && data !== null && !Array.isArray(data) && col === 0 && meta && meta.isDrillable);
                if (!isDoubleClick || (isDoubleClick && !isObjectKeyColumnDrill && meta.drillPath)) {
                    if (typeof meta.originalValue === 'object' && meta.originalValue !== null) {
                        // displayTableCallback은 app.js의 displayDataInTable을 호출하며,
                        // 이는 내부적으로 destroyHotInstance 후 새 인스턴스를 생성하므로 이 경우는 괜찮습니다. (네비게이션)
                        config.displayTableCallback(meta.originalValue, meta.originalKey, config.rootJsonData, meta.drillPath);
                    }
                }
            }
        },
        afterChange: function(changes, source) { // 셀 내용 변경 후 호출됩니다.
            if (source === 'loadData' || !changes || !Array.isArray(changes) || changes.length === 0) return;
            const isBatchOperation = (source === 'CopyPaste.paste' || source === 'Autofill.fill' || changes.length > 1);
            const colHeadersArray = this.getColHeader();

            changes.forEach(([row, prop, oldValue, newValue]) => {
                let actualColumnIndex = -1;
                if (typeof prop === 'number') {
                    actualColumnIndex = prop;
                } else if (typeof prop === 'string' && Array.isArray(colHeadersArray)) {
                    actualColumnIndex = colHeadersArray.indexOf(prop);
                }

                if (actualColumnIndex === -1) {
                    if (typeof prop === 'number' && colHeadersArray === true) {
                        actualColumnIndex = prop;
                    } else {
                        console.warn("변경을 위한 컬럼 인덱스를 결정할 수 없습니다:", row, prop, colHeadersArray);
                        return;
                    }
                }

                const structureInfoForPath = {
                    sourceData: data,
                    pathPrefix: config.dataPathString,
                    headers: Array.isArray(colHeadersArray) ? colHeadersArray : (colHeadersArray === true ? [] : []),
                    isSourceArray: Array.isArray(data),
                    isSourceArrayOfObjects: Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && !Array.isArray(data[0]) && data[0] !== null,
                    cellMetaMap: cellMetaMap
                };
                let pathToUpdate = getPathForHotChange(row, actualColumnIndex, structureInfoForPath);

                if (pathToUpdate !== null) {
                    // app.js의 updateJsonData는 내부적으로 refreshTreeView를 호출할 수 있음 (isBatchOperation=false일 때)
                    config.updateJsonDataCallback(pathToUpdate, String(newValue), isBatchOperation, oldValue);
                }
            });

            if (isBatchOperation && config.refreshTreeViewCallback) {
                // updateJsonData가 배치 모드일 때는 refreshTreeView를 호출하지 않으므로, 여기서 명시적으로 호출
                config.refreshTreeViewCallback("batch_update_handsontable_afterChange");
            }
            // 값 변경 후 테이블 구조가 크게 바뀌는 경우(예: 문자열 -> 객체) 셀 표시 방식이 바로 업데이트되지 않을 수 있습니다.
            // 이 경우, 사용자가 트리에서 해당 노드를 다시 클릭하거나,
            // 또는 여기서 _prepareTableData와 loadData를 호출하여 테이블을 강제 리프레시하는 것을 고려할 수 있습니다.
            // 현재는 값 변경 후 트리뷰 동기화에 의존합니다.
        },
        afterCreateRow: function(index, amount, source) { // 행 생성 후 호출됩니다.
            if (source === 'loadData' || !config.currentJsonDataRef) return;

            const hot = this;
            let currentViewData = data; // displayDataWithHandsontable 클로저의 data (현재 테이블 뷰의 데이터 슬라이스)
            let dataWasModified = false;

            if (Array.isArray(currentViewData)) {
                const columnHeaders = hot.getColHeader();
                for (let i = 0; i < amount; i++) {
                    let newItem = null;
                    if (Array.isArray(columnHeaders) && columnHeaders.length > 0 && columnHeaders[0] !== "Index") { // 객체 배열로 간주
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
                            inputValidator: (value) => { const trimmedValue = value.trim(); if (!trimmedValue) return '키 이름은 비워둘 수 없습니다!'; if (tempObjectData.hasOwnProperty(trimmedValue)) return '이미 사용 중인 키입니다.'; if (/^\d+$/.test(trimmedValue)) return '키 이름은 숫자만으로 구성될 수 없습니다.'; return null; },
                            hotInstance: hot
                        });

                        if (popupResult.isConfirmed && popupResult.value !== undefined) {
                            const newKey = popupResult.value.trim();
                            const valueToInsert = null;
                            const keysArray = Object.keys(tempObjectData);
                            const newOrderedObject = {};
                            let inserted = false;
                            if (visualIndexToInsertAt >= keysArray.length) {
                                tempObjectData[newKey] = valueToInsert; // append (실제로는 순서가 보장되지 않으므로 재구성 필요)
                                // 객체 순서 유지를 위해 재구성
                                const finalObject = {};
                                keysArray.forEach(k => finalObject[k] = tempObjectData[k]);
                                finalObject[newKey] = valueToInsert;
                                tempObjectData = finalObject;

                            } else {
                                for(let j=0; j < keysArray.length; j++) {
                                    if (j === visualIndexToInsertAt && !inserted) { newOrderedObject[newKey] = valueToInsert; inserted = true; }
                                    newOrderedObject[keysArray[j]] = tempObjectData[keysArray[j]];
                                }
                                if(!inserted) newOrderedObject[newKey] = valueToInsert;
                                tempObjectData = newOrderedObject;
                            }
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
        afterCreateCol: function(index, amount, source) { // 열 생성 후 호출됩니다.
            if (source === 'loadData' || !config.currentJsonDataRef) return;
            const hot = this;
            let currentViewData = data;
            let dataWasModified = false;

            if (Array.isArray(currentViewData) && currentViewData.length > 0 && typeof currentViewData[0] === 'object' && currentViewData[0] !== null && !Array.isArray(currentViewData[0])) {
                (async () => {
                    for (let i = 0; i < amount; i++) {
                        const visualColIndexToInsertAt = index + i; // 시각적 위치
                        const popupResult = await showTextInputPopup({
                            title: `새 열(속성)의 키 입력 (${i + 1}/${amount})`, inputPlaceholder: '새로운 키 이름을 입력하세요', confirmButtonText: '추가',
                            inputValidator: (value) => { const trimmedValue = value.trim(); if (!trimmedValue) return '키 이름은 비워둘 수 없습니다!'; if (currentViewData[0].hasOwnProperty(trimmedValue)) return '첫 번째 객체에 이미 해당 키가 존재합니다.'; if (/^\d+$/.test(trimmedValue)) return '키 이름은 숫자만으로 구성될 수 없습니다.'; return null; },
                            hotInstance: hot
                        });

                        if (popupResult.isConfirmed && popupResult.value !== undefined) {
                            const newKeyName = popupResult.value.trim();
                            currentViewData.forEach(obj => {
                                if (typeof obj === 'object' && obj !== null) {
                                    const currentKeys = Object.keys(obj);
                                    const newOrderedObj = {};
                                    let inserted = false;
                                    if (visualColIndexToInsertAt >= currentKeys.length) { // 맨 뒤에 추가
                                        obj[newKeyName] = null;
                                    } else { // 특정 위치에 삽입 (순서 고려)
                                        for(let k_idx=0; k_idx < currentKeys.length; k_idx++) {
                                            if (k_idx === visualColIndexToInsertAt && !inserted) { newOrderedObj[newKeyName] = null; inserted = true; }
                                            newOrderedObj[currentKeys[k_idx]] = obj[currentKeys[k_idx]];
                                        }
                                        if (!inserted) newOrderedObj[newKeyName] = null;
                                        Object.keys(obj).forEach(k_o => delete obj[k_o]); // 기존 키 삭제
                                        Object.assign(obj, newOrderedObj); // 새 순서로 할당
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
                showConfirmationPopup({ title: '알림', html: '이 뷰에서는 "열 추가"가 "새 키-값 쌍 추가"(행 추가와 유사)로 동작합니다.<br>행 추가 기능을 사용해주세요.', icon: 'info', showCancelButton: false, hotInstance: hot })
                    .then(() => { // 사용자에게 알린 후 테이블 상태를 현재 데이터로 다시 로드합니다.
                        const { preparedHotData, preparedColHeaders, preparedCellMetaMap: newMap } = _prepareTableData(currentViewData, dataKeyName, config);
                        cellMetaMap = newMap;
                        hot.updateSettings({ colHeaders: preparedColHeaders });
                        hot.loadData(preparedHotData);
                    });
            } else {
                showConfirmationPopup({ title: '오류', text: '현재 데이터 구조에는 열을 추가할 수 없습니다.', icon: 'error', showCancelButton: false, hotInstance: hot });
                const { preparedHotData, preparedColHeaders, preparedCellMetaMap: newMap } = _prepareTableData(currentViewData, dataKeyName, config); // 상태 일관성 유지
                cellMetaMap = newMap;
                hot.updateSettings({ colHeaders: preparedColHeaders });
                hot.loadData(preparedHotData);
            }
        },
        beforeRemoveRow: function(index, amount, physicalRows, source) { // 행 삭제 전 호출됩니다.
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
            } else { return false; }
            return true;
        },
        afterRemoveRow: function(index, amount, physicalRows, source) { // 행 삭제 후 호출됩니다.
            if (source === 'loadData' || !config.currentJsonDataRef || source === 'ContextMenu.remove_row_custom') return;
            const hot = this;
            let currentViewData = data;

            config.refreshTreeViewCallback('row_removed_hot');
            const { preparedHotData, preparedColHeaders, preparedCellMetaMap: newMap } = _prepareTableData(currentViewData, dataKeyName, config);
            cellMetaMap = newMap;
            hot.updateSettings({ colHeaders: preparedColHeaders });
            hot.loadData(preparedHotData);
        },
        beforeRemoveCol: function(index, amount, physicalCols, source) { // 열 삭제 전 호출됩니다.
            if (source === 'loadData' || !config.currentJsonDataRef) return true;
            let currentViewData = data;
            const colHeaders = this.getColHeader();

            if (Array.isArray(currentViewData) && currentViewData.length > 0 && typeof currentViewData[0] === 'object' && currentViewData[0] !== null && !Array.isArray(currentViewData[0])) {
                if (!Array.isArray(colHeaders)) { showConfirmationPopup({ title: '오류', text: '열 헤더 정보를 가져올 수 없습니다.', icon: 'error', showCancelButton: false, hotInstance: this }); return false; }
                physicalCols.sort((a, b) => b - a);
                physicalCols.forEach(colIndex => {
                    if (colIndex >= 0 && colIndex < colHeaders.length) {
                        const keyToRemove = colHeaders[colIndex];
                        if (typeof keyToRemove === 'string') { currentViewData.forEach(obj => { if (typeof obj === 'object' && obj !== null) { delete obj[keyToRemove]; } }); }
                    }
                });
            } else if (typeof currentViewData === 'object' && currentViewData !== null && !Array.isArray(currentViewData)) {
                showConfirmationPopup({ title: '알림', text: '이 뷰에서 특정 열 부분 삭제는 지원되지 않습니다. 행 전체를 삭제해주세요.', icon: 'info', showCancelButton: false, hotInstance: this });
                return false;
            } else { showConfirmationPopup({ title: '오류', text: '현재 데이터 구조에 열 삭제 불가.', icon: 'error', showCancelButton: false, hotInstance: this }); return false; }
            return true;
        },
        afterRemoveCol: function(index, amount, physicalCols, source) { // 열 삭제 후 호출됩니다.
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

// Handsontable 셀 변경 시 해당 변경 사항의 JSON 경로를 결정합니다.
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
                if (col === 1) { itemSubPath = `[${row}]`; } else { return null; }
            }
        } else { return null; }
    } else if (typeof sourceData === 'object' && sourceData !== null && !Array.isArray(sourceData)) {
        const metaKeyCell = currentCellMetaMap.get(`${row}-0`);
        if (!metaKeyCell || metaKeyCell.originalKey === undefined) return null;

        const objectKeyForRow = metaKeyCell.originalKey;
        if (col === 0) return null;

        const isArrayExpandedInObjectView = Array.isArray(headers) && headers.length > 1 && headers[0] === "항목 (Key)" && headers[1] === "0";
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
            if (col === 1) { itemSubPath = `.${objectKeyForRow}`; } else { return null; }
        } else {
            if (Object.keys(sourceData).length === 0 && Array.isArray(headers) && headers.length ===1 && headers[0] === "항목 (Key)") return null;
            return null;
        }
    } else {
        if (row === 0 && col === 1) { return pathPrefix || ""; } // pathPrefix가 null일 경우 빈 문자열로 처리하여 루트 직접 수정
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