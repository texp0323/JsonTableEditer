// dataUtils.js

/** 주어진 경로 문자열을 이용해 객체 내의 특정 값을 가져옵니다. */
export function getObjectByPath(obj, path) {
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

/** 입력된 문자열 값을 원래 데이터 타입(또는 추론된 타입)으로 변환합니다. */
export function convertToTypedValue(newValue, originalValue) {
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