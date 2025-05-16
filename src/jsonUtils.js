export { minifyJson, prettyJson };

/**
 * JSON 객체를 Minify/Uglify 형태로 변환하는 함수
 * @param {Object|string} jsonInput - JSON 객체 또는 JSON 문자열
 * @returns {string} 최소화된 JSON 문자열
 */
function minifyJson(jsonInput) {
    try {
        // 입력값이 문자열인 경우 JSON 객체로 파싱
        const jsonObject = typeof jsonInput === 'string'
            ? JSON.parse(jsonInput)
            : jsonInput;

        // JSON.stringify의 세 번째 매개변수에 공백을 지정하지 않아 최소화
        return JSON.stringify(jsonObject);
    } catch (error) {
        return `오류 발생: ${error.message}`;
    }
}

/**
 * JSON 문자열을 보기 좋게 포맷팅하는 함수 (Minify의 반대)
 * @param {Object|string} jsonInput - JSON 객체 또는 JSON 문자열
 * @param {number} indentSpaces - 들여쓰기 공백 수 (기본값: 2)
 * @returns {string} 포맷팅된 JSON 문자열
 */
function prettyJson(jsonInput, indentSpaces = 2) {
    try {
        const jsonObject = typeof jsonInput === 'string'
            ? JSON.parse(jsonInput)
            : jsonInput;

        const raw = JSON.stringify(jsonObject, null, indentSpaces);

        // JSON 파싱된 상태를 다시 순회하며 배열 처리
        function isPrimitiveArray(arr) {
            return Array.isArray(arr) &&
                arr.every(val => (
                    typeof val === 'number' ||
                    typeof val === 'string' ||
                    typeof val === 'boolean' ||
                    val === null
                ));
        }

        function replacer(key, value) {
            if (isPrimitiveArray(value)) {
                // 압축된 한 줄 배열 표시
                return `@@__INLINE__@@${JSON.stringify(value)}`;
            }
            return value;
        }

        // 중간 단계: 압축 대상은 특수 마커로 처리
        const marked = JSON.stringify(jsonObject, replacer, indentSpaces);

        // 마커 처리된 것만 한 줄 배열로 대체
        const formatted = marked.replace(
            /"@@__INLINE__@@\[(.*?)\]"/g,
            (match, inner) => `[${inner}]`
        );

        return formatted;
    } catch (error) {
        return `오류 발생: ${error.message}`;
    }
}
