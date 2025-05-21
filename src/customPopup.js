import Swal from 'sweetalert2';
import * as Diff from 'diff'; // Diff는 JSON Diff 팝업에만 필요

export {
    showJsonDiffPopup,
    showTextInputPopup,
    showConfirmationPopup,
    showCustomFormPopup,
    showUrlProcessPopup,
    showTemplateSelectionPopup,
    showTemplateContentPopup,
    showTemplateManagementPopup
};

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// 기본 커스텀 팝업 함수: hotInstance 처리 및 일관된 결과 구조 반환
function showCustomPopup(options) {
    const { title, html, icon, buttons = [], width = '32em', padding = '1em', customClass = {}, preConfirm, didOpen, hotInstance } = options;

    if (hotInstance && typeof hotInstance.deselectCell === 'function') {
        hotInstance.deselectCell();
    }

    const swalOpts = {
        title, html, icon, width, padding,
        showConfirmButton: true,
        showCancelButton: false,
        customClass: {...customClass, popup: `popup-base ${customClass.popup || ''}` },
        preConfirm,
        didOpen
    };

    const confirmBtnCfg = buttons.find(b => b.role === 'confirm' || (!b.role && buttons.indexOf(b) === 0));
    const cancelBtnCfg = buttons.find(b => b.role === 'cancel');

    if (confirmBtnCfg) {
        swalOpts.showConfirmButton = true;
        swalOpts.confirmButtonText = confirmBtnCfg.text || Swal.getConfirmButton().innerText;
        if (confirmBtnCfg.color) swalOpts.confirmButtonColor = confirmBtnCfg.color;
    } else if (buttons.length > 0 || preConfirm) {
        if (!buttons.some(b => b.role !== 'cancel') && !preConfirm) {
            swalOpts.showConfirmButton = false;
        }
    } else {
        swalOpts.showConfirmButton = false;
    }

    if (cancelBtnCfg) {
        swalOpts.showCancelButton = true;
        swalOpts.cancelButtonText = cancelBtnCfg.text || Swal.getCancelButton().innerText;
        if (cancelBtnCfg.color) swalOpts.cancelButtonColor = cancelBtnCfg.color;
    }

    if (typeof Swal === 'undefined') {
        console.error('SweetAlert2 (Swal) is not loaded!');
        return Promise.reject('SweetAlert2 is not imported');
    }

    const swalPromise = Swal.fire(swalOpts);

    return swalPromise.then(result => {
        let cbResult = { ...result, formData: {} };
        if (result.isConfirmed && preConfirm) {
            cbResult.formData = result.value;
        }
        if (result.isConfirmed && confirmBtnCfg && typeof confirmBtnCfg.action === 'function' && !preConfirm) {
            confirmBtnCfg.action(cbResult);
        } else if (result.isDismissed && cancelBtnCfg && typeof cancelBtnCfg.action === 'function') {
            if (result.dismiss === Swal.DismissReason.cancel) {
                cancelBtnCfg.action(cbResult);
            }
        }
        return cbResult;
    });
}

