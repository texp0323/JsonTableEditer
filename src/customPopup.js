import Swal from 'sweetalert2';
import * as Diff from 'diff';

export { showJsonDiffPopup, showTextInputPopup, showConfirmationPopup, showCustomFormPopup };

function showJsonDiffPopup(options) {
    const {
        title = 'JSON Diff',
        jsonDiffData,
        buttons = [],
        hotInstance
    } = options;

    if (hotInstance && typeof hotInstance.deselectCell === 'function') {
        hotInstance.deselectCell();
    }

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
        try {
            return JSON.stringify(preserveKeyOrderAndProcess(obj), null, space);
        } catch (e) {
            console.error("Error stringifying object while preserving key order:", e);
            return JSON.stringify(obj, null, space);
        }
    };

    function escapeHtml(unsafe) {
        return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    if (jsonDiffData && jsonDiffData.left !== undefined && jsonDiffData.right !== undefined) {
        if (typeof Diff === 'undefined' || typeof Diff.diffLines !== 'function') {
            diffHtmlContent = '<p class="diff-popup-error-message">Diff 라이브러리를 로드할 수 없습니다. (Diff is not defined)</p>';
            headerContent = `<div class="diff-popup-header error">라이브러리 오류</div>`;
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
                    let summaryHtml = ''; if (totalAdded > 0 || totalRemoved > 0) summaryHtml = `<span class="diff-summary"><strong class="diff-summary-added">+${totalAdded}</strong> <strong class="diff-summary-removed">-${totalRemoved}</strong></span>`;
                    headerContent = `<div class="diff-popup-header">JSON 비교 결과 (텍스트 기반 Side-by-Side)</div><div id="diff-navigation">${summaryHtml}<button id="prev-change-btn" class="swal2-styled">이전 변경점</button><button id="next-change-btn" class="swal2-styled">다음 변경점</button><span id="current-change-info"></span></div>`;
                } else {
                    headerContent = `<div class="diff-popup-header">JSON 비교 결과</div>`;
                    if (stringLeft === stringRight) diffHtmlContent = '<p class="diff-no-changes-message">내용이 동일합니다. 변경 사항이 없습니다.</p>';
                    else diffHtmlContent = '<p class="diff-no-changes-message">변경 사항이 감지되지 않았지만 원본 문자열은 다릅니다.</p>';
                }
            } catch (e) {
                diffHtmlContent = `<p class="diff-popup-error-message">JSON diff 표시에 오류 발생: ${e.message}</p>`; headerContent = `<div class="diff-popup-header error">오류 발생</div>`;
            }
        }
    } else {
        diffHtmlContent = '<p class="diff-no-data">Diff를 표시할 JSON 데이터가 제공되지 않았습니다.</p>'; headerContent = `<div class="diff-popup-header error">데이터 오류</div>`;
    }
    const finalHtml = `${headerContent}<div id="diff-container">${diffHtmlContent}</div>`;
    return showCustomPopup({ title, html: finalHtml, buttons, width: '95%', customClass: { popup: 'custom-swal-popup-wider-text-diff', htmlContainer: 'custom-swal-html-container-text-diff' },
        didOpen: (popup) => {
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
    let finalHtml = html || ''; if (inputLabel && !html) finalHtml = `<label style="display: block; text-align: left; margin-bottom: .5em; font-weight: normal;">${inputLabel}</label>`;
    return Swal.fire({ title, html: finalHtml, input: 'text', inputValue, inputPlaceholder, inputValidator, showCancelButton, confirmButtonText, cancelButtonText, customClass,
        didOpen: () => { const input = Swal.getInput(); if (input) { input.focus(); if (typeof input.select === 'function') input.select(); } }
    });
}

async function showConfirmationPopup(options) {
    const { title, text = '', html = '', icon = 'warning', confirmButtonText = '확인', cancelButtonText = '취소', showCancelButton = true, customClass = {}, hotInstance } = options;
    if (hotInstance && typeof hotInstance.deselectCell === 'function') hotInstance.deselectCell();
    return Swal.fire({ title, text, html, icon, showCancelButton, confirmButtonText, cancelButtonText, customClass });
}

function showCustomFormPopup(options) {
    const { title = '폼', formItems = [], buttons = [], hotInstance } = options;
    if (hotInstance && typeof hotInstance.deselectCell === 'function') hotInstance.deselectCell();
    let formHtml = '<form id="custom-popup-form">';
    formItems.forEach(item => {
        const { id, type = 'text', label, value = '', placeholder = '', options: itemOpts = [], required = false } = item;
        formHtml += `<div class="form-item">`; if (label) formHtml += `<label for="${id}">${label}</label>`;
        if (type === 'textarea') formHtml += `<textarea id="${id}" name="${id}" placeholder="${placeholder}" ${required?'required':''}>${value}</textarea>`;
        else if (type === 'select') { formHtml += `<select id="${id}" name="${id}" ${required?'required':''}>`; itemOpts.forEach(opt => { const sel = opt.value === value ? 'selected' : ''; formHtml += `<option value="${opt.value}" ${sel}>${opt.label}</option>`; }); formHtml += `</select>`; }
        else if (type === 'checkbox') formHtml += `<div class="checkbox-group"><input type="${type}" id="${id}" name="${id}" value="1" ${value?'checked':''} ${required?'required':''}><label for="${id}">${placeholder||''}</label></div>`;
        else if (type === 'radio') itemOpts.forEach(opt => { const chk = opt.value === value ? 'checked' : ''; formHtml += `<div class="radio-group-item"><input type="radio" id="${id}_${opt.value}" name="${id}" value="${opt.value}" ${chk} ${required?'required':''}><label for="${id}_${opt.value}">${opt.label}</label></div>`; });
        else formHtml += `<input type="${type}" id="${id}" name="${id}" value="${value}" placeholder="${placeholder}" ${required?'required':''}>`;
        formHtml += `</div>`;
    }); formHtml += '</form>';
    return showCustomPopup({ title, html: formHtml, buttons,
        preConfirm: () => { const form = document.getElementById('custom-popup-form'); if (form && typeof form.checkValidity === 'function' && !form.checkValidity()) { Swal.showValidationMessage('모든 필수 항목을 올바르게 입력해주세요.'); return false; } if (form) { const fd = new FormData(form); const res = {}; formItems.forEach(item => { if (item.type === 'checkbox') res[item.id] = fd.has(item.id); else if (fd.has(item.id)) res[item.id] = fd.get(item.id); else res[item.id] = undefined; }); return res; } return {}; },
        didOpen: (popup) => { const form = popup.querySelector('#custom-popup-form'); if (form) { const firstEl = form.querySelector('input:not([type="hidden"]), textarea, select'); if (firstEl) firstEl.focus(); } }
    });
}

function showCustomPopup(options) {
    const { title, html, icon, buttons = [], width = '32em', padding = '1em', customClass = {}, preConfirm, didOpen } = options;
    const swalOpts = { title, html, icon, width, padding, showConfirmButton: true, showCancelButton: false, customClass, preConfirm, didOpen };
    const confirmBtnCfg = buttons.find(b => b.role === 'confirm' || (!b.role && buttons.indexOf(b) === 0));
    const cancelBtnCfg = buttons.find(b => b.role === 'cancel');
    if (confirmBtnCfg) { swalOpts.showConfirmButton = true; swalOpts.confirmButtonText = confirmBtnCfg.text || Swal.getConfirmButton().innerText; if (confirmBtnCfg.color) swalOpts.confirmButtonColor = confirmBtnCfg.color; }
    else if (buttons.length > 0 || preConfirm) { if (!buttons.some(b => b.role !== 'cancel') && !preConfirm) swalOpts.showConfirmButton = false; }
    else swalOpts.showConfirmButton = false;
    if (cancelBtnCfg) { swalOpts.showCancelButton = true; swalOpts.cancelButtonText = cancelBtnCfg.text || Swal.getCancelButton().innerText; if (cancelBtnCfg.color) swalOpts.cancelButtonColor = cancelBtnCfg.color; }
    if (typeof Swal === 'undefined') return Promise.reject('SweetAlert2 is not imported');
    const swalPromise = Swal.fire(swalOpts);
    return swalPromise.then(result => {
        let cbResult = { ...result, formData: {} }; if (result.isConfirmed && preConfirm) cbResult.formData = result.value || {};
        if (result.isConfirmed && confirmBtnCfg && typeof confirmBtnCfg.action === 'function' && !preConfirm) confirmBtnCfg.action();
        else if (result.isDismissed && cancelBtnCfg && typeof cancelBtnCfg.action === 'function') { if (result.dismiss === Swal.DismissReason.cancel) cancelBtnCfg.action(); }
        return cbResult;
    });
}