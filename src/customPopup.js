import Swal from 'sweetalert2';
import * as Diff from 'diff';

export { showJsonDiffPopup, showCustomMessagePopup, showCustomFormPopup };

function showJsonDiffPopup(options) {
    const {
        title = 'JSON Diff',
        jsonDiffData,
        buttons = [],
    } = options;

    let headerContent = '';
    let diffHtmlContent = '';
    let orderedChangeData = []; // 이 변수는 diff 줄 순서 정렬 로직에 사용되던 것이므로, 키 순서와는 별개입니다.

    // stableStringify 함수 수정: 키를 정렬하지 않고 원래 순서를 유지하도록 변경
    const stableStringify = (obj, space = 2) => {
        // 객체의 키 순서를 유지하면서 재귀적으로 처리하는 함수
        const preserveKeyOrderAndProcess = (currentObj) => {
            if (typeof currentObj !== 'object' || currentObj === null) {
                return currentObj; // 원시 값이나 null은 그대로 반환
            }
            if (Array.isArray(currentObj)) {
                // 배열은 각 요소를 재귀적으로 처리 (순서 유지됨)
                return currentObj.map(preserveKeyOrderAndProcess);
            }
            // 객체는 Object.keys()를 사용하여 표준 속성 순서대로 처리
            const processedObj = {};
            Object.keys(currentObj).forEach(key => {
                processedObj[key] = preserveKeyOrderAndProcess(currentObj[key]);
            });
            return processedObj;
        };

        try {
            // preserveKeyOrderAndProcess를 통해 객체를 처리한 후 문자열화합니다.
            // 이렇게 하면 JSON.stringify가 처리된 객체의 키 순서를 따릅니다.
            return JSON.stringify(preserveKeyOrderAndProcess(obj), null, space);
        } catch (e) {
            console.error("Error stringifying object while preserving key order:", e);
            // 오류 발생 시 기본 JSON.stringify 사용 (이것도 대부분 순서 유지)
            return JSON.stringify(obj, null, space);
        }
    };

    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    if (jsonDiffData && jsonDiffData.left !== undefined && jsonDiffData.right !== undefined) {
        // 'Diff' 객체 (jsdiff 라이브러리) 존재 여부 확인
        if (typeof Diff === 'undefined' || typeof Diff.diffLines !== 'function') {
            console.error('Diff 라이브러리(jsdiff)가 제대로 import되지 않았거나 전역으로 사용 불가능합니다.');
            diffHtmlContent = '<p class="diff-popup-error-message">Diff 라이브러리를 로드할 수 없습니다. (Diff is not defined)</p>';
            headerContent = `<div class="diff-popup-header error">라이브러리 오류</div>`;
        } else {
            try {
                // 수정된 stableStringify 함수 사용
                const stringLeft = stableStringify(jsonDiffData.left);
                const stringRight = stableStringify(jsonDiffData.right);

                const diffParts = Diff.diffLines(stringLeft, stringRight);

                let totalAdded = 0;
                let totalRemoved = 0;
                diffParts.forEach(part => {
                    const partValue = part.value || '';
                    // Count lines accurately, considering the last line might not have a newline
                    const linesArray = partValue.split('\n');
                    let numLines = linesArray.length;
                    if (linesArray[linesArray.length - 1] === '' && partValue.length > 0) { // Ends with newline, but not just an empty string
                        numLines -=1;
                    }
                    if (partValue === '') numLines = 0; // Empty part means zero lines

                    if (part.added) {
                        totalAdded += numLines;
                    } else if (part.removed) {
                        totalRemoved += numLines;
                    }
                });

                // enrichedChangeBlocks 및 orderedChangeData 생성 로직 (이 부분은 변경된 줄 단위의 순서 정렬 로직이므로 유지)
                // 이 로직은 JSON 객체 키 순서가 아닌, diff 결과로 나온 텍스트 줄들의 변경 순서를 다룹니다.
                const enrichedChangeBlocks = [];
                let currentOldLine = 1;
                let currentNewLine = 1;
                diffParts.forEach((part, index) => {
                    const partValue = part.value || '';
                    const linesArray = partValue.split('\n');
                    let numLines = linesArray.length;
                    if (linesArray[linesArray.length - 1] === '' && partValue.length > 0) {
                        numLines -=1;
                    }
                    if (partValue === '') numLines = 0;

                    if (part.removed) {
                        enrichedChangeBlocks.push({ originalPartIndex: index, part, sourceType: 'del', lineNumber: currentOldLine, numLines });
                        currentOldLine += numLines;
                    } else if (part.added) {
                        enrichedChangeBlocks.push({ originalPartIndex: index, part, sourceType: 'ins', lineNumber: currentNewLine, numLines });
                        currentNewLine += numLines;
                    } else {
                        // 공통 부분은 currentOldLine과 currentNewLine을 모두 증가시킵니다.
                        // 단, 이 부분을 enrichedChangeBlocks에 추가할 필요는 없습니다 (변경점 네비게이션 대상이 아님).
                        currentOldLine += numLines;
                        currentNewLine += numLines;
                    }
                });

                // ... (orderedChangeData를 생성하는 복잡한 순서 정렬 로직은 그대로 유지) ...
                // 이 부분은 JSON 키 순서와는 별개로, diff 결과의 변경된 "줄"들을
                // 사용자가 탐색하기 좋은 순서로 정렬하는 로직으로 보입니다.
                // stableStringify 변경으로 인해 입력 문자열의 키 순서는 유지되지만,
                // diff 결과 자체의 줄 순서 정렬은 이 로직이 담당합니다.
                orderedChangeData = [];
                let availablePoints = [...enrichedChangeBlocks];
                let lastAddedPointDetails = null;

                if (availablePoints.length > 0) {
                    availablePoints.sort((a,b) => {
                        if (a.lineNumber !== b.lineNumber) return a.lineNumber - b.lineNumber;
                        if (a.sourceType === 'del' && b.sourceType !== 'del') return -1;
                        if (a.sourceType !== 'del' && b.sourceType === 'del') return 1;
                        return a.originalPartIndex - b.originalPartIndex;
                    });
                    lastAddedPointDetails = availablePoints[0];
                    orderedChangeData.push(lastAddedPointDetails);
                    availablePoints = availablePoints.filter(p => p.originalPartIndex !== lastAddedPointDetails.originalPartIndex);
                }

                while (availablePoints.length > 0 && lastAddedPointDetails) {
                    const currentRefLineNumber = lastAddedPointDetails.lineNumber;
                    let bestCandidate = null;
                    let pass1Candidates = [];
                    for (const cand of availablePoints) {
                        if (cand.lineNumber >= currentRefLineNumber) {
                            pass1Candidates.push({ ...cand, diff: cand.lineNumber - currentRefLineNumber });
                        }
                    }

                    if (pass1Candidates.length > 0) {
                        pass1Candidates.sort((a, b) => {
                            if (a.diff !== b.diff) return a.diff - b.diff;
                            if (a.sourceType === 'del' && b.sourceType !== 'del') return -1;
                            if (a.sourceType !== 'del' && b.sourceType === 'del') return 1;
                            return a.originalPartIndex - b.originalPartIndex;
                        });
                        bestCandidate = pass1Candidates[0];
                    } else {
                        let pass2Candidates = [];
                        for (const cand of availablePoints) {
                            pass2Candidates.push({ ...cand, absDiff: Math.abs(cand.lineNumber - currentRefLineNumber) });
                        }
                        if (pass2Candidates.length > 0) {
                            pass2Candidates.sort((a,b) => {
                                if (a.absDiff !== b.absDiff) return a.absDiff - b.absDiff;
                                if (a.lineNumber !== b.lineNumber) return a.lineNumber - b.lineNumber;
                                if (a.sourceType === 'del' && b.sourceType !== 'del') return -1;
                                if (a.sourceType !== 'del' && b.sourceType === 'del') return 1;
                                return a.originalPartIndex - b.originalPartIndex;
                            });
                            bestCandidate = pass2Candidates[0];
                        }
                    }

                    if (bestCandidate) {
                        orderedChangeData.push(bestCandidate);
                        lastAddedPointDetails = bestCandidate;
                        availablePoints = availablePoints.filter(p => p.originalPartIndex !== bestCandidate.originalPartIndex);
                    } else {
                        break;
                    }
                }
                // ... (orderedChangeData 생성 로직 끝) ...


                let leftPaneHtml = '';
                let rightPaneHtml = '';
                let currentLeftLineNumRender = 1;
                let currentRightLineNumRender = 1;
                const orderedNavMap = new Map();
                orderedChangeData.forEach((data, navIndex) => {
                    orderedNavMap.set(data.originalPartIndex, navIndex);
                });

                diffParts.forEach((part, partIndex) => {
                    const partValue = part.value || '';
                    // 끝에 불필요한 개행문자로 인해 빈 줄이 생기는 것을 방지
                    const lines = partValue.replace(/\n$/, '').split('\n');

                    // 만약 partValue 자체가 빈 문자열이면 lines는 [""]가 되므로, 실제 내용이 있는 줄만 처리
                    if (lines.length === 1 && lines[0] === '' && partValue !== '') {
                        // 이 경우는 거의 없지만, 방어적으로
                    } else if (lines.length === 1 && lines[0] === '' && partValue === '') {
                        // 정말 빈 부분이면 아무것도 안 함 (예: diffParts가 연속된 공백 변경을 만들 때)
                    }
                    else {
                        lines.forEach((line, lineIndexInPart) => {
                            let lineId = '';
                            if ((part.added || part.removed) && lineIndexInPart === 0 && orderedNavMap.has(partIndex)) {
                                const navOrderIndex = orderedNavMap.get(partIndex);
                                lineId = `id="diff-nav-target-${navOrderIndex}"`;
                            }

                            if (part.added) {
                                leftPaneHtml += `<div class="diff-sbs-line"><span class="diff-sbs-line-num"></span><span class="diff-sbs-line-content"></span></div>\n`;
                                rightPaneHtml += `<div ${lineId} class="diff-sbs-line diff-added"><span class="diff-sbs-line-num">${currentRightLineNumRender++}</span><span class="diff-sbs-line-content">${escapeHtml(line)}</span></div>\n`;
                            } else if (part.removed) {
                                leftPaneHtml += `<div ${lineId} class="diff-sbs-line diff-removed"><span class="diff-sbs-line-num">${currentLeftLineNumRender++}</span><span class="diff-sbs-line-content">${escapeHtml(line)}</span></div>\n`;
                                rightPaneHtml += `<div class="diff-sbs-line"><span class="diff-sbs-line-num"></span><span class="diff-sbs-line-content"></span></div>\n`;
                            } else { // common
                                leftPaneHtml += `<div class="diff-sbs-line diff-common"><span class="diff-sbs-line-num">${currentLeftLineNumRender++}</span><span class="diff-sbs-line-content">${escapeHtml(line)}</span></div>\n`;
                                rightPaneHtml += `<div class="diff-sbs-line diff-common"><span class="diff-sbs-line-num">${currentRightLineNumRender++}</span><span class="diff-sbs-line-content">${escapeHtml(line)}</span></div>\n`;
                            }
                        });
                    }
                });


                diffHtmlContent = `
                    <div class="diff-sbs-container">
                        <div class="diff-sbs-pane" id="diff-left-pane">${leftPaneHtml}</div>
                        <div class="diff-sbs-pane" id="diff-right-pane">${rightPaneHtml}</div>
                    </div>
                `;

                if (orderedChangeData.length > 0 || totalAdded > 0 || totalRemoved > 0) {
                    let summaryHtml = '';
                    if (totalAdded > 0 || totalRemoved > 0) {
                        summaryHtml = `
                            <span class="diff-summary">
                                <strong class="diff-summary-added">+${totalAdded}</strong>
                                <strong class="diff-summary-removed">-${totalRemoved}</strong>
                            </span>`;
                    }

                    headerContent = `
                        <div class="diff-popup-header">JSON 비교 결과 (텍스트 기반 Side-by-Side)</div>
                        <div id="diff-navigation">
                            ${summaryHtml}
                            <button id="prev-change-btn" class="swal2-styled">이전 변경점</button>
                            <button id="next-change-btn" class="swal2-styled">다음 변경점</button>
                            <span id="current-change-info"></span>
                        </div>`;
                } else {
                    headerContent = `<div class="diff-popup-header">JSON 비교 결과</div>`;
                    if (stringLeft === stringRight) {
                        diffHtmlContent = '<p class="diff-no-changes-message">내용이 동일합니다. 변경 사항이 없습니다.</p>';
                    } else {
                        // 이 경우는 거의 없지만, totalAdded/Removed가 0인데 문자열이 다른 경우 (예: 공백만 다른 경우 diffLines가 감지 못할수도)
                        diffHtmlContent = '<p class="diff-no-changes-message">변경 사항이 감지되지 않았지만 원본 문자열은 다릅니다.</p>';
                    }
                }

            } catch (e) {
                console.error("JSON diff 생성 또는 HTML 렌더링 중 오류:", e);
                diffHtmlContent = `<p class="diff-popup-error-message">JSON diff 표시에 오류 발생: ${e.message}</p>`;
                headerContent = `<div class="diff-popup-header error">오류 발생</div>`;
            }
        }
    } else {
        diffHtmlContent = '<p class="diff-no-data">Diff를 표시할 JSON 데이터가 제공되지 않았습니다.</p>';
        headerContent = `<div class="diff-popup-header error">데이터 오류</div>`;
    }

    const finalHtml = `
        ${headerContent}
        <div id="diff-container">
            ${diffHtmlContent}
        </div>`;

    // showCustomPopup 함수는 외부에 정의되어 있다고 가정합니다.
    // 이 함수는 SweetAlert2를 사용하여 팝업을 띄우는 것으로 보입니다.
    return showCustomPopup({
        title: title,
        html: finalHtml,
        buttons: buttons,
        width: '95%',
        customClass: {
            popup: 'custom-swal-popup-wider-text-diff',
            htmlContainer: 'custom-swal-html-container-text-diff'
        },
        didOpen: (popup) => {
            // ... (이하 네비게이션 버튼 및 이벤트 리스너 로직은 이전과 동일하게 유지) ...
            const finalNavigableLines = [];
            if (orderedChangeData && orderedChangeData.length > 0) {
                for (let i = 0; i < orderedChangeData.length; i++) {
                    const element = document.getElementById(`diff-nav-target-${i}`);
                    if (element) {
                        finalNavigableLines.push(element);
                    }
                }
            }

            let currentChangeIndex = -1;
            let previouslyHighlightedLineElement = null;

            const navContainer = document.getElementById('diff-navigation');
            const nextBtn = document.getElementById('next-change-btn');
            const prevBtn = document.getElementById('prev-change-btn');
            const changeInfo = document.getElementById('current-change-info');

            function updateButtonAndNavInfo() {
                if (!navContainer) return;

                if (finalNavigableLines.length === 0) {
                    if (nextBtn) nextBtn.style.display = 'none'; // 버튼 숨김
                    if (prevBtn) prevBtn.style.display = 'none'; // 버튼 숨김
                    if (changeInfo) changeInfo.textContent = (totalAdded > 0 || totalRemoved > 0) ? `0 / 0` : '변경점 없음';
                } else {
                    if (nextBtn) nextBtn.style.display = 'inline-block';
                    if (prevBtn) prevBtn.style.display = 'inline-block';
                }

                if (changeInfo) {
                    if (currentChangeIndex >= 0 && currentChangeIndex < finalNavigableLines.length) {
                        changeInfo.textContent = `${currentChangeIndex + 1} / ${finalNavigableLines.length}`;
                    } else if (finalNavigableLines.length > 0) {
                        // 초기 상태 또는 인덱스 벗어난 경우 (이론상 발생 안 함)
                        changeInfo.textContent = `0 / ${finalNavigableLines.length}`;
                    } else {
                        changeInfo.textContent = '변경점 없음';
                    }
                }
                if (nextBtn) nextBtn.disabled = currentChangeIndex >= finalNavigableLines.length - 1;
                if (prevBtn) prevBtn.disabled = currentChangeIndex <= 0;
            }

            function scrollToChange(indexToScroll) {
                if (indexToScroll < 0 || indexToScroll >= finalNavigableLines.length) return;

                if (previouslyHighlightedLineElement) {
                    previouslyHighlightedLineElement.classList.remove('diff-navigation-highlight');
                }
                const lineElementToFocus = finalNavigableLines[indexToScroll];

                if (lineElementToFocus) {
                    // scrollIntoView 대신 컨테이너의 scrollTop을 조절하여 좀 더 부드럽게
                    const diffContainer = document.getElementById('diff-container');
                    if (diffContainer) {
                        const targetOffsetTop = lineElementToFocus.offsetTop;
                        // 컨테이너의 중앙 부근으로 스크롤
                        diffContainer.scrollTop = targetOffsetTop - (diffContainer.clientHeight / 2) + (lineElementToFocus.clientHeight / 2);
                    } else {
                        lineElementToFocus.scrollIntoView({ behavior: 'auto', block: 'center' });
                    }

                    lineElementToFocus.classList.add('diff-navigation-highlight');
                    previouslyHighlightedLineElement = lineElementToFocus;
                }
                currentChangeIndex = indexToScroll;
                updateButtonAndNavInfo();
            }

            if (finalNavigableLines.length > 0) {
                scrollToChange(0); // 첫번째 변경점으로 자동 스크롤
            } else {
                updateButtonAndNavInfo(); // 변경점 없을 때 버튼 상태 업데이트
            }

            if (nextBtn) {
                nextBtn.addEventListener('click', () => {
                    if (currentChangeIndex < finalNavigableLines.length - 1) {
                        scrollToChange(currentChangeIndex + 1);
                    }
                });
            }

            if (prevBtn) {
                prevBtn.addEventListener('click', () => {
                    if (currentChangeIndex > 0) {
                        scrollToChange(currentChangeIndex - 1);
                    }
                });
            }

            popup.addEventListener('keydown', (event) => {
                if (finalNavigableLines.length === 0) return;
                if (!nextBtn || !prevBtn) return;

                if (event.key === 'ArrowDown' || event.key === 'PageDown') {
                    event.preventDefault();
                    if (!nextBtn.disabled) nextBtn.click();
                } else if (event.key === 'ArrowUp' || event.key === 'PageUp') {
                    event.preventDefault();
                    if (!prevBtn.disabled) prevBtn.click();
                }
            });
            updateButtonAndNavInfo(); // 초기 버튼 상태 설정
        }
    });
}