// JSON Diff 팝업 (기존 로직 유지, 필요시 customClass 추가 가능)
function showJsonDiffPopup(options) {
    const { title = 'JSON Diff', jsonDiffData, buttons = [], hotInstance } = options;
    if (hotInstance && typeof hotInstance.deselectCell === 'function') hotInstance.deselectCell();

    let headerContent = '';
    let diffHtmlContent = '';
    let orderedChangeData = [];

    const stableStringify = (obj, space = 2) => {
        const preserveKeyOrderAndProcess = (currentObj) => {
            if (typeof currentObj !== 'object' || currentObj === null) return currentObj;
            if (Array.isArray(currentObj)) return currentObj.map(preserveKeyOrderAndProcess);
            const processedObj = {};
            Object.keys(currentObj).forEach(key => { processedObj[key] = preserveKeyOrderAndProcess(currentObj[key]); });
            return processedObj;
        };
        try { return JSON.stringify(preserveKeyOrderAndProcess(obj), null, space); }
        catch (e) { return JSON.stringify(obj, null, space); }
    };

    if (jsonDiffData && jsonDiffData.left !== undefined && jsonDiffData.right !== undefined) {
        if (typeof Diff === 'undefined' || typeof Diff.diffLines !== 'function') {
            diffHtmlContent = `<p class="diff-popup-error-message">Diff 라이브러리를 로드할 수 없습니다.</p>`;
            headerContent = `<div class="diff-popup-header diff-error">라이브러리 오류</div>`;
        } else {
            try {
                const stringLeft = stableStringify(jsonDiffData.left);
                const stringRight = stableStringify(jsonDiffData.right);
                const diffParts = Diff.diffLines(stringLeft, stringRight);
                let totalAdded = 0, totalRemoved = 0;
                diffParts.forEach(part => {
                    const pv = part.value || '', la = pv.split('\n');
                    let nl = la.length; if (la[la.length - 1] === '' && pv.length > 0) nl--; if (pv === '') nl = 0;
                    if (part.added) totalAdded += nl; else if (part.removed) totalRemoved += nl;
                });

                const enrichedChangeBlocks = []; let currentOldLine = 1, currentNewLine = 1;
                diffParts.forEach((part, index) => {
                    const pv = part.value || '', la = pv.split('\n');
                    let nl = la.length; if (la[la.length - 1] === '' && pv.length > 0) nl--; if (pv === '') nl = 0;
                    if (part.removed) { enrichedChangeBlocks.push({ originalPartIndex: index, part, sourceType: 'del', lineNumber: currentOldLine, numLines: nl }); currentOldLine += nl; }
                    else if (part.added) { enrichedChangeBlocks.push({ originalPartIndex: index, part, sourceType: 'ins', lineNumber: currentNewLine, numLines: nl }); currentNewLine += nl; }
                    else { currentOldLine += nl; currentNewLine += nl; }
                });
                orderedChangeData = []; let availablePoints = [...enrichedChangeBlocks]; let lastAddedPointDetails = null;
                if (availablePoints.length > 0) {
                    availablePoints.sort((a,b) => { if (a.lineNumber !== b.lineNumber) return a.lineNumber - b.lineNumber; if (a.sourceType === 'del' && b.sourceType !== 'del') return -1; if (a.sourceType !== 'del' && b.sourceType === 'del') return 1; return a.originalPartIndex - b.originalPartIndex; });
                    lastAddedPointDetails = availablePoints[0]; orderedChangeData.push(lastAddedPointDetails); availablePoints = availablePoints.filter(p => p.originalPartIndex !== lastAddedPointDetails.originalPartIndex);
                }
                while (availablePoints.length > 0 && lastAddedPointDetails) {
                    const currentRefLineNumber = lastAddedPointDetails.lineNumber; let bestCandidate = null; let pass1Candidates = [];
                    for (const cand of availablePoints) if (cand.lineNumber >= currentRefLineNumber) pass1Candidates.push({ ...cand, diff: cand.lineNumber - currentRefLineNumber });
                    if (pass1Candidates.length > 0) { pass1Candidates.sort((a,b) => { if (a.diff !== b.diff) return a.diff - b.diff; if (a.sourceType === 'del' && b.sourceType !== 'del') return -1; if (a.sourceType !== 'del' && b.sourceType === 'del') return 1; return a.originalPartIndex - b.originalPartIndex; }); bestCandidate = pass1Candidates[0]; }
                    else { let pass2Candidates = []; for (const cand of availablePoints) pass2Candidates.push({ ...cand, absDiff: Math.abs(cand.lineNumber - currentRefLineNumber) });
                        if (pass2Candidates.length > 0) { pass2Candidates.sort((a,b) => { if (a.absDiff !== b.absDiff) return a.absDiff - b.absDiff; if (a.lineNumber !== b.lineNumber) return a.lineNumber - b.lineNumber; if (a.sourceType === 'del' && b.sourceType !== 'del') return -1; if (a.sourceType !== 'del' && b.sourceType === 'del') return 1; return a.originalPartIndex - b.originalPartIndex; }); bestCandidate = pass2Candidates[0]; }
                    }
                    if (bestCandidate) { orderedChangeData.push(bestCandidate); lastAddedPointDetails = bestCandidate; availablePoints = availablePoints.filter(p => p.originalPartIndex !== bestCandidate.originalPartIndex); } else break;
                }

                let leftPaneHtml = '', rightPaneHtml = ''; let currentLeftLineNumRender = 1, currentRightLineNumRender = 1;
                const orderedNavMap = new Map(); orderedChangeData.forEach((data, navIndex) => orderedNavMap.set(data.originalPartIndex, navIndex));
                diffParts.forEach((part, partIndex) => {
                    const partValue = part.value || ''; const lines = partValue.replace(/\n$/, '').split('\n');
                    if (!(lines.length === 1 && lines[0] === '' && partValue === '')) {
                        lines.forEach((line, lineIndexInPart) => {
                            let lineId = ''; if ((part.added || part.removed) && lineIndexInPart === 0 && orderedNavMap.has(partIndex)) lineId = `id="diff-nav-target-${orderedNavMap.get(partIndex)}"`;
                            if (part.added) { leftPaneHtml += `<div class="diff-sbs-line"><span class="diff-sbs-line-num"></span><span class="diff-sbs-line-content"></span></div>\n`; rightPaneHtml += `<div ${lineId} class="diff-sbs-line diff-added"><span class="diff-sbs-line-num">${currentRightLineNumRender++}</span><span class="diff-sbs-line-content">${escapeHtml(line)}</span></div>\n`; }
                            else if (part.removed) { leftPaneHtml += `<div ${lineId} class="diff-sbs-line diff-removed"><span class="diff-sbs-line-num">${currentLeftLineNumRender++}</span><span class="diff-sbs-line-content">${escapeHtml(line)}</span></div>\n`; rightPaneHtml += `<div class="diff-sbs-line"><span class="diff-sbs-line-num"></span><span class="diff-sbs-line-content"></span></div>\n`; }
                            else { leftPaneHtml += `<div class="diff-sbs-line diff-common"><span class="diff-sbs-line-num">${currentLeftLineNumRender++}</span><span class="diff-sbs-line-content">${escapeHtml(line)}</span></div>\n`; rightPaneHtml += `<div class="diff-sbs-line diff-common"><span class="diff-sbs-line-num">${currentRightLineNumRender++}</span><span class="diff-sbs-line-content">${escapeHtml(line)}</span></div>\n`; }
                        });
                    }
                });
                diffHtmlContent = `<div class="diff-sbs-container"><div class="diff-sbs-pane" id="diff-left-pane">${leftPaneHtml}</div><div class="diff-sbs-pane" id="diff-right-pane">${rightPaneHtml}</div></div>`;
                if (orderedChangeData.length > 0 || totalAdded > 0 || totalRemoved > 0) {
                    let summaryHtml = '';
                    if (totalAdded > 0 || totalRemoved > 0) {
                        summaryHtml = `<span class="diff-summary"><strong class="diff-summary-added">+${totalAdded}</strong> <strong class="diff-summary-removed">-${totalRemoved}</strong></span>`;
                    }
                    headerContent = `<div class="diff-popup-header">JSON 비교 결과</div><div id="diff-navigation" class="diff-navigation-controls">${summaryHtml}<button id="prev-change-btn" class="swal2-styled">이전 변경점</button><button id="next-change-btn" class="swal2-styled">다음 변경점</button><span id="current-change-info" class="diff-current-change-info"></span></div>`;
                } else {
                    headerContent = `<div class="diff-popup-header">JSON 비교 결과</div>`;
                    if (stringLeft === stringRight) diffHtmlContent = '<p class="diff-no-changes-message">내용이 동일합니다. 변경 사항이 없습니다.</p>';
                    else diffHtmlContent = '<p class="diff-no-changes-message">변경 사항이 감지되지 않았지만 원본 문자열은 다릅니다.</p>';
                }
            } catch (e) {
                diffHtmlContent = `<p class="diff-popup-error-message">JSON diff 표시에 오류 발생: ${e.message}</p>`;
                headerContent = `<div class="diff-popup-header diff-error">오류 발생</div>`;
            }
        }
    } else {
        diffHtmlContent = '<p class="diff-no-data">Diff를 표시할 JSON 데이터가 제공되지 않았습니다.</p>';
        headerContent = `<div class="diff-popup-header diff-error">데이터 오류</div>`;
    }
    const finalHtml = `${headerContent}<div id="diff-container" class="diff-main-container">${diffHtmlContent}</div>`;
    return showCustomPopup({
        title, html: finalHtml, buttons, width: '95%',
        customClass: { popup: `popup-diff-view ${customClass.popup || ''}`, htmlContainer: 'custom-swal-html-container-text-diff' }, // diff 팝업용 클래스
        didOpen: (popup) => { /* ... 이전과 동일 ... */
            const finalNavigableLines = []; if (orderedChangeData && orderedChangeData.length > 0) for (let i = 0; i < orderedChangeData.length; i++) { const el = document.getElementById(`diff-nav-target-${i}`); if (el) finalNavigableLines.push(el); }
            let currentChangeIndex = -1; let previouslyHighlightedLineElement = null;
            const navContainer = document.getElementById('diff-navigation'); const nextBtn = document.getElementById('next-change-btn'); const prevBtn = document.getElementById('prev-change-btn'); const changeInfo = document.getElementById('current-change-info');
            function updateButtonAndNavInfo() { if (!navContainer) return; const noChanges = finalNavigableLines.length === 0; if (nextBtn) nextBtn.style.display = noChanges ? 'none' : 'inline-block'; if (prevBtn) prevBtn.style.display = noChanges ? 'none' : 'inline-block'; if (changeInfo) changeInfo.textContent = noChanges ? ((totalAdded > 0 || totalRemoved > 0) ? `0 / 0` : '변경점 없음') : `${currentChangeIndex + 1} / ${finalNavigableLines.length}`; if (nextBtn) nextBtn.disabled = currentChangeIndex >= finalNavigableLines.length - 1; if (prevBtn) prevBtn.disabled = currentChangeIndex <= 0; }
            function scrollToChange(indexToScroll) { if (indexToScroll < 0 || indexToScroll >= finalNavigableLines.length) return; if (previouslyHighlightedLineElement) previouslyHighlightedLineElement.classList.remove('diff-navigation-highlight'); const lineEl = finalNavigableLines[indexToScroll]; if (lineEl) { const diffCont = document.getElementById('diff-container'); if (diffCont) { const targetOffsetTop = lineEl.offsetTop; diffCont.scrollTop = targetOffsetTop - (diffCont.clientHeight / 2) + (lineEl.clientHeight / 2); } else lineEl.scrollIntoView({ block: 'center' }); lineEl.classList.add('diff-navigation-highlight'); previouslyHighlightedLineElement = lineEl; } currentChangeIndex = indexToScroll; updateButtonAndNavInfo(); }
            if (finalNavigableLines.length > 0) scrollToChange(0); else updateButtonAndNavInfo();
            if (nextBtn) nextBtn.addEventListener('click', () => { if (currentChangeIndex < finalNavigableLines.length - 1) scrollToChange(currentChangeIndex + 1); });
            if (prevBtn) prevBtn.addEventListener('click', () => { if (currentChangeIndex > 0) scrollToChange(currentChangeIndex - 1); });
            popup.addEventListener('keydown', (event) => { if (finalNavigableLines.length === 0 || !nextBtn || !prevBtn) return; if (event.key === 'ArrowDown' || event.key === 'PageDown') { event.preventDefault(); if (!nextBtn.disabled) nextBtn.click(); } else if (event.key === 'ArrowUp' || event.key === 'PageUp') { event.preventDefault(); if (!prevBtn.disabled) prevBtn.click(); } });
            updateButtonAndNavInfo();
        }
    });
}

