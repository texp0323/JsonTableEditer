// tableViewHandsontable.js
import Handsontable from 'handsontable';
import 'handsontable/dist/handsontable.full.min.css';
import Swal from 'sweetalert2';

let hotInstance = null;

function prepareHotCell(value, dataPath, keyOrIndex, isKeyColumn = false, configForCellPrep) {
    let displayValue = String(value);
    let cellMeta = {
        isDrillable: false,
        drillPath: null,
        originalKey: String(keyOrIndex),
        originalValue: value,
        readOnly: isKeyColumn
    };

    const currentItemPathResolver = () => {
        if (keyOrIndex === '' || keyOrIndex === null || keyOrIndex === undefined) {
            return dataPath;
        }
        if (!dataPath) {
            const rootData = configForCellPrep.getObjectByPathCallback(configForCellPrep.rootJsonData, '');
            if (Array.isArray(rootData)) {
                return `[${keyOrIndex}]`;
            }
            return String(keyOrIndex);
        }
        const parentActual = configForCellPrep.getObjectByPathCallback(configForCellPrep.rootJsonData, dataPath);
        if (Array.isArray(parentActual)) {
            return `${dataPath}[${keyOrIndex}]`;
        }
        return `${dataPath}.${keyOrIndex}`;
    };

    if (value === undefined) {
        displayValue = "undefined";
        cellMeta.readOnly = false;
    } else if (typeof value === 'object' && value !== null) {
        displayValue = Array.isArray(value) ? `[Array (${value.length})]` : `{Object}`;
        cellMeta.isDrillable = true;
        cellMeta.drillPath = currentItemPathResolver();
        cellMeta.readOnly = true;
    } else if (value === null) {
        displayValue = "null";
        cellMeta.readOnly = false;
    } else {
        displayValue = String(value);
        if (!isKeyColumn && !cellMeta.isDrillable) {
            cellMeta.readOnly = false;
        }
    }

    if (isKeyColumn) {
        cellMeta.readOnly = true;
    }

    return { displayValue, cellMeta };
}

export function destroyHotInstance() {
    if (hotInstance) {
        hotInstance.destroy();
        hotInstance = null;
    }
}

