// ==UserScript==
// @name         Porkbun - Hide sold/unavailable/error results
// @namespace    https://tampermonkey.net/
// @version      1.6
// @description  Hides unavailable, sold, error, inquire-only, compound TLD, and aftermarket results on Porkbun search pages, with TLD length filtering.
// @author       CevAPI
// @match        https://porkbun.com/checkout/search*
// @match        https://www.porkbun.com/checkout/search*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function()
{
    'use strict';

    const HIDE_CLASS = 'pb-hidden-by-userscript';
    const STYLE_ID = 'pb-hide-unavailable-style';

    const UI_ID = 'pb-tld-filter-overlay';
    const MIN_INPUT_ID = 'pb-tld-filter-min';
    const MAX_INPUT_ID = 'pb-tld-filter-max';
    const RESET_BUTTON_ID = 'pb-tld-filter-reset';
    const TOGGLE_BUTTON_ID = 'pb-tld-filter-toggle';
    const COMPOUND_TLD_CHECKBOX_ID = 'pb-hide-compound-tlds';
    const AFTERMARKET_CHECKBOX_ID = 'pb-hide-aftermarket';
    const BODY_ID = 'pb-tld-filter-body';
    const STORAGE_MIN_KEY = 'pb_tld_filter_min';
    const STORAGE_MAX_KEY = 'pb_tld_filter_max';
    const STORAGE_COLLAPSED_KEY = 'pb_tld_filter_collapsed';
    const STORAGE_HIDE_COMPOUND_TLDS_KEY = 'pb_hide_compound_tlds';
    const STORAGE_HIDE_AFTERMARKET_KEY = 'pb_hide_aftermarket';

    function normalizeText(text)
    {
        return (text || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function injectStyle()
    {
        if(document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .${HIDE_CLASS} {
                display: none !important;
            }

            #${UI_ID} {
                position: fixed;
                top: 16px;
                right: 16px;
                z-index: 999999;
                width: 260px;
                background: rgba(255, 255, 255, 0.98);
                border: 1px solid #d9d9d9;
                border-radius: 8px;
                box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
                font-family: Arial, sans-serif;
                color: #222;
            }

            #${UI_ID} * {
                box-sizing: border-box;
            }

            #${UI_ID} .pb-tld-filter-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 10px 12px;
                border-bottom: 1px solid #ececec;
                font-size: 14px;
                font-weight: bold;
            }

            #${UI_ID} .pb-tld-filter-body {
                padding: 12px;
            }

            #${UI_ID} .pb-tld-filter-row {
                display: flex;
                gap: 8px;
                align-items: end;
                margin-bottom: 10px;
            }

            #${UI_ID} .pb-tld-filter-field {
                flex: 1;
            }

            #${UI_ID} label {
                display: block;
                font-size: 12px;
                font-weight: normal;
                margin-bottom: 4px;
                color: #555;
            }

            #${UI_ID} input[type="number"] {
                width: 100%;
                padding: 6px 8px;
                border: 1px solid #cfcfcf;
                border-radius: 4px;
                font-size: 13px;
                line-height: 1.2;
            }

            #${UI_ID} .pb-tld-filter-actions {
                display: flex;
                gap: 8px;
                margin-top: 6px;
            }

            #${UI_ID} button {
                border: 1px solid #cfcfcf;
                background: #f8f8f8;
                color: #222;
                border-radius: 4px;
                padding: 6px 10px;
                font-size: 12px;
                cursor: pointer;
            }

            #${UI_ID} button:hover {
                background: #f0f0f0;
            }

            #${UI_ID}.pb-collapsed .pb-tld-filter-body {
                display: none;
            }

            #${UI_ID}.pb-collapsed .pb-tld-filter-header {
                border-bottom: 0;
            }

            #${UI_ID} .pb-tld-filter-checkbox {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-top: 10px;
                font-size: 12px;
                color: #555;
            }

            #${UI_ID} .pb-tld-filter-checkbox input[type="checkbox"] {
                margin: 0;
            }

            #${UI_ID} .pb-tld-filter-checkbox label {
                margin: 0;
                cursor: pointer;
            }
        `;
        document.head.appendChild(style);
    }

    function getText(element)
    {
        return normalizeText(element ? (element.innerText || element.textContent || '') : '');
    }

    function getMainRows()
    {
        return Array.from(document.querySelectorAll('.searchResultRow'));
    }

    function getSidebarCards()
    {
        return Array.from(document.querySelectorAll('.sideBarSearchResults'));
    }

    function hasPriceText(element)
    {
        const raw = element ? (element.innerText || element.textContent || '') : '';
        return /\$\s?\d/.test(raw);
    }

    function hasAddToCartControl(element)
    {
        if(!element) return false;

        return !!element.querySelector(
            '[id^="addCartButton"], [data-type="registration"], [data-type="transfer"], .glyphicon-plus'
        );
    }

    function hasInquireOnlyControl(element)
    {
        if(!element) return false;

        const controls = Array.from(element.querySelectorAll('button, a'))
            .map(node => normalizeText(node.textContent))
            .filter(Boolean);

        if(controls.length === 0) return false;

        return controls.includes('inquire') && !hasAddToCartControl(element);
    }

    function hasAftermarketBadge(element)
    {
        if(!element) return false;

        const text = getText(element);
        if(text.includes('aftermarket')) return true;
        if(text.includes('porkbun marketplace')) return true;
        if(text.includes('afternic')) return true;

        return false;
    }

    function mainRowShouldHide(row)
    {
        const text = getText(row);
        if(!text) return false;

        if(text.includes('error')) return true;
        if(text.includes('unavailable')) return true;
        if(text.includes('sold')) return true;

        if(hasInquireOnlyControl(row) && !hasPriceText(row)) return true;

        return false;
    }

    function sidebarCardShouldHide(card)
    {
        const text = getText(card);
        if(!text) return false;

        if(text.includes('error')) return true;
        if(text.includes('unavailable')) return true;
        if(text.includes('sold')) return true;

        const hasPrice = hasPriceText(card);
        const hasAdd = hasAddToCartControl(card);
        const inquireOnly = hasInquireOnlyControl(card);

        if(inquireOnly && !hasPrice && !hasAdd) return true;

        return false;
    }

    function getStoredNumber(key)
    {
        const value = localStorage.getItem(key);
        if(value === null || value === '') return '';

        const parsed = parseInt(value, 10);
        if(Number.isNaN(parsed)) return '';

        return parsed;
    }

    function getLengthFilterState()
    {
        return {
            min: getStoredNumber(STORAGE_MIN_KEY),
            max: getStoredNumber(STORAGE_MAX_KEY)
        };
    }

    function saveLengthFilterState(min, max)
    {
        if(min === '' || min === null || Number.isNaN(min))
        {
            localStorage.removeItem(STORAGE_MIN_KEY);
        }
        else
        {
            localStorage.setItem(STORAGE_MIN_KEY, String(min));
        }

        if(max === '' || max === null || Number.isNaN(max))
        {
            localStorage.removeItem(STORAGE_MAX_KEY);
        }
        else
        {
            localStorage.setItem(STORAGE_MAX_KEY, String(max));
        }
    }

    function getCollapsedState()
    {
        return localStorage.getItem(STORAGE_COLLAPSED_KEY) === '1';
    }

    function saveCollapsedState(collapsed)
    {
        localStorage.setItem(STORAGE_COLLAPSED_KEY, collapsed ? '1' : '0');
    }

    function getHideCompoundTldsState()
    {
        return localStorage.getItem(STORAGE_HIDE_COMPOUND_TLDS_KEY) === '1';
    }

    function saveHideCompoundTldsState(enabled)
    {
        localStorage.setItem(STORAGE_HIDE_COMPOUND_TLDS_KEY, enabled ? '1' : '0');
    }

    function getHideAftermarketState()
    {
        return localStorage.getItem(STORAGE_HIDE_AFTERMARKET_KEY) === '1';
    }

    function saveHideAftermarketState(enabled)
    {
        localStorage.setItem(STORAGE_HIDE_AFTERMARKET_KEY, enabled ? '1' : '0');
    }

    function parseInputValue(value)
    {
        const trimmed = String(value || '').trim();
        if(trimmed === '') return '';

        const parsed = parseInt(trimmed, 10);
        if(Number.isNaN(parsed) || parsed < 0) return '';

        return parsed;
    }

    function getDomainTextFromElement(element)
    {
        if(!element) return '';

        const domainNode =
            element.querySelector('[id^="searchResultRowDomain_"]') ||
            element.querySelector('.searchResultRowDomainAftermarket') ||
            element.querySelector('.sideBarSearchResultsDomainDisplay') ||
            element;

        return normalizeText(domainNode.textContent || '');
    }

    function extractTldFromElement(element)
    {
        const domainText = getDomainTextFromElement(element);
        if(!domainText) return '';

        const parts = domainText.split('.').filter(Boolean);
        if(parts.length < 2) return '';

        return parts.slice(1).join('.');
    }

    function getTldLengthFromElement(element)
    {
        const tld = extractTldFromElement(element);
        return tld ? tld.length : null;
    }

    function isCompoundTldFromElement(element)
    {
        const tld = extractTldFromElement(element);
        if(!tld) return false;

        return tld.includes('.');
    }

    function isOutsideLengthRange(length, min, max)
    {
        if(length === null) return false;
        if(min !== '' && length < min) return true;
        if(max !== '' && length > max) return true;
        return false;
    }

    function lengthFilterShouldHide(element)
    {
        const state = getLengthFilterState();
        const length = getTldLengthFromElement(element);

        return isOutsideLengthRange(length, state.min, state.max);
    }

    function compoundTldFilterShouldHide(element)
    {
        if(!getHideCompoundTldsState()) return false;

        return isCompoundTldFromElement(element);
    }

    function aftermarketFilterShouldHide(element)
    {
        if(!getHideAftermarketState()) return false;

        return hasAftermarketBadge(element);
    }

    function hideElement(element)
    {
        if(element) element.classList.add(HIDE_CLASS);
    }

    function showElement(element)
    {
        if(element) element.classList.remove(HIDE_CLASS);
    }

    function ensureOverlay()
    {
        if(document.getElementById(UI_ID)) return;

        const overlay = document.createElement('div');
        overlay.id = UI_ID;
        overlay.innerHTML = `
            <div class="pb-tld-filter-header">
                <span>TLD length filter</span>
                <button id="${TOGGLE_BUTTON_ID}" type="button">Hide</button>
            </div>
            <div id="${BODY_ID}" class="pb-tld-filter-body">
                <div class="pb-tld-filter-row">
                    <div class="pb-tld-filter-field">
                        <label for="${MIN_INPUT_ID}">Min length</label>
                        <input id="${MIN_INPUT_ID}" type="number" min="0" step="1" placeholder="Any">
                    </div>
                    <div class="pb-tld-filter-field">
                        <label for="${MAX_INPUT_ID}">Max length</label>
                        <input id="${MAX_INPUT_ID}" type="number" min="0" step="1" placeholder="Any">
                    </div>
                </div>
                <div class="pb-tld-filter-actions">
                    <button id="${RESET_BUTTON_ID}" type="button">Reset</button>
                </div>
                <div class="pb-tld-filter-checkbox">
                    <input id="${COMPOUND_TLD_CHECKBOX_ID}" type="checkbox">
                    <label for="${COMPOUND_TLD_CHECKBOX_ID}">Hide compound TLDs</label>
                </div>
                <div class="pb-tld-filter-checkbox">
                    <input id="${AFTERMARKET_CHECKBOX_ID}" type="checkbox">
                    <label for="${AFTERMARKET_CHECKBOX_ID}">Hide aftermarket results</label>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const minInput = document.getElementById(MIN_INPUT_ID);
        const maxInput = document.getElementById(MAX_INPUT_ID);
        const resetButton = document.getElementById(RESET_BUTTON_ID);
        const toggleButton = document.getElementById(TOGGLE_BUTTON_ID);
        const compoundCheckbox = document.getElementById(COMPOUND_TLD_CHECKBOX_ID);
        const aftermarketCheckbox = document.getElementById(AFTERMARKET_CHECKBOX_ID);

        const state = getLengthFilterState();
        minInput.value = state.min === '' ? '' : state.min;
        maxInput.value = state.max === '' ? '' : state.max;
        compoundCheckbox.checked = getHideCompoundTldsState();
        aftermarketCheckbox.checked = getHideAftermarketState();

        if(getCollapsedState())
        {
            overlay.classList.add('pb-collapsed');
            toggleButton.textContent = 'Show';
        }

        minInput.addEventListener('input', () =>
        {
            const min = parseInputValue(minInput.value);
            const max = parseInputValue(maxInput.value);
            saveLengthFilterState(min, max);
            filterAll();
        });

        maxInput.addEventListener('input', () =>
        {
            const min = parseInputValue(minInput.value);
            const max = parseInputValue(maxInput.value);
            saveLengthFilterState(min, max);
            filterAll();
        });

        resetButton.addEventListener('click', () =>
        {
            minInput.value = '';
            maxInput.value = '';
            compoundCheckbox.checked = false;
            aftermarketCheckbox.checked = false;
            saveLengthFilterState('', '');
            saveHideCompoundTldsState(false);
            saveHideAftermarketState(false);
            filterAll();
        });

        compoundCheckbox.addEventListener('change', () =>
        {
            saveHideCompoundTldsState(compoundCheckbox.checked);
            filterAll();
        });

        aftermarketCheckbox.addEventListener('change', () =>
        {
            saveHideAftermarketState(aftermarketCheckbox.checked);
            filterAll();
        });

        toggleButton.addEventListener('click', () =>
        {
            const collapsed = !overlay.classList.contains('pb-collapsed');

            if(collapsed)
            {
                overlay.classList.add('pb-collapsed');
                toggleButton.textContent = 'Show';
            }
            else
            {
                overlay.classList.remove('pb-collapsed');
                toggleButton.textContent = 'Hide';
            }

            saveCollapsedState(collapsed);
        });
    }

    function filterMainRows()
    {
        getMainRows().forEach(row =>
        {
            const shouldHide =
                mainRowShouldHide(row) ||
                lengthFilterShouldHide(row) ||
                compoundTldFilterShouldHide(row) ||
                aftermarketFilterShouldHide(row);

            if(shouldHide)
            {
                hideElement(row);

                const wrapper = row.closest('.well, .well-sm, .weight_23');
                if(wrapper && wrapper !== row)
                {
                    hideElement(wrapper);
                }
            }
            else
            {
                showElement(row);

                const wrapper = row.closest('.well, .well-sm, .weight_23');
                if(wrapper && wrapper !== row)
                {
                    showElement(wrapper);
                }
            }
        });
    }

    function filterSidebarCards()
    {
        getSidebarCards().forEach(card =>
        {
            const shouldHide =
                sidebarCardShouldHide(card) ||
                lengthFilterShouldHide(card) ||
                compoundTldFilterShouldHide(card) ||
                aftermarketFilterShouldHide(card);

            if(shouldHide)
            {
                hideElement(card);
            }
            else
            {
                showElement(card);
            }
        });
    }

    function cleanupExplicitEmptyRows()
    {
        const containers = [
            document.getElementById('searchResultsDomainContainer'),
            document.getElementById('searchResultContainer_afternic'),
            document.getElementById('searchResultsDomainContainerSide')
        ].filter(Boolean);

        containers.forEach(container =>
        {
            Array.from(container.children).forEach(child =>
            {
                if(child.classList.contains('searchResultRow')) return;
                if(child.classList.contains('sideBarSearchResults')) return;
                if(child.querySelector('.searchResultRow')) return;
                if(child.querySelector('.sideBarSearchResults')) return;

                const text = getText(child);
                const hasControls = !!child.querySelector('button, a, input, select');
                const height = child.offsetHeight;

                if(!hasControls && text === '' && height > 0 && height < 80)
                {
                    hideElement(child);
                }
            });
        });
    }

    function filterAll()
    {
        filterMainRows();
        filterSidebarCards();
        cleanupExplicitEmptyRows();
    }

    function observe()
    {
        const observer = new MutationObserver(() =>
        {
            ensureOverlay();
            filterAll();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function init()
    {
        injectStyle();
        ensureOverlay();
        filterAll();
        observe();

        window.addEventListener('load', () =>
        {
            ensureOverlay();
            filterAll();
        });

        window.addEventListener('pageshow', () =>
        {
            ensureOverlay();
            filterAll();
        });

        setInterval(() =>
        {
            ensureOverlay();
            filterAll();
        }, 1000);
    }

    init();
})();