function showCustomMessagePopup(options) {
    const {
        title = '알림',
        message,
        icon,
        buttons = []
    } = options;

    return showCustomPopup({
        title: title,
        html: message, // 메시지 자체에 HTML이 포함될 수 있으므로, 내부 스타일은 사용자가 직접 관리
        icon: icon,
        buttons: buttons
    });
}

function showCustomFormPopup(options) {
    const {
        title = '폼',
        formItems = [],
        buttons = []
    } = options;

    // formHtml 생성 시 인라인 스타일 대신 CSS 클래스 사용
    let formHtml = '<form id="custom-popup-form">'; // style 제거

    formItems.forEach(item => {
        const {
            id,
            type = 'text',
            label,
            value = '',
            placeholder = '',
            options: itemOptions = [], // 'options' 이름 충돌 방지
            required = false
        } = item;

        formHtml += `<div class="form-item">`; // style 제거

        if (label) {
            formHtml += `<label for="${id}">${label}</label>`; // style 제거
        }

        if (type === 'textarea') {
            formHtml += `<textarea id="${id}" name="${id}" placeholder="${placeholder}" 
                          ${required ? 'required' : ''}>${value}</textarea>`; // style 제거
        } else if (type === 'select') {
            formHtml += `<select id="${id}" name="${id}" ${required ? 'required' : ''}>`; // style 제거
            itemOptions.forEach(opt => { // 변수명 변경 option -> opt
                const isSelected = opt.value === value ? 'selected' : '';
                formHtml += `<option value="${opt.value}" ${isSelected}>${opt.label}</option>`;
            });
            formHtml += `</select>`;
        } else if (type === 'checkbox') {
            // checkbox와 label을 div로 묶어 스타일링 용이하게 (필요시)
            formHtml += `<div class="checkbox-group"> 
                          <input type="${type}" id="${id}" name="${id}" value="1" ${value ? 'checked' : ''} 
                                 ${required ? 'required' : ''}>
                          <label for="${id}">${placeholder || ''}</label> 
                         </div>`; // style 제거, placeholder를 label로 변경
        } else if (type === 'radio') {
            itemOptions.forEach(opt => { // 변수명 변경 option -> opt
                const isChecked = opt.value === value ? 'checked' : '';
                // 라디오 버튼과 라벨을 div로 묶어 스타일링 용이하게
                formHtml += `<div class="radio-group-item">
                              <input type="radio" id="${id}_${opt.value}" name="${id}" value="${opt.value}" ${isChecked} 
                                     ${required ? 'required' : ''}>
                              <label for="${id}_${opt.value}">${opt.label}</label>
                             </div>`; // style 제거
            });
        } else { // input type text, password 등
            formHtml += `<input type="${type}" id="${id}" name="${id}" value="${value}" placeholder="${placeholder}" 
                         ${required ? 'required' : ''}>`; // style 제거
        }
        formHtml += `</div>`;
    });
    formHtml += '</form>';

    return showCustomPopup({
        title: title,
        html: formHtml,
        buttons: buttons,
        preConfirm: () => {
            const form = document.getElementById('custom-popup-form');
            if (form && typeof form.checkValidity === 'function' && !form.checkValidity()) {
                Swal.showValidationMessage('모든 필수 항목을 올바르게 입력해주세요.');
                return false;
            }
            if (form) {
                const formData = new FormData(form);
                const result = {};
                formItems.forEach(item => {
                    if (item.type === 'checkbox') {
                        result[item.id] = formData.has(item.id);
                    } else if (formData.has(item.id)) {
                        result[item.id] = formData.get(item.id);
                    } else {
                        result[item.id] = undefined; // 누락된 필드 처리
                    }
                });
                return result;
            }
            return {};
        }
    });
}

