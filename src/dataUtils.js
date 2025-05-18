// dataUtils.js

/**
 * 주어진 경로 문자열을 이용해 객체 내의 특정 값을 가져옵니다.
 * @param {object} obj - 검색 대상 객체
 * @param {string} path - 객체 내 경로 문자열 (예: 'user.address.city')
 * @returns {*} 해당 경로의 값 또는 undefined
 */
export function getObjectByPath(obj, path) {
    if (!path) return obj;
    // 'key[0]' 형태를 'key.0' 형태로 변환하여 일반적인 점(.) 구분자로 처리
    const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.');
    let current = obj;
    for (const key of keys) {
        if (current && typeof current === 'object' && key in current) {
            current = current[key];
        } else {
            return undefined; // 경로가 존재하지 않거나 중간에 객체가 아닌 경우
        }
    }
    return current;
}

/**
 * 입력된 문자열 값을 원래 데이터 타입(또는 추론된 타입)으로 변환합니다.
 * JSON 배열/객체 형태의 문자열도 파싱하여 변환합니다.
 * @param {string} newValue - 변환할 새 값 (문자열 형태)
 * @param {*} originalValue - 참고용 원래 값 (타입 추론에 사용될 수 있음)
 * @returns {*} 변환된 값 (타입이 변경되었거나, 변경 불가 시 원본 문자열)
 */
export function convertToTypedValue(newValue, originalValue) {
    if (typeof newValue === 'string') {
        const str = newValue.trim();

        // 1. null, boolean 체크
        if (str.toLowerCase() === 'null') return null;
        if (str.toLowerCase() === 'true') return true;
        if (str.toLowerCase() === 'false') return false;

        // 2. 숫자 체크 (기존 로직 유지)
        // Number('')는 0이므로, 빈 문자열은 숫자로 간주하지 않도록 str !== '' 조건 확인
        if (str !== '' && !isNaN(Number(str))) {
            // 원래 타입이 숫자였거나, 소수점을 포함하거나, 명확한 정수/실수 형태일 때 숫자로 변환
            if (typeof originalValue === 'number' ||
                str.includes('.') ||
                /^-?\d+$/.test(str) || // 부호 있는 정수 형태
                String(Number(str)) === str.replace(/^0+(?=\d)/, '')) { // "007" 같은 문자열이 숫자로 바뀌었다가 다시 문자열로 바뀌었을 때 원본과 같은지 (선행 0 제거)
                return Number(str);
            }
        }

        // 3. JSON 배열 또는 객체 형태의 문자열인지 체크 (추가된 로직)
        if ((str.startsWith('[') && str.endsWith(']')) || (str.startsWith('{') && str.endsWith('}'))) {
            try {
                return JSON.parse(str); // JSON 문자열을 실제 배열/객체로 파싱
            } catch (e) {
                // JSON.parse 실패 시, 원래 문자열을 그대로 반환 (잘못된 JSON 형식일 수 있음)
                // 이 경우 사용자가 의도한 문자열일 수 있으므로 오류를 발생시키지 않고 문자열로 처리
                return newValue;
            }
        }

        // 위의 어떤 경우에도 해당하지 않으면 원본 문자열 그대로 반환
        return newValue;
    }

    // 입력값이 문자열이 아니면 그대로 반환
    return newValue;
}