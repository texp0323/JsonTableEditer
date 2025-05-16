/**
 * 값의 타입에 따라 Tree 노드의 값(value)을 표시하는 span 요소에 스타일을 적용합니다.
 * @param {HTMLElement} valueSpan - 값을 표시하는 span 요소.
 * @param {*} value - 표시할 실제 값.
 */
export function applyValueStyleToNode(valueSpan, value) {
    let displayValue = String(value);
    let color = '';
    if (typeof value === 'string') { displayValue = `"${value}"`; color = '#28a745'; }
    else if (typeof value === 'number') { color = '#17a2b8'; }
    else if (typeof value === 'boolean') { color = '#fd7e14'; }
    else if (value === null) { displayValue = 'null'; color = '#6c757d'; }
    valueSpan.textContent = displayValue;
    if (color) valueSpan.style.color = color; else valueSpan.style.color = ''; // 기본색으로 리셋
}