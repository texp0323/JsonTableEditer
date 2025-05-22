import Swal from 'sweetalert2';
import * as Diff from 'diff';

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

function showCustomPopup(options) {
    const { title, html, icon, buttons = [], width = '32em', padding = '1em', customClass = {}, preConfirm, didOpen, hotInstance } = options;

    if (hotInstance && typeof hotInstance.deselectCell === 'function') {
        hotInstance.deselectCell();
    }

    const swalOpts = {
        title, html, icon, width, padding,
        showConfirmButton: true,
        showCancelButton: false,
        customClass: {...customClass, popup: `popup-base ${customClass.popup || ''}`.trim() },
        preConfirm,
        didOpen
    };

    const confirmBtnCfg = buttons.find(b => b.role === 'confirm' || (!b.role && buttons.indexOf(b) === 0));
    const cancelBtnCfg = buttons.find(b => b.role === 'cancel');

    if (confirmBtnCfg) {
        swalOpts.confirmButtonText = confirmBtnCfg.text || Swal.getConfirmButton().innerText;
        if (confirmBtnCfg.color) swalOpts.confirmButtonColor = confirmBtnCfg.color;
    } else if (!preConfirm && buttons.every(b => b.role === 'cancel')) {
        swalOpts.showConfirmButton = false;
    } else if (buttons.length === 0 && !preConfirm) {
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

    return Swal.fire(swalOpts).then(result => {
        const cbResult = { ...result, formData: result.value && typeof result.value === 'object' ? result.value : {} };
        if (result.isConfirmed && preConfirm) {
            cbResult.formData = result.value;
        }

        if (result.isConfirmed && confirmBtnCfg && typeof confirmBtnCfg.action === 'function' && !preConfirm) {
            confirmBtnCfg.action(cbResult);
        } else if (result.isDismissed && cancelBtnCfg && typeof cancelBtnCfg.action === 'function' && result.dismiss === Swal.DismissReason.cancel) {
            cancelBtnCfg.action(cbResult);
        }
        return cbResult;
    });
}

function showJsonDiffPopup(options) {
    const {
        title = 'JSON Diff',
        jsonDiffData,
        buttons = [],
        hotInstance,
        customClass: incomingCustomClass = {}
    } = options;

    if (hotInstance && typeof hotInstance.deselectCell === 'function') {
        hotInstance.deselectCell();
    }

    let headerContent = '';
    let diffHtmlContent = '';
    let orderedChangeData = [];
    let totalAdded = 0, totalRemoved = 0;


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

                diffParts.forEach(part => {
                    const pv = part.value || '';
                    const la = pv.split('\n');
                    let nl = la.length;
                    if (la[la.length - 1] === '' && pv.length > 0) nl--;
                    if (pv === '') nl = 0;
                    if (part.added) totalAdded += nl;
                    else if (part.removed) totalRemoved += nl;
                });

                const enrichedChangeBlocks = [];
                let currentOldLine = 1, currentNewLine = 1;
                diffParts.forEach((part, index) => {
                    const pv = part.value || '';
                    const la = pv.split('\n');
                    let nl = la.length;
                    if (la[la.length - 1] === '' && pv.length > 0) nl--;
                    if (pv === '') nl = 0;
                    if (part.removed) { enrichedChangeBlocks.push({ originalPartIndex: index, part, sourceType: 'del', lineNumber: currentOldLine, numLines: nl }); currentOldLine += nl; }
                    else if (part.added) { enrichedChangeBlocks.push({ originalPartIndex: index, part, sourceType: 'ins', lineNumber: currentNewLine, numLines: nl }); currentNewLine += nl; }
                    else { currentOldLine += nl; currentNewLine += nl; }
                });

                orderedChangeData = [];
                let availablePoints = [...enrichedChangeBlocks];
                if (availablePoints.length > 0) {
                    availablePoints.sort((a,b) => { if (a.lineNumber !== b.lineNumber) return a.lineNumber - b.lineNumber; if (a.sourceType === 'del' && b.sourceType !== 'del') return -1; if (a.sourceType !== 'del' && b.sourceType === 'del') return 1; return a.originalPartIndex - b.originalPartIndex; });
                    let lastAddedPointDetails = availablePoints.shift();
                    orderedChangeData.push(lastAddedPointDetails);

                    while (availablePoints.length > 0 && lastAddedPointDetails) {
                        const currentRefLineNumber = lastAddedPointDetails.lineNumber;
                        let bestCandidate = null;
                        const candidates = availablePoints.map(cand => ({...cand, diff: Math.abs(cand.lineNumber - currentRefLineNumber), sortOrder: cand.lineNumber >= currentRefLineNumber ? 0 : 1 }))
                            .sort((a,b) => { if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder; if (a.diff !== b.diff) return a.diff - b.diff; if (a.lineNumber !== b.lineNumber) return a.lineNumber - b.lineNumber; if (a.sourceType === 'del' && b.sourceType !== 'del') return -1; if (a.sourceType !== 'del' && b.sourceType === 'del') return 1; return a.originalPartIndex - b.originalPartIndex; });
                        if(candidates.length > 0) bestCandidate = candidates[0];

                        if (bestCandidate) {
                            orderedChangeData.push(bestCandidate);
                            lastAddedPointDetails = bestCandidate;
                            availablePoints = availablePoints.filter(p => p.originalPartIndex !== bestCandidate.originalPartIndex);
                        } else break;
                    }
                }


                let leftPaneHtml = '', rightPaneHtml = '';
                let currentLeftLineNumRender = 1, currentRightLineNumRender = 1;
                const orderedNavMap = new Map();
                orderedChangeData.forEach((data, navIndex) => orderedNavMap.set(data.originalPartIndex, navIndex));

                diffParts.forEach((part, partIndex) => {
                    const partValue = part.value || '';
                    const lines = partValue.endsWith('\n') ? partValue.slice(0, -1).split('\n') : partValue.split('\n');
                    if (partValue === '' && lines.length === 1 && lines[0] === '') { /* skip if truly empty */ }
                    else {
                        lines.forEach((line, lineIndexInPart) => {
                            let lineId = '';
                            if ((part.added || part.removed) && lineIndexInPart === 0 && orderedNavMap.has(partIndex)) {
                                lineId = `id="diff-nav-target-${orderedNavMap.get(partIndex)}"`;
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
                    }
                });
                diffHtmlContent = `<div class="diff-sbs-container"><div class="diff-sbs-pane" id="diff-left-pane">${leftPaneHtml}</div><div class="diff-sbs-pane" id="diff-right-pane">${rightPaneHtml}</div></div>`;

                if (orderedChangeData.length > 0 || totalAdded > 0 || totalRemoved > 0) {
                    let summaryHtml = (totalAdded > 0 || totalRemoved > 0) ? `<span class="diff-summary"><strong class="diff-summary-added">+${totalAdded}</strong> <strong class="diff-summary-removed">-${totalRemoved}</strong></span>` : '';
                    headerContent = `<div class="diff-popup-header">JSON 비교 결과</div><div id="diff-navigation" class="diff-navigation-controls">${summaryHtml}<button id="prev-change-btn" class="swal2-styled">이전 변경점</button><button id="next-change-btn" class="swal2-styled">다음 변경점</button><span id="current-change-info" class="diff-current-change-info"></span></div>`;
                } else {
                    headerContent = `<div class="diff-popup-header">JSON 비교 결과</div>`;
                    diffHtmlContent = stringLeft === stringRight ? '<p class="diff-no-changes-message">내용이 동일합니다. 변경 사항이 없습니다.</p>' : '<p class="diff-no-changes-message">변경 사항이 감지되지 않았지만 원본 문자열은 다릅니다.</p>';
                }
            } catch (e) {
                diffHtmlContent = `<p class="diff-popup-error-message">JSON diff 표시에 오류 발생: ${escapeHtml(e.message)}</p>`;
                headerContent = `<div class="diff-popup-header diff-error">오류 발생</div>`;
            }
        }
    } else {
        diffHtmlContent = '<p class="diff-no-data">Diff를 표시할 JSON 데이터가 제공되지 않았습니다.</p>';
        headerContent = `<div class="diff-popup-header diff-error">데이터 오류</div>`;
    }

    const finalHtml = `${headerContent}<div id="diff-container" class="diff-main-container">${diffHtmlContent}</div>`;
    const customClassForShowCustomPopup = {
        ...incomingCustomClass,
        popup: `popup-diff-view ${incomingCustomClass.popup || ''}`.trim(),
        htmlContainer: incomingCustomClass.htmlContainer || 'custom-swal-html-container-text-diff'
    };

    return showCustomPopup({
        title,
        html: finalHtml,
        buttons,
        width: '95%',
        customClass: customClassForShowCustomPopup,
        didOpen: (popup) => {
            const finalNavigableLines = orderedChangeData.map((_, i) => document.getElementById(`diff-nav-target-${i}`)).filter(el => el);
            let currentChangeIndex = -1;
            let previouslyHighlightedLineElement = null;
            const navContainer = document.getElementById('diff-navigation');
            const nextBtn = document.getElementById('next-change-btn');
            const prevBtn = document.getElementById('prev-change-btn');
            const changeInfo = document.getElementById('current-change-info');

            function updateButtonAndNavInfo() {
                if (!navContainer) return;
                const noChanges = finalNavigableLines.length === 0;
                if (nextBtn) nextBtn.style.display = noChanges ? 'none' : 'inline-block';
                if (prevBtn) prevBtn.style.display = noChanges ? 'none' : 'inline-block';
                if (changeInfo) changeInfo.textContent = noChanges ? ((totalAdded > 0 || totalRemoved > 0) ? `0 / 0` : '변경점 없음') : `${currentChangeIndex + 1} / ${finalNavigableLines.length}`;
                if (nextBtn) nextBtn.disabled = currentChangeIndex >= finalNavigableLines.length - 1;
                if (prevBtn) prevBtn.disabled = currentChangeIndex <= 0;
            }

            function scrollToChange(indexToScroll) {
                if (indexToScroll < 0 || indexToScroll >= finalNavigableLines.length) return;
                if (previouslyHighlightedLineElement) previouslyHighlightedLineElement.classList.remove('diff-navigation-highlight');
                const lineEl = finalNavigableLines[indexToScroll];
                if (lineEl) {
                    const diffCont = document.getElementById('diff-container');
                    if (diffCont) {
                        const targetOffsetTop = lineEl.offsetTop;
                        diffCont.scrollTop = targetOffsetTop - (diffCont.clientHeight / 2) + (lineEl.clientHeight / 2);
                    } else {
                        lineEl.scrollIntoView({ block: 'center' });
                    }
                    lineEl.classList.add('diff-navigation-highlight');
                    previouslyHighlightedLineElement = lineEl;
                }
                currentChangeIndex = indexToScroll;
                updateButtonAndNavInfo();
            }

            if (finalNavigableLines.length > 0) scrollToChange(0);
            else updateButtonAndNavInfo();

            if (nextBtn) nextBtn.addEventListener('click', () => { if (currentChangeIndex < finalNavigableLines.length - 1) scrollToChange(currentChangeIndex + 1); });
            if (prevBtn) prevBtn.addEventListener('click', () => { if (currentChangeIndex > 0) scrollToChange(currentChangeIndex - 1); });

            popup.addEventListener('keydown', (event) => {
                if (finalNavigableLines.length === 0 || !nextBtn || !prevBtn) return;
                if (event.key === 'ArrowDown' || event.key === 'PageDown') { event.preventDefault(); if (!nextBtn.disabled) nextBtn.click(); }
                else if (event.key === 'ArrowUp' || event.key === 'PageUp') { event.preventDefault(); if (!prevBtn.disabled) prevBtn.click(); }
            });
            updateButtonAndNavInfo();
        },
        hotInstance
    });
}

async function showTextInputPopup(options) {
    const { title, inputLabel, inputValue = '', inputPlaceholder = '', inputValidator, confirmButtonText = '확인', cancelButtonText = '취소', showCancelButton = true, customClass = {}, html, hotInstance } = options;
    if (hotInstance && typeof hotInstance.deselectCell === 'function') hotInstance.deselectCell();

    const swalOptions = {
        title,
        input: 'text',
        inputValue,
        inputPlaceholder,
        inputValidator,
        showCancelButton,
        confirmButtonText,
        cancelButtonText,
        customClass: {...customClass, popup: `swal-text-input-popup ${customClass.popup || ''}`.trim() },
        didOpen: () => {
            const input = Swal.getInput();
            if (input) {
                input.focus();
                if (typeof input.select === 'function') input.select();
            }
        }
    };

    if (html) {
        swalOptions.html = html;
    } else if (inputLabel) {
        swalOptions.inputLabel = inputLabel;
    }

    return Swal.fire(swalOptions);
}

async function showConfirmationPopup(options) {
    const { title, text = '', html = '', icon = 'warning', confirmButtonText = '확인', cancelButtonText = '취소', showCancelButton = true, customClass = {}, hotInstance } = options;
    if (hotInstance && typeof hotInstance.deselectCell === 'function') hotInstance.deselectCell();
    return Swal.fire({ title, text, html, icon, showCancelButton, confirmButtonText, cancelButtonText, customClass: {...customClass, popup: `swal-confirmation-popup ${customClass.popup || ''}`.trim()} });
}

function showCustomFormPopup(options) {
    const { title = '폼', formItems = [], buttons = [], hotInstance, customClass: incomingCustomClass = {} } = options;
    if (hotInstance && typeof hotInstance.deselectCell === 'function') hotInstance.deselectCell();

    let formHtml = '<form id="custom-popup-form" class="swal-custom-form">';
    formItems.forEach(item => {
        const { id, type = 'text', label, value = '', placeholder = '', options: itemOpts = [], required = false } = item;
        formHtml += `<div class="swal-form-item">`;
        if (label) formHtml += `<label for="${id}" class="swal-form-label">${escapeHtml(label)}</label>`; // escapeHtml for label
        switch (type) {
            case 'textarea':
                formHtml += `<textarea id="${id}" name="${id}" class="swal2-textarea swal-form-textarea" placeholder="${escapeHtml(placeholder)}" ${required ? 'required' : ''}>${escapeHtml(String(value))}</textarea>`;
                break;
            case 'select':
                formHtml += `<select id="${id}" name="${id}" class="swal2-select swal-form-select" ${required ? 'required' : ''}>`;
                itemOpts.forEach(opt => {
                    formHtml += `<option value="${escapeHtml(String(opt.value))}" ${opt.value === value ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`;
                });
                formHtml += `</select>`;
                break;
            case 'checkbox':
                formHtml += `<div class="swal-form-checkbox-group">
                               <input type="checkbox" id="${id}" name="${id}" value="1" class="swal-form-checkbox" ${value ? 'checked' : ''} ${required ? 'required' : ''}>
                               <label for="${id}" class="swal-form-checkbox-label">${escapeHtml(placeholder) || ''}</label>
                             </div>`;
                break;
            case 'radio':
                itemOpts.forEach(opt => {
                    formHtml += `<div class="swal-form-radio-group-item">
                                   <input type="radio" id="${id}_${escapeHtml(String(opt.value))}" name="${id}" value="${escapeHtml(String(opt.value))}" class="swal-form-radio" ${opt.value === value ? 'checked' : ''} ${required ? 'required' : ''}>
                                   <label for="${id}_${escapeHtml(String(opt.value))}" class="swal-form-radio-label">${escapeHtml(opt.label)}</label>
                                 </div>`;
                });
                break;
            default: // text, password, email, etc.
                formHtml += `<input type="${type}" id="${id}" name="${id}" value="${escapeHtml(String(value))}" class="swal2-input swal-form-input" placeholder="${escapeHtml(placeholder)}" ${required ? 'required' : ''}>`;
        }
        formHtml += `</div>`;
    });
    formHtml += '</form>';

    const finalCustomClass = {
        ...incomingCustomClass,
        popup: `swal-custom-form-popup ${incomingCustomClass.popup || ''}`.trim()
    };

    return showCustomPopup({
        title, html: formHtml, buttons, hotInstance,
        customClass: finalCustomClass,
        preConfirm: () => {
            const form = document.getElementById('custom-popup-form');
            if (form && typeof form.checkValidity === 'function' && !form.checkValidity()) {
                Swal.showValidationMessage('모든 필수 항목을 올바르게 입력해주세요.');
                return false;
            }
            if (form) {
                const formData = new FormData(form);
                const resultData = {};
                formItems.forEach(item => {
                    if (item.type === 'checkbox') {
                        resultData[item.id] = formData.has(item.id);
                    } else if (formData.has(item.id)) {
                        resultData[item.id] = formData.get(item.id);
                    } else {
                        resultData[item.id] = undefined; // Or null, depending on desired behavior
                    }
                });
                return resultData;
            }
            return {};
        },
        didOpen: (popup) => {
            const form = popup.querySelector('#custom-popup-form');
            if (form) {
                const firstFocusableElement = form.querySelector('input:not([type="hidden"]), textarea, select');
                if (firstFocusableElement) firstFocusableElement.focus();
            }
        }
    });
}

async function showUrlProcessPopup(options) {
    const {
        title = 'URL 작업', initialInputValue = '', inputLabel = '입력:', outputLabel = '결과:',
        actionButtonText = '실행', confirmButtonText = '결과를 메인 편집기에 복사', cancelButtonText = '팝업 닫기',
        onExecuteAction, hotInstance, customClass: incomingCustomClass = {}
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
                <label for="${inputAreaId}" class="popup-label">${escapeHtml(inputLabel)}</label>
                <textarea id="${inputAreaId}" class="swal2-textarea popup-textarea" placeholder="여기에 문자열을 입력하세요...">${escapeHtml(initialInputValue)}</textarea>
            </div>
            <div class="popup-action-button-container">
                <button type="button" id="${executeBtnId}" class="swal2-styled popup-execute-button">${escapeHtml(actionButtonText)}</button>
            </div>
            <div class="popup-form-group">
                <label for="${outputAreaId}" class="popup-label">${escapeHtml(outputLabel)}</label>
                <textarea id="${outputAreaId}" class="swal2-textarea popup-textarea" readonly placeholder="결과가 여기에 표시됩니다..."></textarea>
            </div>
            <div id="${validationMsgId}" class="popup-validation-message"></div>
        </div>`;

    const finalCustomClass = {
        ...incomingCustomClass,
        popup: `popup-url-process popup-basic-white-theme ${incomingCustomClass.popup || ''}`.trim(),
        htmlContainer: incomingCustomClass.htmlContainer || 'popup-html-container-spacing'
    };

    return showCustomPopup({
        title, html: popupHtml, hotInstance,
        width: '50em', padding: '1.5em',
        customClass: finalCustomClass,
        buttons: [ { text: confirmButtonText, role: 'confirm' }, { text: cancelButtonText, role: 'cancel' } ],
        didOpen: (popupElement) => {
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
                            if (typeof resultValue === 'string' && resultValue.startsWith('오류:')) {
                                validationMsgArea.textContent = resultValue;
                            }
                        } catch (e) {
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
        preConfirm: () => {
            const outputArea = document.getElementById(outputAreaId);
            const validationMsgArea = document.getElementById(validationMsgId);
            if (validationMsgArea) validationMsgArea.textContent = '';

            if (outputArea && outputArea.value.trim() !== '') {
                if (outputArea.value.startsWith('오류:') || outputArea.value.startsWith('실행 중 예외:')) {
                    if (validationMsgArea) validationMsgArea.textContent = "오류가 있는 결과는 복사할 수 없습니다.";
                    return false;
                }
                return outputArea.value;
            }
            if (validationMsgArea) validationMsgArea.textContent = "메인 편집기에 복사할 결과가 없습니다.";
            return false;
        }
    });
}

async function showTemplateSelectionPopup(options) {
    const {
        title = '템플릿 선택', templates = [], message = '', confirmButtonText = '확인', cancelButtonText = '취소',
        hotInstance, existingUserTemplateNames = [], customClass: incomingCustomClass = {}
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
            initialChecked: true,
            originalTemplate: template
        };
    });

    let formHtml = `<form id="popup-template-selection-form" class="popup-template-selection-container">`;
    if (message) formHtml += `<p class="popup-message">${escapeHtml(message)}</p>`;
    formItemsConfig.forEach(item => {
        formHtml += `<div class="popup-template-item">
                        <input type="checkbox" id="${item.id}" name="${item.id}" value="true" ${item.initialChecked ? 'checked' : ''} class="popup-checkbox">
                        <label for="${item.id}" class="popup-label-checkbox">${item.label}</label>
                     </div>`;
    });
    formHtml += '</form>';

    const finalCustomClass = {
        ...incomingCustomClass,
        popup: `popup-template-selection popup-basic-white-theme ${incomingCustomClass.popup || ''}`.trim()
    };

    const popupResult = await showCustomPopup({
        title, html: formHtml, hotInstance,
        buttons: [ { text: confirmButtonText, role: 'confirm' }, { text: cancelButtonText, role: 'cancel' } ],
        width: '45em', padding: '1.5em',
        customClass: finalCustomClass,
        preConfirm: () => {
            const form = document.getElementById('popup-template-selection-form');
            return form ? formItemsConfig.filter(itemConf => form.querySelector(`#${itemConf.id}`)?.checked).map(itemConf => itemConf.originalTemplate) : [];
        }
    });
    return { isConfirmed: popupResult.isConfirmed, selectedTemplates: (popupResult.isConfirmed && Array.isArray(popupResult.formData)) ? popupResult.formData : [] };
}