async function showTextInputPopup(options) {
    const { title, inputLabel, inputValue = '', inputPlaceholder = '', inputValidator, confirmButtonText = '확인', cancelButtonText = '취소', showCancelButton = true, customClass = {}, html, hotInstance } = options;
    if (hotInstance && typeof hotInstance.deselectCell === 'function') hotInstance.deselectCell();
    let finalHtml = html || '';
    if (inputLabel && !html) {
        finalHtml = `<label class="swal-input-label">${inputLabel}</label>${finalHtml}`;
    }
    return Swal.fire({
        title, html: finalHtml, input: 'text', inputValue, inputPlaceholder, inputValidator, showCancelButton, confirmButtonText, cancelButtonText,
        customClass: {...customClass, popup: `swal-text-input-popup ${customClass.popup || ''}` },
        didOpen: () => { const input = Swal.getInput(); if (input) { input.focus(); if (typeof input.select === 'function') input.select(); } }
    });
}

async function showConfirmationPopup(options) {
    const { title, text = '', html = '', icon = 'warning', confirmButtonText = '확인', cancelButtonText = '취소', showCancelButton = true, customClass = {}, hotInstance } = options;
    if (hotInstance && typeof hotInstance.deselectCell === 'function') hotInstance.deselectCell();
    return Swal.fire({ title, text, html, icon, showCancelButton, confirmButtonText, cancelButtonText, customClass: {...customClass, popup: `swal-confirmation-popup ${customClass.popup || ''}`} });
}