export function displayDataWithHandsontable(data, dataKeyName, config) {
    const container = config.tableViewDomElement;

    destroyHotInstance();
    if (container) container.innerHTML = '';

    let hotData = [];
    let colHeaders = true;
    const cellMetaMap = new Map();
    let lastClickInfo = { row: -1, col: -1, time: 0 };
    const DOUBLE_CLICK_THRESHOLD = 300;

    const configForCellPrep = {
        rootJsonData: config.rootJsonData,
        getObjectByPathCallback: config.getObjectByPathCallback
    };

    if (Array.isArray(data)) {
        const firstItem = data.length > 0 ? data[0] : null;
        if (firstItem && typeof firstItem === 'object' && firstItem !== null && !Array.isArray(firstItem)) {
            colHeaders = Object.keys(firstItem);
            data.forEach((obj, rowIndex) => {
                const rowValues = [];
                const parentPathForValuesInObj = `${config.dataPathString}`;
                (colHeaders).forEach((key, colIndex) => {
                    const value = obj[key];
                    const { displayValue, cellMeta } = prepareHotCell(value, `${parentPathForValuesInObj}[${rowIndex}]`, key, false, configForCellPrep);
                    rowValues.push(displayValue);
                    cellMetaMap.set(`${rowIndex}-${colIndex}`, cellMeta);
                });
                hotData.push(rowValues);
            });
        } else {
            colHeaders = ["Index", "Value"];
            hotData = data.map((item, index) => {
                const parentPathForArrayItems = config.dataPathString;
                const { displayValue: indexDisplay, cellMeta: indexMeta } = prepareHotCell(index, parentPathForArrayItems, String(index), true, configForCellPrep);
                const { displayValue: valueDisplay, cellMeta: valueMeta } = prepareHotCell(item, parentPathForArrayItems, String(index), false, configForCellPrep);
                cellMetaMap.set(`${index}-0`, indexMeta);
                cellMetaMap.set(`${index}-1`, valueMeta);
                return [indexDisplay, valueDisplay];
            });
        }
    } else if (typeof data === 'object' && data !== null) {
        const objectEntries = Object.entries(data);

        const shouldExpandArrays = objectEntries.length > 0 && objectEntries.every(([key, value]) => Array.isArray(value));

        if (shouldExpandArrays) { // 모든 값이 배열인 경우에만 펼침, "값 (Value)" 컬럼 없음
            let maxExpandedLength = 0;
            objectEntries.forEach(([key, value]) => { // value is always an array here
                maxExpandedLength = Math.max(maxExpandedLength, value.length);
            });

            const tempColHeaders = ["항목 (Key)"];
            for (let i = 0; i < maxExpandedLength; i++) {
                tempColHeaders.push(String(i));
            }
            colHeaders = tempColHeaders;

            hotData = objectEntries.map(([key, value], rowIndex) => { // value is always an array
                const rowCells = [];
                const parentPathForObjectValues = config.dataPathString;
                let currentCellColIdx = 0;

                const { displayValue: keyDisplay, cellMeta: keyMeta } = prepareHotCell(key, parentPathForObjectValues, key, true, configForCellPrep);
                rowCells.push(keyDisplay);
                cellMetaMap.set(`${rowIndex}-${currentCellColIdx}`, keyMeta);
                currentCellColIdx++;

                for (let arrIdx = 0; arrIdx < maxExpandedLength; arrIdx++) {
                    if (arrIdx < value.length) {
                        const item = value[arrIdx];
                        const itemContainerPath = `${parentPathForObjectValues ? parentPathForObjectValues + '.' : ''}${key}`;
                        const { displayValue: itemDisplay, cellMeta: itemMeta } = prepareHotCell(item, itemContainerPath, String(arrIdx), false, configForCellPrep);
                        rowCells.push(itemDisplay);
                        cellMetaMap.set(`${rowIndex}-${currentCellColIdx + arrIdx}`, itemMeta);
                    } else {
                        rowCells.push("");
                        cellMetaMap.set(`${rowIndex}-${currentCellColIdx + arrIdx}`, { readOnly: true, originalValue: null, isPadding: true });
                    }
                }
                // "값 (Value)" 컬럼 로직 없음
                return rowCells;
            });
        } else { // 객체 내 값에 배열이 아닌 것이 있거나, 객체가 비어있는 경우 - 배열 펼치지 않음
            colHeaders = ["항목 (Key)", "값 (Value)"];
            hotData = objectEntries.map(([key, value], rowIndex) => {
                const parentPathForObjectValues = config.dataPathString;
                const { displayValue: keyDisplay, cellMeta: keyMeta } = prepareHotCell(key, parentPathForObjectValues, key, true, configForCellPrep);
                const { displayValue: valueDisplay, cellMeta: valueMeta } = prepareHotCell(value, parentPathForObjectValues, key, false, configForCellPrep);
                cellMetaMap.set(`${rowIndex}-0`, keyMeta);
                cellMetaMap.set(`${rowIndex}-1`, valueMeta);
                return [keyDisplay, valueDisplay];
            });
        }
    } else {
        colHeaders = ["항목", "값"];
        const keyStr = dataKeyName || "Value";
        const { displayValue: keyDisplay, cellMeta: keyMeta } = prepareHotCell(keyStr, config.dataPathString, '', true, configForCellPrep);
        const { displayValue: valueDisplay, cellMeta: valueMeta } = prepareHotCell(data, config.dataPathString, '', false, configForCellPrep);
        cellMetaMap.set(`0-0`, keyMeta);
        cellMetaMap.set(`0-1`, valueMeta);
        hotData = [[keyDisplay, valueDisplay]];
    }

    if (!container) {
        console.error("Handsontable container not found.");
        return;
    }

    hotInstance = new Handsontable(container, {
        data: hotData,
        rowHeaders: true,
        colHeaders: colHeaders,
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
                "duplicate_row": {
                    name: "선택 행 복제",
                    hidden: function() {
                        const selection = this.getSelectedRangeLast();
                        if (!selection) return true;
                        return !(Array.isArray(data) || (typeof data === 'object' && data !== null));
                    },
                    callback: async function(key, selection, event) {
                        const sel = selection[0];
                        const r = sel.start.row;

                        if (Array.isArray(data)) {
                            if (r >= 0 && r < data.length) {
                                const clonedItem = JSON.parse(JSON.stringify(data[r]));
                                data.splice(r + 1, 0, clonedItem);
                                config.refreshTreeViewCallback('row_duplicated_array_hot');
                                config.displayTableCallback(data, dataKeyName, config.rootJsonData, config.dataPathString);
                            }
                        } else if (typeof data === 'object' && data !== null) {
                            const objectKeys = Object.keys(data);
                            if (r < 0 || r >= objectKeys.length) return;
                            const originalKey = objectKeys[r];

                            let newKeyBase = originalKey + "_복제본";
                            let newKeySuggestion = newKeyBase;
                            let counter = 1;
                            while (data.hasOwnProperty(newKeySuggestion)) {
                                newKeySuggestion = `${newKeyBase}_${counter}`;
                                counter++;
                            }

                            const result = await Swal.fire({
                                title: '새 키 이름 입력 (행 복제)',
                                input: 'text',
                                inputValue: newKeySuggestion,
                                showCancelButton: true,
                                confirmButtonText: '복제',
                                inputValidator: (value) => {
                                    if (!value || value.trim() === "") return '키 이름은 비워둘 수 없습니다!';
                                    if (value.trim() !== originalKey && data.hasOwnProperty(value.trim())) return '이미 사용 중인 키 이름입니다.';
                                    if (/^\d+$/.test(value.trim())) return '키 이름은 숫자만으로 구성될 수 없습니다.';
                                    return null;
                                }
                            });

                            if (result.isConfirmed && result.value) {
                                const finalNewKey = result.value.trim();
                                const clonedValue = JSON.parse(JSON.stringify(data[originalKey]));

                                const orderedData = {};
                                for (const k of Object.keys(data)) {
                                    orderedData[k] = data[k];
                                    if (k === originalKey) {
                                        orderedData[finalNewKey] = clonedValue;
                                    }
                                }
                                Object.keys(data).forEach(k => delete data[k]);
                                Object.assign(data, orderedData);

                                config.refreshTreeViewCallback('row_duplicated_object_hot_ordered');
                                config.displayTableCallback(data, dataKeyName, config.rootJsonData, config.dataPathString);
                            }
                        }
                    }
                },
                "duplicate_col": {
                    name: "선택 열 복제",
                    hidden: function() {
                        const selection = this.getSelectedRangeLast();
                        if (!selection) return true;
                        if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null && !Array.isArray(data[0])) return false;
                        if (typeof data === 'object' && data !== null && !Array.isArray(data)) return false;
                        return true;
                    },
                    callback: async function(key, selection, event) {
                        const sel = selection[0];
                        const c = sel.start.col;
                        const r = sel.start.row;

                        if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null && !Array.isArray(data[0])) {
                            const currentInstanceHeaders = this.getColHeader();
                            const originalHeader = Array.isArray(currentInstanceHeaders) ? currentInstanceHeaders[c] : null;

                            if (!originalHeader || typeof originalHeader !== 'string') return;

                            let newHeaderBase = originalHeader + "_복제본";
                            let newHeaderSuggestion = newHeaderBase;
                            let counter = 1;
                            if (data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
                                while (data[0].hasOwnProperty(newHeaderSuggestion)) {
                                    newHeaderSuggestion = `${newHeaderBase}_${counter}`;
                                    counter++;
                                }
                            } else { return; }

                            const result = await Swal.fire({
                                title: '새 열 이름(키) 입력 (열 복제)',
                                input: 'text',
                                inputValue: newHeaderSuggestion,
                                showCancelButton: true,
                                confirmButtonText: '복제',
                                inputValidator: (value) => {
                                    if (!value || value.trim() === "") return '키 이름은 비워둘 수 없습니다!';
                                    if (data.length > 0 && data[0].hasOwnProperty(value.trim()) && value.trim() !== originalHeader) return '첫 번째 객체에 이미 해당 키가 존재합니다.';
                                    if (/^\d+$/.test(value.trim())) return '키 이름은 숫자만으로 구성될 수 없습니다.';
                                    return null;
                                }
                            });

                            if (result.isConfirmed && result.value) {
                                const finalNewHeader = result.value.trim();
                                data.forEach(obj => {
                                    if (typeof obj === 'object' && obj !== null) {
                                        const clonedColumnValue = obj.hasOwnProperty(originalHeader) ? JSON.parse(JSON.stringify(obj[originalHeader])) : null;

                                        const tempObj = { ...obj };
                                        delete tempObj[finalNewHeader];

                                        const orderedObj = {};
                                        for (const k of Object.keys(tempObj)) {
                                            orderedObj[k] = tempObj[k];
                                            if (k === originalHeader) {
                                                orderedObj[finalNewHeader] = clonedColumnValue;
                                            }
                                        }
                                        if (!orderedObj.hasOwnProperty(finalNewHeader)) {
                                            orderedObj[finalNewHeader] = clonedColumnValue;
                                        }

                                        Object.keys(obj).forEach(k_obj => delete obj[k_obj]);
                                        Object.assign(obj, orderedObj);
                                    }
                                });
                                config.refreshTreeViewCallback('col_duplicated_array_obj_hot_ordered');
                                config.displayTableCallback(data, dataKeyName, config.rootJsonData, config.dataPathString);
                            }
                        } else if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
                            const objectKeys = Object.keys(data);
                            if (r < 0 || r >= objectKeys.length) return;
                            const originalKey = objectKeys[r];

                            let newKeyBase = originalKey + "_복제본";
                            let newKeySuggestion = newKeyBase;
                            let counter = 1;
                            while (data.hasOwnProperty(newKeySuggestion)) {
                                newKeySuggestion = `${newKeyBase}_${counter}`;
                                counter++;
                            }
                            const result = await Swal.fire({
                                title: '새 키 이름 입력 (열 복제는 행 복제와 동일)',
                                input: 'text',
                                inputValue: newKeySuggestion,
                                showCancelButton: true,
                                confirmButtonText: '복제',
                                inputValidator: (value) => {
                                    if (!value || value.trim() === "") return '키 이름은 비워둘 수 없습니다!';
                                    if (value.trim() !== originalKey && data.hasOwnProperty(value.trim())) return '이미 사용 중인 키 이름입니다.';
                                    if (/^\d+$/.test(value.trim())) return '키 이름은 숫자만으로 구성될 수 없습니다.';
                                    return null;
                                }
                            });
                            if (result.isConfirmed && result.value) {
                                const finalNewKey = result.value.trim();
                                const clonedValue = JSON.parse(JSON.stringify(data[originalKey]));

                                const orderedData = {};
                                for (const k of Object.keys(data)) {
                                    orderedData[k] = data[k];
                                    if (k === originalKey) {
                                        orderedData[finalNewKey] = clonedValue;
                                    }
                                }
                                Object.keys(data).forEach(k_obj => delete data[k_obj]);
                                Object.assign(data, orderedData);

                                config.refreshTreeViewCallback('col_as_row_duplicated_object_hot');
                                config.displayTableCallback(data, dataKeyName, config.rootJsonData, config.dataPathString);
                            }
                        }
                    }
                },
                "make_array": {
                    name: '값을 빈 배열 [] 로 변경',
                    hidden: function() {
                        const selection = this.getSelectedRangeLast();
                        if (!selection) return true;
                        const col = selection.from.col;
                        return !(typeof data === 'object' && data !== null && !Array.isArray(data) && col === 0);
                    },
                    callback: function(key, selection, event) {
                        const r = selection[0].start.row;
                        const metaKeyCell = cellMetaMap.get(`${r}-0`);
                        if (metaKeyCell && metaKeyCell.originalKey && typeof data === 'object' && data !== null) {
                            data[metaKeyCell.originalKey] = [];
                            config.refreshTreeViewCallback('value_to_array_hot');
                            config.displayTableCallback(data, dataKeyName, config.rootJsonData, config.dataPathString);
                        }
                    }
                },
                "make_object": {
                    name: '값을 빈 객체 {} 로 변경',
                    hidden: function() {
                        const selection = this.getSelectedRangeLast();
                        if (!selection) return true;
                        const col = selection.from.col;
                        return !(typeof data === 'object' && data !== null && !Array.isArray(data) && col === 0);
                    },
                    callback: function(key, selection, event) {
                        const r = selection[0].start.row;
                        const metaKeyCell = cellMetaMap.get(`${r}-0`);
                        if (metaKeyCell && metaKeyCell.originalKey && typeof data === 'object' && data !== null) {
                            data[metaKeyCell.originalKey] = {};
                            config.refreshTreeViewCallback('value_to_object_hot');
                            config.displayTableCallback(data, dataKeyName, config.rootJsonData, config.dataPathString);
                        }
                    }
                },
                "undo": { name: '실행 취소' },
                "redo": { name: '다시 실행' }
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
                    cellProperties.renderer = function(instance, td, r, c, p, value, cellProps) {
                        Handsontable.renderers.TextRenderer.apply(this, arguments);
                        td.style.color = '#007bff';
                        td.style.textDecoration = 'underline';
                        td.style.cursor = 'pointer';
                    };
                }
                if (meta.isPadding) {
                    // td.style.backgroundColor = '#f8f9fa';
                }
            }
            return cellProperties;
        },
        afterOnCellMouseDown: function(event, coords, TD) {
            if (event.button !== 0) return;

            const currentTime = new Date().getTime();
            const { row, col } = coords;
            const meta = cellMetaMap.get(`${row}-${col}`);
            let isDoubleClick = false;

            if (meta && row === lastClickInfo.row && col === lastClickInfo.col &&
                (currentTime - lastClickInfo.time) < DOUBLE_CLICK_THRESHOLD) {
                isDoubleClick = true;
                lastClickInfo = { row: -1, col: -1, time: 0 };
            } else {
                lastClickInfo = { row: row, col: col, time: currentTime };
            }

            if (isDoubleClick) {
                let isObjectKeyCell = false;
                const currentInstanceHeaders = this.getColHeader();
                if (typeof data === 'object' && data !== null && !Array.isArray(data) &&
                    Array.isArray(currentInstanceHeaders) && currentInstanceHeaders[0] === "항목 (Key)" && col === 0 && meta) {
                    isObjectKeyCell = true;
                }

                if (isObjectKeyCell) {
                    const oldKey = meta.originalKey;
                    const parentObject = data;
                    const parentPath = config.dataPathString;

                    Swal.fire({
                        title: `키 이름 변경: "${oldKey}"`,
                        input: 'text',
                        inputValue: oldKey,
                        showCancelButton: true,
                        confirmButtonText: '저장',
                        cancelButtonText: '취소',
                        customClass: { popup: 'custom-swal-popup' },
                        inputValidator: (value) => {
                            if (!value || value.trim() === "") return '키 이름은 비워둘 수 없습니다!';
                            const newKeyTrimmed = value.trim();
                            if (/^\d+$/.test(newKeyTrimmed)) return '키 이름은 숫자만으로 구성될 수 없습니다!';
                            if (parentObject.hasOwnProperty(newKeyTrimmed) && newKeyTrimmed !== oldKey) return '이미 사용 중인 키 이름입니다!';
                            return null;
                        }
                    }).then((result) => {
                        if (result.isConfirmed && result.value) {
                            const newKey = result.value.trim();
                            if (newKey !== oldKey && config.updateJsonKeyCallback) {
                                config.updateJsonKeyCallback(parentPath, oldKey, newKey, parentObject);
                            }
                        }
                    });
                    return;
                }
            }

            if (meta && meta.isDrillable && meta.originalValue !== undefined) {
                if (!isDoubleClick || (isDoubleClick && col !== 0 && meta.drillPath)) {
                    if (typeof meta.originalValue === 'object' && meta.originalValue !== null) {
                        config.displayTableCallback(meta.originalValue, meta.originalKey, config.rootJsonData, meta.drillPath);
                    } else if (Array.isArray(meta.originalValue)) {
                        config.displayTableCallback(meta.originalValue, meta.originalKey, config.rootJsonData, meta.drillPath);
                    }
                }
            }
        },
        afterChange: function(changes, source) {
            if (source === 'loadData' || !changes || !Array.isArray(changes) || changes.length === 0) {
                return;
            }
            const isBatchOperation = (source === 'CopyPaste.paste' || source === 'Autofill.fill' || changes.length > 1);
            const currentInstanceHeaders = this.getColHeader();

            changes.forEach(([row, prop, oldValue, newValue]) => {
                let actualColIndex = -1;
                if (typeof prop === 'number') {
                    actualColIndex = prop;
                } else if (typeof prop === 'string' && Array.isArray(currentInstanceHeaders)) {
                    actualColIndex = currentInstanceHeaders.indexOf(prop);
                }

                if (actualColIndex === -1) {
                    if(typeof prop === 'number' && currentInstanceHeaders === true) {
                        actualColIndex = prop;
                    } else {
                        console.warn("Could not determine actual column index for change:", row, prop);
                        return;
                    }
                }

                const hotDataStructureInfo = {
                    sourceData: data,
                    pathPrefix: config.dataPathString,
                    headers: Array.isArray(currentInstanceHeaders) ? currentInstanceHeaders : [],
                    isSourceArray: Array.isArray(data),
                    isSourceArrayOfObjects: Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && !Array.isArray(data[0]) && data[0] !== null
                };

                let pathToUpdate = getPathForHotChange(row, actualColIndex, hotDataStructureInfo);

                if (pathToUpdate !== null) {
                    config.updateJsonDataCallback(pathToUpdate, String(newValue), isBatchOperation);
                }
            });

            if (isBatchOperation && config.refreshTreeViewCallback) {
                config.refreshTreeViewCallback("batch_table_update_from_handsontable_afterChange");
            }
        },
        afterCreateRow: function(index, amount, source) {
            if (source === 'loadData' || !config.currentJsonDataRef) return;

            const rootJson = config.currentJsonDataRef();
            let parentData = config.dataPathString ? config.getObjectByPathCallback(rootJson, config.dataPathString) : rootJson;

            if (Array.isArray(parentData)) {
                const currentInstanceHeaders = this.getColHeader();
                for (let i = 0; i < amount; i++) {
                    let newItem = null;
                    if (Array.isArray(currentInstanceHeaders) && currentInstanceHeaders.length > 0 && currentInstanceHeaders[0] !== "Index" && parentData.length > 0 && typeof parentData[0] === 'object' && parentData[0] !== null) {
                        newItem = {};
                        Object.keys(parentData[0]).forEach(key => newItem[key] = null);
                    }
                    parentData.splice(index + i, 0, newItem);
                }
                config.refreshTreeViewCallback('row_added_array_hot');
                config.displayTableCallback(parentData, dataKeyName, rootJson, config.dataPathString);
            } else if (typeof parentData === 'object' && parentData !== null) {
                Swal.fire({
                    title: '새 항목 키 입력',
                    input: 'text',
                    inputPlaceholder: '새로운 키 이름을 입력하세요',
                    showCancelButton: true,
                    inputValidator: (value) => {
                        if (!value || value.trim() === "") return '키 이름은 비워둘 수 없습니다!';
                        if (parentData.hasOwnProperty(value.trim())) return '이미 사용 중인 키 이름입니다.';
                        if (/^\d+$/.test(value.trim())) return '키 이름은 숫자만으로 구성될 수 없습니다.';
                        return null;
                    }
                }).then(result => {
                    if (result.isConfirmed && result.value) {
                        const newKey = result.value.trim();
                        parentData[newKey] = null;
                        config.refreshTreeViewCallback('key_added_object_hot');
                        config.displayTableCallback(parentData, dataKeyName, rootJson, config.dataPathString);
                    } else {
                        config.displayTableCallback(parentData, dataKeyName, rootJson, config.dataPathString);
                    }
                });
            }
        },
        afterCreateCol: function(index, amount, source) {
            if (source === 'loadData' || !config.currentJsonDataRef) return;

            const rootJson = config.currentJsonDataRef();
            let currentTableData = config.dataPathString ? config.getObjectByPathCallback(rootJson, config.dataPathString) : rootJson;

            if (Array.isArray(currentTableData) && currentTableData.length > 0 && typeof currentTableData[0] === 'object' && currentTableData[0] !== null && !Array.isArray(currentTableData[0])) {
                (async () => {
                    for (let i = 0; i < amount; i++) {
                        const result = await Swal.fire({
                            title: `새 열(속성)의 키 입력 (${i+1}/${amount})`,
                            input: 'text',
                            inputPlaceholder: '새로운 키 이름을 입력하세요',
                            showCancelButton: true,
                            inputValidator: (value) => {
                                if (!value || value.trim() === "") return '키 이름은 비워둘 수 없습니다!';
                                if (currentTableData[0].hasOwnProperty(value.trim())) return '첫 번째 객체에 이미 해당 키가 존재합니다.';
                                if (/^\d+$/.test(value.trim())) return '키 이름은 숫자만으로 구성될 수 없습니다.';
                                return null;
                            }
                        });

                        if (result.isConfirmed && result.value) {
                            const newKey = result.value.trim();
                            currentTableData.forEach(obj => {
                                if (typeof obj === 'object' && obj !== null) {
                                    obj[newKey] = null;
                                }
                            });
                        } else {
                            config.displayTableCallback(currentTableData, dataKeyName, rootJson, config.dataPathString);
                            return;
                        }
                    }
                    config.refreshTreeViewCallback('col_added_array_of_obj_hot');
                    config.displayTableCallback(currentTableData, dataKeyName, rootJson, config.dataPathString);
                })();
            } else if (typeof currentTableData === 'object' && currentTableData !== null && !Array.isArray(currentTableData)) {
                Swal.fire('알림', '이 뷰에서는 "열 추가"가 "새 키-값 쌍 추가"와 동일하게 동작합니다. 새 항목의 키를 입력해주세요.', 'info');
                Swal.fire({
                    title: '새 항목 키 입력',
                    input: 'text',
                    inputPlaceholder: '새로운 키 이름을 입력하세요',
                    showCancelButton: true,
                    inputValidator: (value) => {
                        if (!value || value.trim() === "") return '키 이름은 비워둘 수 없습니다!';
                        if (currentTableData.hasOwnProperty(value.trim())) return '이미 사용 중인 키 이름입니다.';
                        if (/^\d+$/.test(value.trim())) return '키 이름은 숫자만으로 구성될 수 없습니다.';
                        return null;
                    }
                }).then(result => {
                    if (result.isConfirmed && result.value) {
                        const newKey = result.value.trim();
                        currentTableData[newKey] = null;
                        config.refreshTreeViewCallback('key_added_object_via_col_add_hot');
                        config.displayTableCallback(currentTableData, dataKeyName, rootJson, config.dataPathString);
                    } else {
                        config.displayTableCallback(currentTableData, dataKeyName, rootJson, config.dataPathString);
                    }
                });
            } else {
                Swal.fire('오류', '현재 데이터 구조에는 열을 추가할 수 없습니다.', 'error');
                config.displayTableCallback(currentTableData, dataKeyName, rootJson, config.dataPathString);
            }
        },
        beforeRemoveRow: function(index, amount, physicalRows, source) {
            if (source === 'loadData' || !config.currentJsonDataRef) return true;

            const rootJson = config.currentJsonDataRef();
            let parentData = config.dataPathString ? config.getObjectByPathCallback(rootJson, config.dataPathString) : rootJson;

            physicalRows.sort((a, b) => b - a);

            if (Array.isArray(parentData)) {
                physicalRows.forEach(rowIndex => {
                    if (rowIndex >= 0 && rowIndex < parentData.length) {
                        parentData.splice(rowIndex, 1);
                    }
                });
            } else if (typeof parentData === 'object' && parentData !== null) {
                const keys = Object.keys(parentData);
                physicalRows.forEach(rowIndex => {
                    if (rowIndex >= 0 && rowIndex < keys.length) {
                        delete parentData[keys[rowIndex]];
                    }
                });
            } else {
                Swal.fire('오류', '현재 데이터에서 행을 삭제할 수 없습니다.', 'error');
                return false;
            }
            return true;
        },
        afterRemoveRow: function(index, amount, physicalRows, source) {
            if (source === 'loadData' || !config.currentJsonDataRef || source === 'ContextMenu.remove_row_custom') return;

            const rootJson = config.currentJsonDataRef();
            let parentData = config.dataPathString ? config.getObjectByPathCallback(rootJson, config.dataPathString) : rootJson;
            config.refreshTreeViewCallback('row_removed_hot');
            config.displayTableCallback(parentData, dataKeyName, rootJson, config.dataPathString);
        },
        beforeRemoveCol: function(index, amount, physicalCols, source) {
            if (source === 'loadData' || !config.currentJsonDataRef) return true;

            const rootJson = config.currentJsonDataRef();
            let currentTableData = config.dataPathString ? config.getObjectByPathCallback(rootJson, config.dataPathString) : rootJson;

            physicalCols.sort((a, b) => b - a);
            const currentInstanceHeaders = this.getColHeader();

            if (Array.isArray(currentTableData) && currentTableData.length > 0 && typeof currentTableData[0] === 'object' && currentTableData[0] !== null && !Array.isArray(currentTableData[0])) {
                if (!Array.isArray(currentInstanceHeaders)) {
                    Swal.fire('오류', '열 헤더 정보를 가져올 수 없습니다.', 'error');
                    return false;
                }
                physicalCols.forEach(colIndex => {
                    if (colIndex >= 0 && colIndex < currentInstanceHeaders.length) {
                        const keyToRemove = currentInstanceHeaders[colIndex];
                        if (typeof keyToRemove === 'string' && keyToRemove !== "항목 (Key)") {
                            currentTableData.forEach(obj => {
                                delete obj[keyToRemove];
                            });
                        }
                    }
                });
            } else if (typeof currentTableData === 'object' && currentTableData !== null && !Array.isArray(currentTableData)) {
                Swal.fire('알림', '이 뷰에서 특정 열(데이터 부분)만 삭제하는 것은 지원되지 않습니다. 행 전체(키-값 쌍)를 삭제해주세요.', 'info');
                return false;
            } else {
                Swal.fire('오류', '현재 데이터 구조에서는 열을 삭제할 수 없습니다.', 'error');
                return false;
            }
            return true;
        },
        afterRemoveCol: function(index, amount, physicalCols, source) {
            if (source === 'loadData' || !config.currentJsonDataRef) return;
            const rootJson = config.currentJsonDataRef();
            let currentTableData = config.dataPathString ? config.getObjectByPathCallback(rootJson, config.dataPathString) : rootJson;
            config.refreshTreeViewCallback('col_removed_hot');
            config.displayTableCallback(currentTableData, dataKeyName, rootJson, config.dataPathString);
        }
    });
}

