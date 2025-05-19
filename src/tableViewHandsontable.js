import Handsontable from 'handsontable';
import 'handsontable/dist/handsontable.full.min.css';
import { showTextInputPopup, showConfirmationPopup } from './customPopup.js'; // customPopup.js 의존성
import Swal from 'sweetalert2'; // Import Swal for the select popup

const TEMPLATES = {
    emptyObject: { name: "빈 객체 (Empty Object)", type: "object", value: {} },
    sampleUserObject: { name: "샘플 사용자 객체 (Sample User Object)", type: "object", value: { "username": "guest", "id": 100, "isActive": true, "roles": ["user"] } },
    emptyArray: { name: "빈 배열 (Empty Array)", type: "array", value: [] },
    sampleItemsArray: { name: "샘플 아이템 배열 (Sample Items Array)", type: "array", value: ["itemA", "itemB", 123, { "subItem": null }] }
};

let hotInstance = null; // 현재 Handsontable 인스턴스를 저장하는 변수
let cellMetaMap = new Map(); // 셀 메타 정보를 저장하는 맵
let lastClickInfo = { row: -1, col: -1, time: 0 }; // 마지막 클릭 정보를 저장하여 더블 클릭을 감지하는 객체

/**
 * 특정 값에 대한 표시 텍스트와 셀 메타데이터를 준비합니다.
 * @param {*} value - 셀에 표시될 값
 * @param {string} dataPath - 현재 값의 부모 데이터 경로
 * @param {string|number} keyOrIndex - 현재 값의 키 또는 인덱스
 * @param {boolean} isKeyColumn - 해당 셀이 키를 나타내는 컬럼의 일부인지 여부
 * @param {object} configForCellPrep - 셀 준비에 필요한 설정 (rootJsonData, getObjectByPathCallback 포함)
 * @returns {object} { displayValue: string, cellMeta: object }
 */
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

/**
 * Handsontable에 표시할 데이터, 컬럼 헤더, 셀 메타 정보를 준비하는 내부 헬퍼 함수입니다.
 * @param {*} data - 테이블에 표시할 현재 데이터 조각(slice)
 * @param {string} dataKeyName - 현재 데이터 조각의 이름 또는 키
 * @param {object} config - 테이블 설정 객체 (rootJsonData, dataPathString, getObjectByPathCallback 등 포함)
 * @returns {object} { preparedHotData: Array<Array<any>>, preparedColHeaders: Array<string>|boolean, preparedCellMetaMap: Map }
 */