function showCustomFormPopup(options) {
    const { title = '폼', formItems = [], buttons = [], hotInstance } = options;
    if (hotInstance && typeof hotInstance.deselectCell === 'function') hotInstance.deselectCell();

    let formHtml = '<form id="custom-popup-form" class="swal-custom-form">';
    formItems.forEach(item => {
        const { id, type = 'text', label, value = '', placeholder = '', options: itemOpts = [], required = false } = item;
        formHtml += `<div class="swal-form-item">`;
        if (label) formHtml += `<label for="${id}" class="swal-form-label">${label}</label>`;
        if (type === 'textarea') {
            formHtml += `<textarea id="${id}" name="${id}" class="swal2-textarea swal-form-textarea" placeholder="${placeholder}" ${required ? 'required' : ''}>${value}</textarea>`;
        } else if (type === 'select') {
            formHtml += `<select id="${id}" name="${id}" class="swal2-select swal-form-select" ${required ? 'required' : ''}>`;
            itemOpts.forEach(opt => {
                const sel = opt.value === value ? 'selected' : '';
                formHtml += `<option value="${escapeHtml(String(opt.value))}" ${sel}>${escapeHtml(opt.label)}</option>`;
            });
            formHtml += `</select>`;
        } else if (type === 'checkbox') {
            formHtml += `<div class="swal-form-checkbox-group">
                           <input type="${type}" id="${id}" name="${id}" value="1" class="swal-form-checkbox" ${value ? 'checked' : ''} ${required ? 'required' : ''}>
                           <label for="${id}" class="swal-form-checkbox-label">${placeholder || ''}</label>
                         </div>`;
        } else if (type === 'radio') {
            itemOpts.forEach(opt => {
                const chk = opt.value === value ? 'checked' : '';
                formHtml += `<div class="swal-form-radio-group-item">
                               <input type="radio" id="${id}_${escapeHtml(String(opt.value))}" name="${id}" value="${escapeHtml(String(opt.value))}" class="swal-form-radio" ${chk} ${required ? 'required' : ''}>
                               <label for="${id}_${escapeHtml(String(opt.value))}" class="swal-form-radio-label">${escapeHtml(opt.label)}</label>
                             </div>`;
            });
        } else {
            formHtml += `<input type="${type}" id="${id}" name="${id}" value="${escapeHtml(String(value))}" class="swal2-input swal-form-input" placeholder="${placeholder}" ${required ? 'required' : ''}>`;
        }
        formHtml += `</div>`;
    });
    formHtml += '</form>';

    return showCustomPopup({
        title, html: formHtml, buttons,
        customClass: { popup: `swal-custom-form-popup ${options.customClass?.popup || ''}` },
        preConfirm: () => { /* ... 이전과 동일 ... */
            const form = document.getElementById('custom-popup-form');
            if (form && typeof form.checkValidity === 'function' && !form.checkValidity()) {
                Swal.showValidationMessage('모든 필수 항목을 올바르게 입력해주세요.');
                return false;
            }
            if (form) {
                const fd = new FormData(form);
                const res = {};
                formItems.forEach(item => {
                    if (item.type === 'checkbox') res[item.id] = fd.has(item.id);
                    else if (fd.has(item.id)) res[item.id] = fd.get(item.id);
                    else res[item.id] = undefined;
                });
                return res;
            }
            return {};
        },
        didOpen: (popup) => { /* ... 이전과 동일 ... */
            const form = popup.querySelector('#custom-popup-form');
            if (form) {
                const firstEl = form.querySelector('input:not([type="hidden"]), textarea, select');
                if (firstEl) firstEl.focus();
            }
        }
    });
}