async function showTemplateContentPopup(options) {
    const { title = '템플릿 내용', templateName, templateValue, hotInstance, customClass: incomingCustomClass = {} } = options;
    if (hotInstance && typeof hotInstance.deselectCell === 'function') hotInstance.deselectCell();

    let contentHtml;
    try {
        const prettyJson = JSON.stringify(templateValue, null, 2);
        contentHtml = `<pre class="popup-template-content-pre">${escapeHtml(prettyJson)}</pre>`;
    } catch (e) {
        contentHtml = `<p class="popup-error-message">템플릿 내용을 표시 중 오류: ${escapeHtml(e.message)}</p>`;
    }
    const finalCustomClass = {
        ...incomingCustomClass,
        popup: `popup-template-content popup-basic-white-theme ${incomingCustomClass.popup || ''}`.trim(),
        htmlContainer: incomingCustomClass.htmlContainer || 'popup-html-container-spacing'
    };

    return showConfirmationPopup({
        title: `${escapeHtml(templateName)} - 내용`, html: contentHtml, icon: null,
        showCancelButton: false, confirmButtonText: '닫기',
        customClass: finalCustomClass,
        width: '50em', hotInstance
    });
}

async function showTemplateManagementPopup(options) {
    const {
        title = '템플릿 관리', userTemplates = [], callbacks = {}, hotInstance, customClass: incomingCustomClass = {}
    } = options;

    if (hotInstance && typeof hotInstance.deselectCell === 'function') hotInstance.deselectCell();

    const generateHtmlForTemplateList = (templates) => {
        if (templates.length === 0) {
            return '<p class="popup-empty-message">관리할 사용자 정의 템플릿이 없습니다.</p>';
        }
        let listHtml = `<div class="popup-template-management-list-container"><ul class="popup-list">`;
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
    const finalCustomClass = {
        ...incomingCustomClass,
        popup: `popup-template-management popup-basic-white-theme ${incomingCustomClass.popup || ''}`.trim(),
        htmlContainer: incomingCustomClass.htmlContainer || 'popup-html-container-spacing'
    };
    return showCustomPopup({
        title, html: generateHtmlForTemplateList(userTemplates), hotInstance,
        width: '60em', padding: '1.5em',
        customClass: finalCustomClass,
        buttons: [{ text: '닫기', role: 'cancel' }],
        didOpen: (popupElement) => {
            popupElement.addEventListener('click', (event) => {
                const target = event.target.closest('button[data-template-name]');
                if (!target) return;
                const templateName = target.dataset.templateName;
                if (!templateName) return;

                if (target.classList.contains('tm-view-btn') && callbacks.onViewRequest) callbacks.onViewRequest(templateName);
                else if (target.classList.contains('tm-rename-btn') && callbacks.onRenameRequest) callbacks.onRenameRequest(templateName);
                else if (target.classList.contains('tm-delete-btn') && callbacks.onDeleteRequest) callbacks.onDeleteRequest(templateName);
            });
        }
    });
}