function _prepareTableData(data, dataKeyName, config) {
    let localHotData = [];
    let localColHeaders = true; // Handsontable 기본값
    let newLocalCellMetaMap = new Map();
    const configForCellPrep = { rootJsonData: config.rootJsonData, getObjectByPathCallback: config.getObjectByPathCallback };
    const currentDataPath = config.dataPathString || '';

    if (Array.isArray(data)) {
        const firstItem = data.length > 0 ? data[0] : null;
        if (firstItem && typeof firstItem === 'object' && firstItem !== null && !Array.isArray(firstItem)) {
            // 객체의 배열일 경우
            let potentialColHeaders = Object.keys(firstItem);
            if (potentialColHeaders.length === 0) { // 첫 항목이 빈 객체이면 다른 항목에서 키를 찾아 헤더로 사용
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
                (localColHeaders).forEach((key, colIndex) => { // colIndex가 필요하면 여기서 사용
                    const value = currentItemObject[key];
                    const itemPath = `${currentDataPath}[${rowIndex}]`; // 각 객체 항목의 경로
                    const { displayValue, cellMeta } = prepareHotCell(value, itemPath, key, false, configForCellPrep);
                    rowValues.push(displayValue);
                    newLocalCellMetaMap.set(`${rowIndex}-${colIndex}`, cellMeta); // colIndex 사용
                });
                localHotData.push(rowValues);
            });
            if (data.length === 0 && Array.isArray(localColHeaders) && localColHeaders.length === 1 && (localColHeaders[0] === "새 열" || localColHeaders[0] === "(내용 없음)" || localColHeaders[0] === "데이터 없음")) {
                // 데이터가 없는 객체 배열 뷰를 위한 처리. 필요시 더 구체적인 헤더 설정 가능.
                // 예: config에서 부모 객체의 키 정보를 가져와서 설정 등.
            }

        } else {
            // 원시 값의 배열 또는 빈 배열일 경우
            localColHeaders = ["Index", "Value"];
            localHotData = data.map((item, index) => {
                const itemPath = currentDataPath; // 배열 자체가 경로이므로, 각 항목은 이 경로 내의 인덱스
                const { displayValue: indexDisplay, cellMeta: indexMeta } = prepareHotCell(index, itemPath, String(index), true, configForCellPrep);
                const { displayValue: valueDisplay, cellMeta: valueMeta } = prepareHotCell(item, itemPath, String(index), false, configForCellPrep);
                newLocalCellMetaMap.set(`${index}-0`, indexMeta);
                newLocalCellMetaMap.set(`${index}-1`, valueMeta);
                return [indexDisplay, valueDisplay];
            });
        }
    } else if (typeof data === 'object' && data !== null) {
        // 단일 객체일 경우
        const objectKeys = Object.keys(data);
        const shouldExpandArrays = objectKeys.length > 0 && objectKeys.every(key => Array.isArray(data[key]));

        if (shouldExpandArrays) {
            // 객체 내의 배열들을 펼쳐서 표시
            let maxExpandedLength = 0;
            objectKeys.forEach(key => { maxExpandedLength = Math.max(maxExpandedLength, data[key].length); });
            const tempColHeaders = ["항목 (Key)"];
            for (let i = 0; i < maxExpandedLength; i++) { tempColHeaders.push(String(i)); }
            localColHeaders = tempColHeaders;

            localHotData = objectKeys.map((key, rowIndex) => {
                const valueArray = data[key];
                const rowCells = [];
                const keyItemPath = currentDataPath; // 키 자체의 경로는 부모 객체
                const { displayValue: keyDisplay, cellMeta: keyMeta } = prepareHotCell(key, keyItemPath, key, true, configForCellPrep);
                rowCells.push(keyDisplay);
                newLocalCellMetaMap.set(`${rowIndex}-0`, keyMeta);

                for (let arrIdx = 0; arrIdx < maxExpandedLength; arrIdx++) {
                    if (arrIdx < valueArray.length) {
                        const item = valueArray[arrIdx];
                        const itemContainerPath = `${currentDataPath ? currentDataPath + '.' : ''}${key}`; // 배열(값)의 경로
                        const { displayValue: itemDisplay, cellMeta: itemMeta } = prepareHotCell(item, itemContainerPath, String(arrIdx), false, configForCellPrep);
                        rowCells.push(itemDisplay);
                        newLocalCellMetaMap.set(`${rowIndex}-${1 + arrIdx}`, itemMeta);
                    } else {
                        rowCells.push(""); // 패딩 셀
                        newLocalCellMetaMap.set(`${rowIndex}-${1 + arrIdx}`, { readOnly: true, originalValue: null, isPadding: true });
                    }
                }
                return rowCells;
            });
        } else {
            // 단순 객체 (키-값 쌍으로 표시)
            localColHeaders = ["항목 (Key)", "값 (Value)"];
            localHotData = objectKeys.map((key, rowIndex) => {
                const value = data[key];
                const itemPath = currentDataPath; // 각 키-값 쌍은 부모 객체 내에 존재
                const { displayValue: keyDisplay, cellMeta: keyMeta } = prepareHotCell(key, itemPath, key, true, configForCellPrep);
                const { displayValue: valueDisplay, cellMeta: valueMeta } = prepareHotCell(value, itemPath, key, false, configForCellPrep);
                newLocalCellMetaMap.set(`${rowIndex}-0`, keyMeta);
                newLocalCellMetaMap.set(`${rowIndex}-1`, valueMeta);
                return [keyDisplay, valueDisplay];
            });
        }
    } else {
        // 원시 데이터일 경우
        localColHeaders = ["항목", "값"];
        const keyStr = dataKeyName || (data === null || data === undefined ? String(data) : "Value"); // null 또는 undefined인 경우 문자열로 변환
        const itemPath = currentDataPath; // 원시 데이터 자체의 경로
        const { displayValue: keyDisplay, cellMeta: keyMeta } = prepareHotCell(keyStr, itemPath, '', true, configForCellPrep); // 키가 없는 원시값의 레이블
        const { displayValue: valueDisplay, cellMeta: valueMeta } = prepareHotCell(data, itemPath, '', false, configForCellPrep); // 키가 없는 원시값 자체
        newLocalCellMetaMap.set(`0-0`, keyMeta);
        newLocalCellMetaMap.set(`0-1`, valueMeta);
        localHotData = [[keyDisplay, valueDisplay]];
    }
    return { preparedHotData: localHotData, preparedColHeaders: localColHeaders, preparedCellMetaMap: newLocalCellMetaMap };
}

/**
 * 현재 Handsontable 인스턴스가 있다면 파괴합니다.
 * @returns {null} 항상 null을 반환합니다.
 */
export function destroyHotInstance() {
    if (hotInstance) {
        hotInstance.destroy();
        hotInstance = null;
    }
    cellMetaMap.clear(); // 인스턴스 파괴 시 셀 메타 맵도 클리어
    lastClickInfo = { row: -1, col: -1, time: 0 }; // 더블 클릭 정보 초기화
    return null;
}

/**
 * 주어진 데이터를 사용하여 Handsontable 인스턴스를 생성하고 화면의 지정된 DOM 요소에 표시합니다.
 * @param {*} data - 테이블에 표시할 데이터 (객체, 배열 또는 원시 값)
 * @param {string} dataKeyName - 데이터의 이름 또는 현재 뷰의 루트 키 (주로 원시 값 표시 시 사용)
 * @param {object} config - 테이블 구성 객체 (tableViewDomElement, 콜백 함수, JSON 데이터 참조 등 포함)
 * @returns {Handsontable|null} 생성된 Handsontable 인스턴스 또는 실패 시 null
 */