async function showUrlProcessPopup(options) {
    const {
        title = 'URL 작업', initialInputValue = '', inputLabel = '입력:', outputLabel = '결과:',
        actionButtonText = '실행', confirmButtonText = '결과를 메인 편집기에 복사', cancelButtonText = '팝업 닫기',
        onExecuteAction, hotInstance
    } = options;

    if (hotInstance && typeof hotInstance.deselectCell === 'function') hotInstance.deselectCell();

    const uniqueSuffix = Date.now();
    const inputAreaId = `popup-url-input-${uniqueSuffix}`;
    const outputAreaId = `popup-url-output-${uniqueSuffix}`;
    const executeBtnId = `popup-execute-action-${uniqueSuffix}`;
    const validationMsgId = `popup-url-validation-${uniqueSuffix}`;

    const popupHtml = `
        <div class="popup-url-process-container">
            <div class="popup-form-group">
                <label for="${inputAreaId}" class="popup-label">${inputLabel}</label>
                <textarea id="${inputAreaId}" class="swal2-textarea popup-textarea" placeholder="여기에 문자열을 입력하세요...">${initialInputValue}</textarea>
            </div>
            <div class="popup-action-button-container">
                <button type="button" id="${executeBtnId}" class="swal2-styled popup-execute-button">${actionButtonText}</button>
            </div>
            <div class="popup-form-group">
                <label for="${outputAreaId}" class="popup-label">${outputLabel}</label>
                <textarea id="${outputAreaId}" class="swal2-textarea popup-textarea" readonly placeholder="결과가 여기에 표시됩니다..."></textarea>
            </div>
            <div id="${validationMsgId}" class="popup-validation-message"></div>
        </div>`;

    return showCustomPopup({
        title: title, html: popupHtml,
        width: '50em', padding: '1.5em',
        customClass: { popup: `popup-url-process popup-basic-white-theme ${options.customClass?.popup || ''}`, htmlContainer: 'popup-html-container-spacing' },
        buttons: [ { text: confirmButtonText, role: 'confirm' }, { text: cancelButtonText, role: 'cancel' } ],
        didOpen: (popupElement) => { /* ... 이전과 동일 (ID 변경 적용) ... */
            const inputArea = popupElement.querySelector(`#${inputAreaId}`);
            const outputArea = popupElement.querySelector(`#${outputAreaId}`);
            const executeBtn = popupElement.querySelector(`#${executeBtnId}`);
            const validationMsgArea = popupElement.querySelector(`#${validationMsgId}`);

            if (inputArea) inputArea.focus();
            if (executeBtn && inputArea && outputArea && validationMsgArea) {
                executeBtn.addEventListener('click', () => {
                    const inputValue = inputArea.value;
                    validationMsgArea.textContent = '';
                    if (inputValue.trim() === '') {
                        outputArea.value = '';
                        validationMsgArea.textContent = '입력값이 비어있습니다.';
                        return;
                    }
                    if (typeof onExecuteAction === 'function') {
                        try {
                            const resultValue = onExecuteAction(inputValue);
                            outputArea.value = resultValue;
                            if (resultValue.startsWith('오류:')) { // 콜백이 오류 문자열 반환 시
                                validationMsgArea.textContent = resultValue;
                            }
                        } catch (e) { // 콜백 자체가 예외를 던진 경우
                            const errorMessage = `실행 중 예외: ${e.message}`;
                            outputArea.value = errorMessage;
                            validationMsgArea.textContent = errorMessage;
                        }
                    } else {
                        const errMsg = "오류: 실행할 작업(onExecuteAction)이 정의되지 않았습니다.";
                        outputArea.value = errMsg;
                        validationMsgArea.textContent = errMsg;
                    }
                });
            }
        },
        preConfirm: () => { /* ... 이전과 동일 (ID 변경 적용) ... */
            const outputArea = document.getElementById(outputAreaId);
            const validationMsgArea = document.getElementById(validationMsgId);
            if (validationMsgArea) validationMsgArea.textContent = '';

            if (outputArea && outputArea.value.trim() !== '') {
                if (outputArea.value.startsWith('오류:') || outputArea.value.startsWith('실행 중 예외:')) {
                    if (validationMsgArea) validationMsgArea.textContent = "오류가 있는 결과는 복사할 수 없습니다.";
                    return false;
                }
                return outputArea.value;
            } else {
                if (validationMsgArea) validationMsgArea.textContent = "메인 편집기에 복사할 결과가 없습니다.";
                return false;
            }
        },
        hotInstance: hotInstance
    });
}

