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
    let orderedChangeData = [];

    const stableStringify = (obj, space = 2) => {
        const sortObject = (unsortedObj) => {
            if (typeof unsortedObj !== 'object' || unsortedObj === null) {
                return unsortedObj;
            }
            if (Array.isArray(unsortedObj)) {
                return unsortedObj.map(sortObject);
            }
            const sortedObj = {};
            Object.keys(unsortedObj).sort((a, b) => a.localeCompare(b)).forEach(key => {
                sortedObj[key] = sortObject(unsortedObj[key]);
            });
            return sortedObj;
        };
        try {
            return JSON.stringify(sortObject(obj), null, space);
        } catch (e) {
            console.error("Error stringifying object with sorted keys:", e);
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
        if (typeof Diff.diffLines !== 'function') {
            console.error('Diff 라이브러리(jsdiff)가 제대로 import되지 않았습니다.');
            diffHtmlContent = '<p class="diff-popup-error-message">Diff 라이브러리 import 오류.</p>';
        } else {
            try {
                const stringLeft = stableStringify(jsonDiffData.left);
                const stringRight = stableStringify(jsonDiffData.right);

                const diffParts = Diff.diffLines(stringLeft, stringRight);

                let totalAdded = 0;
                let totalRemoved = 0;
                diffParts.forEach(part => {
                    const partValue = part.value || '';
                    const numLines = part.count || partValue.split('\n').length - (partValue.endsWith('\n') && partValue.length > 1 ? 1 : 0);
                    if (part.added) {
                        totalAdded += numLines;
                    } else if (part.removed) {
                        totalRemoved += numLines;
                    }
                });

                const enrichedChangeBlocks = [];
                let currentOldLine = 1;
                let currentNewLine = 1;
                diffParts.forEach((part, index) => {
                    const partValue = part.value || '';
                    const numLines = part.count || partValue.split('\n').length - (partValue.endsWith('\n') && partValue.length > 1 ? 1 : 0) ;

                    if (part.removed) {
                        enrichedChangeBlocks.push({ originalPartIndex: index, part, sourceType: 'del', lineNumber: currentOldLine, numLines });
                        currentOldLine += numLines;
                    } else if (part.added) {
                        enrichedChangeBlocks.push({ originalPartIndex: index, part, sourceType: 'ins', lineNumber: currentNewLine, numLines });
                        currentNewLine += numLines;
                    } else {
                        currentOldLine += numLines;
                        currentNewLine += numLines;
                    }
                });

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
                    const lines = partValue.replace(/\n$/, '').split('\n');
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
                        } else {
                            leftPaneHtml += `<div class="diff-sbs-line diff-common"><span class="diff-sbs-line-num">${currentLeftLineNumRender++}</span><span class="diff-sbs-line-content">${escapeHtml(line)}</span></div>\n`;
                            rightPaneHtml += `<div class="diff-sbs-line diff-common"><span class="diff-sbs-line-num">${currentRightLineNumRender++}</span><span class="diff-sbs-line-content">${escapeHtml(line)}</span></div>\n`;
                        }
                    });
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
                    }
                }

            } catch (e) {
                console.error("JSON diff 생성 또는 HTML 렌더링 중 오류:", e);
                diffHtmlContent = `<p class="diff-popup-error-message">JSON diff 표시에 오류 발생: ${e.message}</p>`;
                headerContent = `<div class="diff-popup-header error">오류 발생</div>`;
            }
        }
    } else {
        diffHtmlContent = '<p class="diff-no-data">Diff를 표시할 JSON 데이터가 제공되지 않았습니다.</p>'; // diff-no-data 클래스 추가
        headerContent = `<div class="diff-popup-header error">데이터 오류</div>`; // error 클래스 추가
    }

    const finalHtml = `
        ${headerContent}
        <div id="diff-container">
            ${diffHtmlContent}
        </div>`;

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
                    // navContainer.style.display = 'none'; // CSS에서 처리하거나 필요시 유지
                    if (nextBtn) nextBtn.disabled = true;
                    if (prevBtn) prevBtn.disabled = true;
                    if (changeInfo) changeInfo.textContent = (totalAdded > 0 || totalRemoved > 0) ? `0 / 0` : '변경점 없음';
                } else {
                    navContainer.style.display = 'flex'; // CSS에서 #diff-navigation 에 flex가 이미 적용됨
                }

                if (changeInfo) {
                    if (currentChangeIndex >= 0 && currentChangeIndex < finalNavigableLines.length) {
                        changeInfo.textContent = `${currentChangeIndex + 1} / ${finalNavigableLines.length}`;
                    } else if (finalNavigableLines.length > 0) {
                        changeInfo.textContent = `1 / ${finalNavigableLines.length}`;
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
                    lineElementToFocus.scrollIntoView({ behavior: 'auto', block: 'center' });
                    lineElementToFocus.classList.add('diff-navigation-highlight');
                    previouslyHighlightedLineElement = lineElementToFocus;
                }
                currentChangeIndex = indexToScroll;
                updateButtonAndNavInfo();
            }

            if (finalNavigableLines.length > 0) {
                scrollToChange(0);
            } else {
                updateButtonAndNavInfo();
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

                if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    if (!nextBtn.disabled) nextBtn.click();
                } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    if (!prevBtn.disabled) prevBtn.click();
                }
            });
            updateButtonAndNavInfo();
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