function getPathForHotChange(row, col, structureInfo) {
    const { sourceData, pathPrefix, headers, isSourceArray, isSourceArrayOfObjects } = structureInfo;
    let itemSubPath = "";

    if (isSourceArray) {
        if (row < sourceData.length) {
            if (isSourceArrayOfObjects) {
                if (Array.isArray(headers) && col >= 0 && col < headers.length) {
                    const propName = headers[col];
                    itemSubPath = `[${row}].${propName}`;
                } else {
                    return null;
                }
            } else {
                if (col === 1) {
                    itemSubPath = `[${row}]`;
                } else {
                    return null;
                }
            }
        } else { return null; }
    } else if (typeof sourceData === 'object' && sourceData !== null) {
        const objectKeys = Object.keys(sourceData);
        if (row >= objectKeys.length) return null;

        const objectKey = objectKeys[row];
        const originalValueForKey = sourceData[objectKey];

        if (col === 0) return null;

        // Handle empty object case - only "항목 (Key)" header, no editable value cells
        if (headers.length === 1 && headers[0] === "항목 (Key)" && objectKeys.length === 0) return null;
        if (headers.length < 2 && objectKeys.length > 0) return null; // Malformed headers for non-empty object

        const isAllArrayExpandedView = !headers.includes("값 (Value)") && headers.length > 1 && headers[0] === "항목 (Key)";
        const isStandardNonExpandedView = headers.length === 2 && headers[0] === "항목 (Key)" && headers[1] === "값 (Value)";

        if (isAllArrayExpandedView) {
            // Headers: ["항목 (Key)", "0", "1", ..., "N-1"]
            // All columns from 1 onwards must be array indices.
            if (col > 0 && col < headers.length && !isNaN(parseInt(headers[col], 10))) {
                const arrayIndexStr = headers[col];
                if (Array.isArray(originalValueForKey)) {
                    itemSubPath = `.${objectKey}[${arrayIndexStr}]`;
                } else { return null; /* Should not happen in this view */ }
            } else {
                return null;
            }
        } else if (isStandardNonExpandedView) {
            // Headers: ["항목 (Key)", "값 (Value)"]
            if (col === 1) {
                itemSubPath = `.${objectKey}`;
            } else {
                return null;
            }
        } else {
            // This case should ideally not be reached if displayDataWithHandsontable correctly sets headers.
            // console.warn("getPathForHotChange: Unhandled header structure for object data:", headers);
            return null;
        }
    } else {
        if (row === 0 && col === 1) {
            return pathPrefix;
        } else {
            return null;
        }
    }

    if (pathPrefix) {
        return pathPrefix + itemSubPath;
    } else {
        return itemSubPath.startsWith('.') ? itemSubPath.substring(1) : itemSubPath;
    }
}