async function showTemplateSelectionPopup(options) {
    const {
        title = '템플릿 선택', templates = [], message = '', confirmButtonText = '확인', cancelButtonText = '취소',
        hotInstance, existingUserTemplateNames = []
    } = options;

    if (hotInstance && typeof hotInstance.deselectCell === 'function') hotInstance.deselectCell();

    if (templates.length === 0) {
        await showConfirmationPopup({ title: title, text: '선택할 템플릿이 없습니다.', icon: 'info', showCancelButton: false, confirmButtonText: '닫기', hotInstance });
        return { isConfirmed: false, selectedTemplates: [] };
    }

    const formItemsConfig = templates.map((template, index) => {
        const isOverwrite = !template.isDefault && existingUserTemplateNames.includes(template.name);
        const overwriteIndicator = isOverwrite ? ` <span class="popup-template-overwrite-indicator">(덮어씀)</span>` : "";
        return {
            id: `template_checkbox_${index}_${Date.now()}`,
            label: `${escapeHtml(template.name)} <span class="popup-template-type-indicator">(${escapeHtml(template.type)})</span>${template.isDefault ? ` <span class="popup-template-default-indicator">[기본]</span>` : ""}${overwriteIndicator}`,
            initialChecked: true, originalTemplate: template
        };
    });

    let formHtml = `<form id="popup-template-selection-form" class="popup-template-selection-container">`;
    if (message) {
        formHtml += `<p class="popup-message">${message}</p>`;
    }
    formItemsConfig.forEach(item => {
        formHtml += `<div class="popup-template-item">
                        <input type="checkbox" id="${item.id}" name="${item.id}" value="true" ${item.initialChecked ? 'checked' : ''} class="popup-checkbox">
                        <label for="${item.id}" class="popup-label-checkbox">${item.label}</label>
                     </div>`;
    });
    formHtml += '</form>';

    const popupResult = await showCustomPopup({
        title: title, html: formHtml,
        buttons: [ { text: confirmButtonText, role: 'confirm' }, { text: cancelButtonText, role: 'cancel' } ],
        width: '45em', padding: '1.5em',
        customClass: { popup: 'popup-template-selection popup-basic-white-theme' },
        preConfirm: () => {
            const form = document.getElementById('popup-template-selection-form');
            const selectedTemplates = [];
            if (form) { formItemsConfig.forEach(itemConf => { const cb = form.querySelector(`#${itemConf.id}`); if (cb && cb.checked) selectedTemplates.push(itemConf.originalTemplate); }); }
            return selectedTemplates;
        },
        didOpen: (popupEl) => { /* Optional: focus first checkbox */ },
        hotInstance: hotInstance
    });
    return { isConfirmed: popupResult.isConfirmed, selectedTemplates: (popupResult.isConfirmed && Array.isArray(popupResult.formData)) ? popupResult.formData : [] };
}