export function displayDataWithHandsontable(data, dataKeyName, config) {
    const container = config.tableViewDomElement;
    destroyHotInstance(); // 이전 인스턴스가 있다면 파괴
    if (container) container.innerHTML = ''; // 컨테이너 내용 비우기

    const { preparedHotData, preparedColHeaders, preparedCellMetaMap: newMap } = _prepareTableData(data, dataKeyName, config);
    cellMetaMap = newMap; // 모듈 스코프의 cellMetaMap 업데이트
    // lastClickInfo는 destroyHotInstance에서 이미 초기화됨

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
                        // ... (이전 답변에서 수정된 hidden 로직은 그대로 사용) ...
                        const hotMenu = this;
                        const selection = hotMenu.getSelectedRangeLast();
                        if (!selection) return true;

                        const { from } = selection; // hidden에서는 이 방식이 동작할 수 있으나, callback에서는 selection[0].start가 더 안전합니다.
                        // 여기서는 getSelectedRangeLast()의 반환값에 따라 달라질 수 있습니다.
                        // 일관성을 위해 callback과 동일한 방식으로 접근하는 것이 좋을 수 있습니다.
                        // 하지만 주로 start, end를 가진 객체를 배열로 반환하는 getSelectedRange()와 달리
                        // getSelectedRangeLast()는 단일 범위 객체를 반환할 수 있어 from/to를 직접 가질 수 있습니다.
                        // 만약 hidden은 문제가 없다면 그대로 두셔도 됩니다. callback이 더 중요합니다.
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
                    callback: function(_key, selection) { // selection은 선택된 범위(들)의 배열입니다.
                        const hotMenu = this;

                        // selection 객체 및 그 내부 구조에 대한 방어 코드 추가
                        if (!selection || selection.length === 0 || !selection[0] || !selection[0].start) {
                            console.error('View Content callback: 유효하지 않은 selection 객체입니다.', selection);
                            return;
                        }

                        const startCell = selection[0].start; // 첫 번째 선택 범위의 시작 셀 정보
                        const r = startCell.row; // 여기서 row 값을 가져옵니다.
                        // const c = startCell.col; // 열 값, hidden 로직에 의해 c는 0으로 간주됨

                        const objectKeys = Object.keys(data);
                        // r이 objectKeys의 유효한 인덱스인지 한 번 더 확인 (hidden에서 했지만 방어적으로)
                        if (r >= objectKeys.length) {
                            console.error('View Content callback: 행 인덱스가 범위를 벗어났습니다.', r, objectKeys);
                            return;
                        }
                        const keyName = objectKeys[r];
                        const valueToDisplay = data[keyName];

                        // valueToDisplay가 객체나 배열인지 다시 한번 확인 (hidden에서 했지만 방어적으로)
                        if (typeof valueToDisplay !== 'object' || valueToDisplay === null) {
                            console.error('View Content callback: 대상 값이 객체나 배열이 아닙니다.', valueToDisplay);
                            // 사용자에게 알림을 보여줄 수도 있습니다.
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
                    callback: async function(_key, selection) { // _key 파라미터는 Handsontable에서 제공
                        const hot = this; // 현재 Handsontable 인스턴스
                        const startRow = selection[0].start.row;
                        if (Array.isArray(data)) { // 현재 뷰 데이터가 배열인 경우
                            if (startRow >= 0 && startRow < data.length) {
                                const clonedItem = JSON.parse(JSON.stringify(data[startRow]));
                                data.splice(startRow + 1, 0, clonedItem); // 현재 뷰 데이터 직접 수정
                                config.refreshTreeViewCallback('row_duplicated_array_hot'); // 트리 뷰 새로고침

                                // Handsontable 뷰 업데이트
                                const { preparedHotData, preparedColHeaders, preparedCellMetaMap: newMap } = _prepareTableData(data, dataKeyName, config);
                                cellMetaMap = newMap;
                                hot.updateSettings({ colHeaders: preparedColHeaders });
                                hot.loadData(preparedHotData);
                            }
                        } else if (typeof data === 'object' && data !== null) { // 현재 뷰 데이터가 객체인 경우
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
                                    const orderedData = {}; // 순서 유지를 위해 새 객체에 재할당
                                    for (const k_ of Object.keys(data)) {
                                        orderedData[k_] = data[k_];
                                        if (k_ === originalKey) orderedData[finalNewKey] = clonedValue; // 원본 키 다음에 복제된 항목 추가
                                    }
                                    // 현재 뷰 데이터(data)를 직접 수정
                                    Object.keys(data).forEach(k_d => delete data[k_d]); // 기존 속성 모두 제거
                                    Object.assign(data, orderedData); // 새 순서로 속성 할당

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
                        const currentHeaders = hot.getColHeader(); // 현재 컬럼 헤더 가져오기

                        if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null && !Array.isArray(data[0]) && Array.isArray(currentHeaders) && startCol >= 0 && startCol < currentHeaders.length) {
                            const originalHeader = currentHeaders[startCol];
                            if (typeof originalHeader !== 'string') return; // 헤더가 문자열이 아니면 처리 불가

                            let newHeaderBase = originalHeader + "_복제본";
                            let newHeaderSuggestion = newHeaderBase;
                            let counter = 1;
                            // 첫 번째 객체를 기준으로 새 헤더 이름이 중복되는지 확인
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
                                    data.forEach(obj => { // 현재 뷰 데이터(data)의 각 객체 수정
                                        if (typeof obj === 'object' && obj !== null) {
                                            const clonedColumnValue = obj.hasOwnProperty(originalHeader) ? JSON.parse(JSON.stringify(obj[originalHeader])) : null;

                                            // 열 순서를 고려하여 삽입 (원본 열 바로 다음에 새 열 추가)
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
                                            if (!inserted) { // 원본 키가 마지막이었을 경우
                                                newOrderedObj[finalNewHeader] = clonedColumnValue;
                                            }

                                            Object.keys(obj).forEach(k_o => delete obj[k_o]); // 기존 속성 삭제
                                            Object.assign(obj, newOrderedObj); // 새 순서로 속성 할당
                                        }
                                    });
                                    config.refreshTreeViewCallback('col_duplicated_array_obj_hot_ordered');
                                    const { preparedHotData, preparedColHeaders, preparedCellMetaMap: newMap } = _prepareTableData(data, dataKeyName, config);
                                    cellMetaMap = newMap;
                                    hot.updateSettings({ colHeaders: preparedColHeaders }); // 헤더 변경 가능성 있으므로 업데이트
                                    hot.loadData(preparedHotData);
                                }
                            });
                        }
                    }
                },
                "set_template": { // Update this item
                    name: '템플릿 설정',
                    hidden: function() {
                        // ... (hidden logic remains largely the same, ensuring it's a modifiable value cell) ...
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

                        const currentAvailableTemplates = config.getTemplates(); // Get dynamic templates
                        if (!currentAvailableTemplates || currentAvailableTemplates.length === 0) {
                            showConfirmationPopup({ title: '알림', text: '사용 가능한 템플릿이 없습니다. 먼저 템플릿을 추가해주세요.', icon: 'info', showCancelButton: false, hotInstance: hotMenu });
                            return;
                        }

                        const templateOptions = {};
                        currentAvailableTemplates.forEach((template, index) => {
                            templateOptions[`tpl_idx_${index}`] = template.name; // Use a unique key for Swal
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

                            // ... (rest of the logic to get pathToUpdate and call updateJsonDataCallback, then refresh table)
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
                }, // End of set_template
                "add_as_template": { // New context menu item
                    name: '템플릿으로 추가',
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
                        if (path === null) return true; // Not a modifiable value cell

                        const rootJsonContext = config.currentJsonDataRef ? config.currentJsonDataRef() : config.rootJsonData;
                        const cellValue = config.getObjectByPathCallback(rootJsonContext, path);

                        // Show only if the value is an object or array
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
                        if (path === null) return; // Should be caught by hidden logic

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
                            inputValue: '', // You could suggest a name based on the key if available
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
        licenseKey: 'non-commercial-and-evaluation', // 실제 사용 시 유효한 라이선스 키 필요
        minSpareRows: 0,
        cells: function(row, col, prop) {
            const cellProperties = {};
            const meta = cellMetaMap.get(`${row}-${col}`);
            if (meta) {
                cellProperties.readOnly = meta.readOnly;
                if (meta.isDrillable) {
                    cellProperties.renderer = function(instance, td, r, c, p, value) {
                        Handsontable.renderers.TextRenderer.apply(this, arguments); // 기본 텍스트 렌더러 호출
                        td.style.color = '#007bff'; // 파란색
                        td.style.textDecoration = 'underline';
                        td.style.cursor = 'pointer';
                    };
                }
            }
            return cellProperties;
        },
        afterOnCellMouseDown: function(event, coords, TD) {
            if (event.button !== 0) return; // 좌클릭만 처리
            const currentTime = new Date().getTime();
            const { row, col } = coords;
            const meta = cellMetaMap.get(`${row}-${col}`);
            const DOUBLE_CLICK_THRESHOLD = 300;

            let isDoubleClick = false;
            if (meta && row === lastClickInfo.row && col === lastClickInfo.col && (currentTime - lastClickInfo.time) < DOUBLE_CLICK_THRESHOLD) {
                isDoubleClick = true;
                lastClickInfo = { row: -1, col: -1, time: 0 }; // 더블 클릭 인식 후 초기화
            } else {
                lastClickInfo = { row, col, time: currentTime };
            }

            if (isDoubleClick) {
                let isObjectKeyCell = false;
                const colHeaders = this.getColHeader();
                // 현재 데이터(data)가 객체이고, 첫 번째 컬럼 헤더가 "항목 (Key)"이며, 클릭된 컬럼이 0번째 컬럼일 때 키 셀로 간주
                if (typeof data === 'object' && data !== null && !Array.isArray(data) && Array.isArray(colHeaders) && colHeaders.length > 0 && colHeaders[0] === "항목 (Key)" && col === 0 && meta) {
                    isObjectKeyCell = true;
                }
                if (isObjectKeyCell) { // 객체의 키를 더블 클릭한 경우 (키 이름 변경)
                    const originalKey = meta.originalKey;
                    const parentObject = data; // 현재 테이블에 표시된 데이터 객체
                    const parentPath = config.dataPathString;

                    showTextInputPopup({
                        title: `키 이름 변경: "${originalKey}"`, inputValue: originalKey, customClass: { popup: 'custom-swal-popup' }, confirmButtonText: '저장',
                        inputValidator: (v) => { const n = v.trim(); if (!n) return '키 이름은 비워둘 수 없습니다!'; if (/^\d+$/.test(n)) return '키 이름은 숫자만으로 구성될 수 없습니다!'; if (parentObject.hasOwnProperty(n) && n !== originalKey) return '이미 사용 중인 키입니다!'; return null; },
                        hotInstance: this
                    }).then(res => {
                        if (res.isConfirmed && res.value !== undefined) {
                            const newKey = res.value.trim();
                            if (newKey !== originalKey && config.updateJsonKeyCallback) {
                                config.updateJsonKeyCallback(parentPath, originalKey, newKey, parentObject);
                                // updateJsonKeyCallback이 app.js에서 displayDataInTable을 다시 호출하여 전체를 새로고침하므로
                                // 여기서는 추가적인 hot.loadData가 필요 없음.
                            }
                        }
                    });
                    return; // 키 이름 변경 처리 후 함수 종료
                }
            }
            // 드릴다운 로직 (더블클릭이 아니거나, 더블클릭이지만 키 수정 셀이 아닌 경우, 또는 일반 클릭)
            if (meta && meta.isDrillable && meta.originalValue !== undefined) {
                const isObjectKeyColumnDrill = (typeof data === 'object' && data !== null && !Array.isArray(data) && col === 0 && meta && meta.isDrillable);
                // 더블클릭이 아니거나, (더블클릭이지만 키컬럼이 아니고 드릴 경로가 있는 경우)
                if (!isDoubleClick || (isDoubleClick && !isObjectKeyColumnDrill && meta.drillPath)) {
                    if (typeof meta.originalValue === 'object' && meta.originalValue !== null) {
                        // config.displayTableCallback은 app.js의 displayDataInTable 함수를 호출하며,
                        // 이 함수는 내부적으로 destroyHotInstance 후 새 인스턴스를 생성하므로 이 경우는 OK (네비게이션 동작)
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
                    // updateJsonDataCallback 호출 후, 만약 값의 타입이 변경되어 (예: primitive -> object)
                    // 셀의 drillable 상태나 표시 방식이 바뀌어야 한다면, 테이블을 리프레시 해야 할 수 있음.
                    // 현재는 isBatchOperation=false일때 updateJsonDataCallback 내부에서 refreshTreeView가 호출되고,
                    // 사용자가 트리에서 해당 노드를 다시 클릭하면 테이블이 올바르게 갱신될 것으로 기대.
                    // 또는, 여기서 직접 _prepareTableData와 loadData를 호출할 수도 있음 (성능 고려 필요)
                    if (typeof config.convertToTypedValueCallback(String(newValue), oldValue) !== typeof oldValue && oldValue !== null ) { // 타입이 변경된 경우
                        // console.log("Type changed, consider table refresh");
                        // 아래 코드는 타입 변경 시 즉시 테이블 셀 표시를 업데이트하기 위한 예시.
                        // let updatedViewData = data;
                        // if (config.dataPathString) updatedViewData = config.getObjectByPathCallback(config.currentJsonDataRef(), config.dataPathString);
                        // else updatedViewData = config.currentJsonDataRef();
                        // const { preparedHotData, preparedColHeaders, preparedCellMetaMap: newMapBuild } = _prepareTableData(updatedViewData, dataKeyName, config);
                        // cellMetaMap = newMapBuild;
                        // this.updateSettings({ colHeaders: preparedColHeaders });
                        // this.loadData(preparedHotData);
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
            let currentViewData = data; // 현재 테이블 뷰에 바인딩된 데이터 슬라이스 (클로저)
            let dataWasModified = false;

            if (Array.isArray(currentViewData)) {
                const columnHeaders = hot.getColHeader();
                for (let i = 0; i < amount; i++) {
                    let newItem = null;
                    // 객체 배열인지 판단 (컬럼 헤더가 "Index"가 아닌 경우)
                    if (Array.isArray(columnHeaders) && columnHeaders.length > 0 && (columnHeaders.length !==2 || columnHeaders[0] !== "Index" || columnHeaders[1] !== "Value")) {
                        newItem = {};
                        columnHeaders.forEach(headerKey => {
                            if (typeof headerKey === 'string') { newItem[headerKey] = null; }
                        });
                    }
                    currentViewData.splice(index + i, 0, newItem); // 현재 뷰 데이터(data 슬라이스) 직접 수정
                }
                dataWasModified = true;
                if (dataWasModified) config.refreshTreeViewCallback('row_added_array_hot');

            } else if (typeof currentViewData === 'object' && currentViewData !== null && !Array.isArray(currentViewData)) {
                (async () => { // 객체에 행(키-값 쌍) 추가는 비동기 팝업 사용
                    let tempObjectData = { ...currentViewData };
                    let keysAddedSuccessCount = 0;

                    for (let i = 0; i < amount; i++) {
                        const visualIndexToInsertAt = index + i; // 시각적 행 삽입 위치
                        const popupResult = await showTextInputPopup({
                            title: `새 항목 키 입력 (${i + 1}/${amount})`, inputPlaceholder: '새로운 키 이름을 입력하세요', confirmButtonText: '추가',
                            inputValidator: (value) => { const trimmedValue = value.trim(); if (!trimmedValue) return '키 이름은 비워둘 수 없습니다!'; if (tempObjectData.hasOwnProperty(trimmedValue)) return '이미 사용 중인 키입니다.'; if (/^\d+$/.test(trimmedValue)) return '키 이름은 숫자만으로 구성될 수 없습니다.'; return null; },
                            hotInstance: hot
                        });

                        if (popupResult.isConfirmed && popupResult.value !== undefined) {
                            const newKey = popupResult.value.trim();
                            const valueToInsert = null;
                            const currentKeysInOrder = Object.keys(tempObjectData);
                            const newStructuredObject = {};
                            let keyInserted = false;
                            // 순서 고려하여 삽입
                            for (let k_idx = 0; k_idx < currentKeysInOrder.length; k_idx++) {
                                if (k_idx === visualIndexToInsertAt && !keyInserted) {
                                    newStructuredObject[newKey] = valueToInsert;
                                    keyInserted = true;
                                }
                                newStructuredObject[currentKeysInOrder[k_idx]] = tempObjectData[currentKeysInOrder[k_idx]];
                            }
                            if (!keyInserted) newStructuredObject[newKey] = valueToInsert; // 마지막에 추가
                            tempObjectData = newStructuredObject;
                            keysAddedSuccessCount++;
                        } else { break; } // 사용자가 취소하면 중단
                    }

                    if (keysAddedSuccessCount > 0) {
                        // 현재 뷰 데이터(data 슬라이스)를 직접 수정
                        Object.keys(currentViewData).forEach(key => delete currentViewData[key]);
                        Object.assign(currentViewData, tempObjectData);
                        dataWasModified = true;
                        config.refreshTreeViewCallback('key_added_object_hot_ordered');
                    }

                    // 비동기 작업 후 테이블 리프레시
                    const { preparedHotData, preparedColHeaders, preparedCellMetaMap: newMap } = _prepareTableData(currentViewData, dataKeyName, config);
                    cellMetaMap = newMap;
                    hot.updateSettings({ colHeaders: preparedColHeaders });
                    hot.loadData(preparedHotData);
                })();
                return; // 비동기이므로 여기서 함수 종료하고, 내부에서 리프레시 처리
            }

            // (배열 수정 등) 동기 작업 후 또는 데이터 수정이 없었더라도 일관성을 위해 리프레시
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
            let currentViewData = data; // 현재 뷰 데이터 슬라이스
            let dataWasModified = false;

            // 객체의 배열 뷰에서만 열 추가 의미가 있음
            if (Array.isArray(currentViewData) && currentViewData.length > 0 && typeof currentViewData[0] === 'object' && currentViewData[0] !== null && !Array.isArray(currentViewData[0])) {
                (async () => { // 새 열(키) 이름을 받아야 하므로 비동기
                    for (let i = 0; i < amount; i++) {
                        const visualColIndexToInsertAt = index + i; // 시각적 열 삽입 위치
                        const popupResult = await showTextInputPopup({
                            title: `새 열(속성)의 키 입력 (${i + 1}/${amount})`, inputPlaceholder: '새로운 키 이름을 입력하세요', confirmButtonText: '추가',
                            inputValidator: (value) => { const trimmedValue = value.trim(); if (!trimmedValue) return '키 이름은 비워둘 수 없습니다!'; if (currentViewData[0].hasOwnProperty(trimmedValue)) return '첫 번째 객체에 이미 해당 키가 존재합니다.'; if (/^\d+$/.test(trimmedValue)) return '키 이름은 숫자만으로 구성될 수 없습니다.'; return null; },
                            hotInstance: hot
                        });

                        if (popupResult.isConfirmed && popupResult.value !== undefined) {
                            const newKeyName = popupResult.value.trim();
                            currentViewData.forEach(obj => { // 모든 객체에 새 키와 null 값 추가
                                if (typeof obj === 'object' && obj !== null) {
                                    const currentKeys = Object.keys(obj);
                                    const newOrderedObj = {};
                                    let inserted = false;
                                    if (visualColIndexToInsertAt >= currentKeys.length) {
                                        obj[newKeyName] = null; // 맨 뒤에 추가
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
                        } else { break; } // 사용자 취소
                    }
                    if (dataWasModified) config.refreshTreeViewCallback('col_added_array_of_obj_hot_ordered');

                    // 비동기 작업 후 테이블 리프레시
                    const { preparedHotData, preparedColHeaders, preparedCellMetaMap: newMap } = _prepareTableData(currentViewData, dataKeyName, config);
                    cellMetaMap = newMap;
                    hot.updateSettings({ colHeaders: preparedColHeaders }); // 헤더가 변경되었으므로 반드시 업데이트
                    hot.loadData(preparedHotData);
                })();
                return; // 비동기이므로 여기서 함수 종료
            } else if (typeof currentViewData === 'object' && currentViewData !== null && !Array.isArray(currentViewData)) {
                // 단순 객체 뷰에서 열 추가는 행 추가와 유사하게 처리 (새 키-값 쌍 추가)
                showConfirmationPopup({ title: '오류', text: '현재 데이터 구조에는 열을 추가할 수 없습니다.', icon: 'error', showCancelButton: false, hotInstance: hot })
                    .then(() => { // 알림 후 현재 상태로 테이블 리프레시
                        const { preparedHotData, preparedColHeaders, preparedCellMetaMap: newMap } = _prepareTableData(currentViewData, dataKeyName, config);
                        cellMetaMap = newMap;
                        hot.updateSettings({ colHeaders: preparedColHeaders });
                        hot.loadData(preparedHotData);
                    });
            } else { // 그 외의 경우 (원시값 배열 등) 열 추가 불가
                showConfirmationPopup({ title: '오류', text: '현재 데이터 구조에는 열을 추가할 수 없습니다.', icon: 'error', showCancelButton: false, hotInstance: hot });
                const { preparedHotData, preparedColHeaders, preparedCellMetaMap: newMap } = _prepareTableData(currentViewData, dataKeyName, config); // 상태 일관성 위해 리프레시
                cellMetaMap = newMap;
                hot.updateSettings({ colHeaders: preparedColHeaders });
                hot.loadData(preparedHotData);
            }
        },
        beforeRemoveRow: function(index, amount, physicalRows, source) {
            if (source === 'loadData' || !config.currentJsonDataRef) return true; // Handsontable 내부 loadData 시에는 무시
            let currentViewData = data; // 현재 뷰 데이터 슬라이스 직접 수정
            physicalRows.sort((a, b) => b - a); // 뒤에서부터 삭제해야 인덱스 문제 없음

            if (Array.isArray(currentViewData)) {
                physicalRows.forEach(rowIndex => {
                    if (rowIndex >= 0 && rowIndex < currentViewData.length) { currentViewData.splice(rowIndex, 1); }
                });
            } else if (typeof currentViewData === 'object' && currentViewData !== null && !Array.isArray(currentViewData)) {
                const keys = Object.keys(currentViewData); // 현재 객체의 키 목록 (표시 순서대로)
                const keysToRemove = physicalRows.map(rowIndex => keys[rowIndex]).filter(key => key !== undefined);
                if (keysToRemove.length > 0) { keysToRemove.forEach(key => { delete currentViewData[key]; });}
            } else {
                return false; // 이 외의 데이터 구조에서는 행 삭제 불가
            }
            return true; // 삭제 계속 진행
        },
        afterRemoveRow: function(index, amount, physicalRows, source) {
            if (source === 'loadData' || !config.currentJsonDataRef || source === 'ContextMenu.remove_row_custom') return; // 특정 소스는 무시
            const hot = this;
            let currentViewData = data; // 이미 beforeRemoveRow에서 수정된 데이터 슬라이스

            config.refreshTreeViewCallback('row_removed_hot');
            // 테이블 뷰 업데이트
            const { preparedHotData, preparedColHeaders, preparedCellMetaMap: newMap } = _prepareTableData(currentViewData, dataKeyName, config);
            cellMetaMap = newMap;
            hot.updateSettings({ colHeaders: preparedColHeaders });
            hot.loadData(preparedHotData);
        },
        beforeRemoveCol: function(index, amount, physicalCols, source) {
            if (source === 'loadData' || !config.currentJsonDataRef) return true;
            let currentViewData = data; // 현재 뷰 데이터 슬라이스
            const colHeaders = this.getColHeader();

            // 객체의 배열 뷰에서만 의미 있는 동작
            if (Array.isArray(currentViewData) && currentViewData.length > 0 && typeof currentViewData[0] === 'object' && currentViewData[0] !== null && !Array.isArray(currentViewData[0])) {
                if (!Array.isArray(colHeaders)) { showConfirmationPopup({ title: '오류', text: '열 헤더 정보를 가져올 수 없습니다.', icon: 'error', showCancelButton: false, hotInstance: this }); return false; }
                physicalCols.sort((a, b) => b - a); // 뒤에서부터 삭제
                physicalCols.forEach(colIndex => {
                    if (colIndex >= 0 && colIndex < colHeaders.length) {
                        const keyToRemove = colHeaders[colIndex]; // 삭제할 속성(키) 이름
                        if (typeof keyToRemove === 'string') {
                            currentViewData.forEach(obj => { // 모든 객체에서 해당 키 삭제
                                if (typeof obj === 'object' && obj !== null) { delete obj[keyToRemove]; }
                            });
                        }
                    }
                });
            } else if (typeof currentViewData === 'object' && currentViewData !== null && !Array.isArray(currentViewData)) {
                // 단순 객체 뷰에서는 열 부분 삭제 불가 (행 전체 삭제로 유도)
                showConfirmationPopup({ title: '오류', text: '이 뷰에서 특정 열 부분 삭제는 지원되지 않습니다.', icon: 'error', showCancelButton: false, hotInstance: this });
                return false;
            } else { // 그 외 (원시값 배열 등)
                showConfirmationPopup({ title: '오류', text: '현재 데이터 구조에서는 열을 삭제할 수 없습니다.', icon: 'error', showCancelButton: false, hotInstance: this });
                return false;
            }
            return true; // 삭제 계속 진행
        },
        afterRemoveCol: function(index, amount, physicalCols, source) {
            if (source === 'loadData' || !config.currentJsonDataRef) return;
            const hot = this;
            let currentViewData = data; // 이미 beforeRemoveCol에서 수정된 데이터 슬라이스

            config.refreshTreeViewCallback('col_removed_hot');
            // 테이블 뷰 업데이트 (헤더가 변경되었을 수 있으므로 colHeaders도 업데이트)
            const { preparedHotData, preparedColHeaders, preparedCellMetaMap: newMap } = _prepareTableData(currentViewData, dataKeyName, config);
            cellMetaMap = newMap;
            hot.updateSettings({ colHeaders: preparedColHeaders });
            hot.loadData(preparedHotData);
        }
    });
    return hotInstance;
}

/**
 * Handsontable 셀 변경 시 해당 변경 사항의 JSON 내 실제 데이터 경로를 결정합니다.
 * @param {number} row - 변경된 셀의 행 인덱스
 * @param {number} col - 변경된 셀의 열 인덱스
 * @param {object} structureInfo - 현재 테이블 구조 정보 (sourceData, pathPrefix, headers, isSourceArray 등)
 * @returns {string|null} 데이터 경로 문자열 또는 null (경로 특정 불가 시)
 */
function getPathForHotChange(row, col, structureInfo) {
    const { sourceData, pathPrefix, headers, isSourceArray, isSourceArrayOfObjects, cellMetaMap: currentCellMetaMap } = structureInfo;
    let itemSubPath = "";

    if (isSourceArray) { // 현재 sourceData가 배열인 경우
        if (row < sourceData.length) { // 유효한 행 인덱스
            if (isSourceArrayOfObjects) { // 객체의 배열
                if (Array.isArray(headers) && col >= 0 && col < headers.length) {
                    const propertyName = headers[col]; // 컬럼 헤더가 객체의 키
                    itemSubPath = `[${row}].${propertyName}`;
                } else { return null; } // 잘못된 컬럼 인덱스 또는 헤더 정보 없음
            } else { // 원시 값의 배열 (Index | Value 컬럼)
                if (col === 1) { itemSubPath = `[${row}]`; } // 값 컬럼(1)만 경로 가짐
                else { return null; } // 인덱스 컬럼(0)은 경로 없음
            }
        } else { return null; } // 행 인덱스 범위 초과
    } else if (typeof sourceData === 'object' && sourceData !== null && !Array.isArray(sourceData)) { // 현재 sourceData가 단일 객체인 경우
        const metaKeyCell = currentCellMetaMap.get(`${row}-0`); // 0번 컬럼(키 컬럼)의 메타 정보
        if (!metaKeyCell || metaKeyCell.originalKey === undefined) return null; // 키 정보 없음

        const objectKeyForRow = metaKeyCell.originalKey; // 현재 행에 해당하는 객체의 키
        if (col === 0) return null; // 키 컬럼 자체는 값 경로 아님

        // 현재 테이블 뷰가 객체 내 배열을 펼쳐서 보여주는 형태인지, 단순 키-값 형태인지 확인
        const isArrayExpandedInObjectView = Array.isArray(headers) && headers.length > 1 && headers[0] === "항목 (Key)" && !isNaN(parseInt(headers[1],10)) ; // 두 번째 헤더가 숫자인지 등으로 판별
        const isSimpleObjectView = Array.isArray(headers) && headers.length === 2 && headers[0] === "항목 (Key)" && headers[1] === "값 (Value)";

        if (isArrayExpandedInObjectView) { // 객체 내 배열 확장 뷰 (Key | 0 | 1 | 2 ...)
            if (col > 0 && col < headers.length) { // 값(배열 요소)에 해당하는 컬럼
                const arrayIndexString = headers[col]; // 컬럼 헤더가 배열 인덱스 문자열 ('0', '1' 등)
                const valueAtKey = sourceData[objectKeyForRow];
                if (Array.isArray(valueAtKey)) {
                    const currentCellMeta = currentCellMetaMap.get(`${row}-${col}`);
                    if (currentCellMeta && currentCellMeta.isPadding) return null; // 패딩 셀은 경로 없음
                    itemSubPath = `.${objectKeyForRow}[${arrayIndexString}]`;
                } else { return null; } // 해당 키의 값이 배열이 아니면 경로 특정 불가
            } else { return null; } // 잘못된 컬럼
        } else if (isSimpleObjectView) { // 단순 객체 뷰 (Key | Value)
            if (col === 1) { itemSubPath = `.${objectKeyForRow}`; } // 값 컬럼(1)만 경로 가짐
            else { return null; } // 잘못된 컬럼
        } else { // 기타 객체 뷰 (예: 빈 객체)
            if (Object.keys(sourceData).length === 0 && Array.isArray(headers) && headers.length === 2 && headers[0] === "항목 (Key)" && headers[1] === "값 (Value)") return null; // 빈 객체는 값 경로 없음
            return null; // 알 수 없는 구조
        }
    } else { // 현재 sourceData가 원시 값인 경우 (항목 | 값 컬럼)
        if (row === 0 && col === 1) { return pathPrefix || ""; } // 값 셀(1)의 경로는 부모 경로 또는 루트("")
        else { return null; } // 항목 레이블 셀(0)은 경로 없음
    }

    // 최종 경로 조합
    if (pathPrefix) { // 부모 경로가 있는 경우
        if (itemSubPath.startsWith('.')) { return pathPrefix + itemSubPath; }
        else if (itemSubPath.startsWith('[')) { return pathPrefix + itemSubPath; }
        else if (itemSubPath) { return pathPrefix + '.' + itemSubPath; } // itemSubPath가 있지만 .이나 [로 시작하지 않는 경우 (거의 없을 것으로 예상)
        return pathPrefix; // itemSubPath가 없는 경우 (원시값 직접 수정)
    } else { // 부모 경로가 없는 경우 (루트에서 시작)
        return itemSubPath.startsWith('.') ? itemSubPath.substring(1) : itemSubPath;
    }
}