function showCustomPopup(options) {
    const {
        title,
        html,
        icon,
        buttons = [],
        width = '32em', // 기본 너비
        padding = '1em', // 기본 패딩
        customClass = {},
        preConfirm,
        didOpen
    } = options;

    const swalOptions = {
        title: title,
        html: html,
        icon: icon,
        width: width,
        padding: padding,
        showConfirmButton: true,
        showCancelButton: false,
        customClass: customClass,
        preConfirm: preConfirm,
        didOpen: didOpen
    };

    const confirmButtonConfig = buttons.find(b => b.role === 'confirm' || (!b.role && buttons.indexOf(b) === 0));
    const cancelButtonConfig = buttons.find(b => b.role === 'cancel');

    if (confirmButtonConfig) {
        swalOptions.showConfirmButton = true;
        swalOptions.confirmButtonText = confirmButtonConfig.text || Swal.getConfirmButton().innerText;
        if (confirmButtonConfig.color) {
            swalOptions.confirmButtonColor = confirmButtonConfig.color;
        }
    } else if (buttons.length > 0 || preConfirm) {
        if (!buttons.some(b => b.role !== 'cancel') && !preConfirm) {
            swalOptions.showConfirmButton = false;
        }
    } else {
        swalOptions.showConfirmButton = false;
    }

    if (cancelButtonConfig) {
        swalOptions.showCancelButton = true;
        swalOptions.cancelButtonText = cancelButtonConfig.text || Swal.getCancelButton().innerText;
        if (cancelButtonConfig.color) {
            swalOptions.cancelButtonColor = cancelButtonConfig.color;
        }
    }

    if (typeof Swal === 'undefined') {
        console.error('Swal (SweetAlert2)이 import되지 않았습니다.');
        return Promise.reject('SweetAlert2 is not imported');
    }

    const swalPromise = Swal.fire(swalOptions);

    return swalPromise.then(result => {
        let callbackResult = { ...result, formData: {} }; // formData 추가
        if (result.isConfirmed && preConfirm) { // preConfirm 결과가 result.value로 전달됨
            callbackResult.formData = result.value || {};
        }
        // 버튼 액션 콜백
        if (result.isConfirmed && confirmButtonConfig && typeof confirmButtonConfig.action === 'function' && !preConfirm) {
            confirmButtonConfig.action();
        } else if (result.isDismissed && cancelButtonConfig && typeof cancelButtonConfig.action === 'function') {
            if (result.dismiss === Swal.DismissReason.cancel) { // 취소 버튼에 의한 dismiss일 때만 실행
                cancelButtonConfig.action();
            }
        }
        return callbackResult; // isConfirmed, isDismissed, formData 등을 포함한 결과 반환
    });
}