async function showTemplateContentPopup(options) {
    const { title = '템플릿 내용', templateName, templateValue, hotInstance } = options;
    if (hotInstance && typeof hotInstance.deselectCell === 'function') hotInstance.deselectCell();

    let contentHtml;
    try {
        const prettyJson = JSON.stringify(templateValue, null, 2);
        contentHtml = `<pre class="popup-template-content-pre">${escapeHtml(prettyJson)}</pre>`;
    } catch (e) {
        contentHtml = `<p class="popup-error-message">템플릿 내용을 표시 중 오류: ${escapeHtml(e.message)}</p>`;
    }

    return showConfirmationPopup({ // This uses a more generic Swal, might need its own white theme override if not desired
        title: `${escapeHtml(templateName)} - 내용`, html: contentHtml, icon: null,
        showCancelButton: false, confirmButtonText: '닫기',
        customClass: { popup: 'popup-template-content popup-basic-white-theme', htmlContainer: 'popup-html-container-spacing' },
        width: '50em', hotInstance
    });
}

async function showTemplateManagementPopup(options) {
    const {
        title = '템플릿 관리', userTemplates = [], callbacks = {}, hotInstance
    } = options;

    if (hotInstance && typeof hotInstance.deselectCell === 'function') hotInstance.deselectCell();

    const generateHtmlForTemplateList = (templates) => {
        if (templates.length === 0) {
            return '<p class="popup-empty-message">관리할 사용자 정의 템플릿이 없습니다.</p>';
        }
        let listHtml = `<div class="popup-template-management-list-container">
                        <ul class="popup-list">`;
        templates.forEach((template) => {
            const tNameEsc = escapeHtml(template.name);
            const tTypeEsc = escapeHtml(template.type);
            listHtml += `
                <li class="popup-list-item tm-list-item-hoverable">
                    <span class="popup-list-item-name" title="${tNameEsc} (${tTypeEsc})">
                        ${tNameEsc} <span class="popup-list-item-type">(${tTypeEsc})</span>
                    </span>
                    <span class="popup-list-item-actions">
                        <button type="button" class="swal2-styled swal2-styled-small tm-view-btn" data-template-name="${tNameEsc}" title="내용 보기">내용 확인</button>
                        <button type="button" class="swal2-styled swal2-styled-small tm-rename-btn" data-template-name="${tNameEsc}" title="이름 변경">이름 변경</button>
                        <button type="button" class="swal2-styled swal2-styled-small tm-delete-btn" data-template-name="${tNameEsc}" title="삭제">삭제</button>
                    </span>
                </li>`;
        });
        listHtml += `</ul></div>`;
        return listHtml;
    };

    return showCustomPopup({
        title: title, html: generateHtmlForTemplateList(userTemplates),
        width: '60em', padding: '1.5em',
        customClass: { popup: 'popup-template-management popup-basic-white-theme', htmlContainer: 'popup-html-container-spacing' },
        buttons: [{ text: '닫기', role: 'cancel' }],
        didOpen: (popupElement) => {
            popupElement.addEventListener('click', (event) => {
                const target = event.target.closest('button[data-template-name]');
                if (!target) return;
                const templateName = target.dataset.templateName;
                if (!templateName) return;

                if (target.classList.contains('tm-view-btn')) { if (callbacks.onViewRequest) callbacks.onViewRequest(templateName); }
                else if (target.classList.contains('tm-rename-btn')) { if (callbacks.onRenameRequest) callbacks.onRenameRequest(templateName); }
                else if (target.classList.contains('tm-delete-btn')) { if (callbacks.onDeleteRequest) callbacks.onDeleteRequest(templateName); }
            });
        },
        hotInstance: hotInstance
    });
}