// ==UserScript==
// @name         Porkbun - Hide sold/unavailable/error results
// @namespace    https://tampermonkey.net/
// @version      3.0
// @description  Filters Porkbun results, supports TLD filters, inline renewal prices, displayed currency conversion, and auto-expands all extensions.
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
    const INLINE_PRICES_CHECKBOX_ID = 'pb-inline-renewal-prices';
    const CONVERT_PRICES_CHECKBOX_ID = 'pb-convert-visible-prices';
    const TARGET_CURRENCY_SELECT_ID = 'pb-target-currency';
    const FX_STATUS_ID = 'pb-fx-status';
    const BODY_ID = 'pb-tld-filter-body';

    const STORAGE_MIN_KEY = 'pb_tld_filter_min';
    const STORAGE_MAX_KEY = 'pb_tld_filter_max';
    const STORAGE_COLLAPSED_KEY = 'pb_tld_filter_collapsed';
    const STORAGE_HIDE_COMPOUND_TLDS_KEY = 'pb_hide_compound_tlds';
    const STORAGE_HIDE_AFTERMARKET_KEY = 'pb_hide_aftermarket';
    const STORAGE_INLINE_RENEWAL_PRICES_KEY = 'pb_inline_renewal_prices';
    const STORAGE_CONVERT_VISIBLE_PRICES_KEY = 'pb_convert_visible_prices';
    const STORAGE_TARGET_CURRENCY_KEY = 'pb_target_currency';

    const PRICE_SNAPSHOT_ATTR = 'data-pb-price-snapshot';
    const FX_CACHE_PREFIX = 'pb_fx_rate_';
    const FX_CACHE_TTL_MS = 1000 * 60 * 60 * 12;

    const SUPPORTED_CURRENCIES = [
        'USD',
        'AUD',
        'CAD',
        'CHF',
        'CNY',
        'DKK',
        'EUR',
        'GBP',
        'HKD',
        'JPY',
        'NOK',
        'NZD',
        'SEK',
        'SGD'
    ];

    const CURRENCY_SYMBOLS = {
        USD: '$',
        AUD: 'A$',
        CAD: 'C$',
        CHF: 'CHF ',
        CNY: '¥',
        DKK: 'kr ',
        EUR: '€',
        GBP: '£',
        HKD: 'HK$',
        JPY: '¥',
        NOK: 'kr ',
        NZD: 'NZ$',
        SEK: 'kr ',
        SGD: 'S$'
    };

    let refreshTimer = null;
    let refreshRunning = false;
    let fxRequestToken = 0;

    function normalizeText(text)
    {
        return (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
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
                width: 290px;
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

            #${UI_ID} input[type="number"],
            #${UI_ID} select {
                width: 100%;
                padding: 6px 8px;
                border: 1px solid #cfcfcf;
                border-radius: 4px;
                font-size: 13px;
                line-height: 1.2;
                background: #fff;
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

            #${UI_ID} .pb-divider {
                margin: 12px 0;
                border-top: 1px solid #ececec;
            }

            #${UI_ID} .pb-section-title {
                font-size: 12px;
                font-weight: 700;
                color: #444;
                margin: 0 0 8px 0;
            }

            #${UI_ID} #${FX_STATUS_ID} {
                margin-top: 8px;
                font-size: 12px;
                color: #555;
                line-height: 1.35;
                min-height: 16px;
            }

            .pb-price-render {
                line-height: 1.25;
            }

            .pb-price-render strong {
                font-weight: 700;
            }

            .pb-price-render-badge {
                display: inline-block;
                margin-bottom: 4px;
                padding: 2px 6px;
                border-radius: 3px;
                background: #555;
                color: #fff;
                font-size: 11px;
                font-weight: 700;
            }

            .pb-price-render-subtle {
                color: #666;
                font-size: 12px;
            }

            .pb-price-render-note {
                color: #666;
                font-size: 12px;
                margin-top: 2px;
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

    function getPriceContainers()
    {
        return Array.from(document.querySelectorAll('[id^="searchResultRowPrice_"]'));
    }

    function extractMoneyStrings(text)
    {
        return String(text || '').match(/\$[\d,]+(?:\.\d{2})?/g) || [];
    }

    function parseMoneyString(value)
    {
        const parsed = parseFloat(String(value || '').replace(/\$/g, '').replace(/,/g, ''));
        return Number.isNaN(parsed) ? null : parsed;
    }

    function hasPriceText(element)
    {
        const raw = element ? (element.innerText || element.textContent || '') : '';
        return /\$[\d,]+(?:\.\d{2})?/.test(raw);
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

    function getStoredString(key, fallback)
    {
        const value = localStorage.getItem(key);
        if(value === null || value === '') return fallback;
        return value;
    }

    function getStoredBoolean(key)
    {
        return localStorage.getItem(key) === '1';
    }

    function setStoredBoolean(key, value)
    {
        localStorage.setItem(key, value ? '1' : '0');
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
        return getStoredBoolean(STORAGE_COLLAPSED_KEY);
    }

    function saveCollapsedState(collapsed)
    {
        setStoredBoolean(STORAGE_COLLAPSED_KEY, collapsed);
    }

    function getHideCompoundTldsState()
    {
        return getStoredBoolean(STORAGE_HIDE_COMPOUND_TLDS_KEY);
    }

    function saveHideCompoundTldsState(enabled)
    {
        setStoredBoolean(STORAGE_HIDE_COMPOUND_TLDS_KEY, enabled);
    }

    function getHideAftermarketState()
    {
        return getStoredBoolean(STORAGE_HIDE_AFTERMARKET_KEY);
    }

    function saveHideAftermarketState(enabled)
    {
        setStoredBoolean(STORAGE_HIDE_AFTERMARKET_KEY, enabled);
    }

    function getInlineRenewalPricesState()
    {
        return getStoredBoolean(STORAGE_INLINE_RENEWAL_PRICES_KEY);
    }

    function saveInlineRenewalPricesState(enabled)
    {
        setStoredBoolean(STORAGE_INLINE_RENEWAL_PRICES_KEY, enabled);
    }

    function getConvertVisiblePricesState()
    {
        return getStoredBoolean(STORAGE_CONVERT_VISIBLE_PRICES_KEY);
    }

    function saveConvertVisiblePricesState(enabled)
    {
        setStoredBoolean(STORAGE_CONVERT_VISIBLE_PRICES_KEY, enabled);
    }

    function getTargetCurrencyState()
    {
        const value = getStoredString(STORAGE_TARGET_CURRENCY_KEY, 'EUR');
        return SUPPORTED_CURRENCIES.includes(value) ? value : 'EUR';
    }

    function saveTargetCurrencyState(value)
    {
        localStorage.setItem(STORAGE_TARGET_CURRENCY_KEY, value);
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

    function getCurrencySymbol(code)
    {
        return CURRENCY_SYMBOLS[code] || (code + ' ');
    }

    function formatMoney(value, currencyCode)
    {
        const symbol = getCurrencySymbol(currencyCode);
        return symbol + value.toFixed(2);
    }

    function extractPriceModel(container)
    {
        if(!container) return null;

        const text = container.innerText || container.textContent || '';
        const normalized = normalizeText(text);
        const moneyStrings = extractMoneyStrings(text);
        const moneyValues = moneyStrings
            .map(parseMoneyString)
            .filter(value => value !== null);

        const renewalNode = container.querySelector('.renewsAtContainer');
        let renewalValue = null;

        if(renewalNode)
        {
            const renewalMoneyStrings = extractMoneyStrings(renewalNode.textContent || '');
            if(renewalMoneyStrings.length > 0)
            {
                renewalValue = parseMoneyString(renewalMoneyStrings[renewalMoneyStrings.length - 1]);
            }
        }

        const isAftermarket = hasAftermarketBadge(container) || normalized.includes('transfer fee');
        const hasPerYear = normalized.includes('/ year');
        const hasTransferFee = normalized.includes('transfer fee');
        const isPremium = normalized.includes('premium');

        if(isAftermarket)
        {
            if(moneyValues.length === 0) return null;

            return {
                kind: 'aftermarket',
                current: moneyValues[0],
                renewal: null,
                perYear: false,
                premium: false,
                transferFee: hasTransferFee
            };
        }

        if(moneyValues.length === 0) return null;

        let currentValue = moneyValues[moneyValues.length - 1];

        if(renewalValue !== null)
        {
            currentValue = moneyValues[moneyValues.length - 1];

            for(let i = moneyValues.length - 1; i >= 0; i--)
            {
                if(Math.abs(moneyValues[i] - renewalValue) > 0.000001)
                {
                    currentValue = moneyValues[i];
                    break;
                }
            }
        }

        return {
            kind: 'standard',
            current: currentValue,
            renewal: renewalValue,
            perYear: hasPerYear,
            premium: isPremium,
            transferFee: false
        };
    }

    function captureBasePriceHtml()
    {
        getPriceContainers().forEach(container =>
        {
            if(container.getAttribute(PRICE_SNAPSHOT_ATTR) === '1') return;

            const model = extractPriceModel(container);
            if(!model) return;

            container.dataset.pbBaseHtml = container.innerHTML;
            container.setAttribute(PRICE_SNAPSHOT_ATTR, '1');
        });
    }

    function restoreBasePriceHtml()
    {
        getPriceContainers().forEach(container =>
        {
            if(container.dataset.pbBaseHtml === undefined) return;
            container.innerHTML = container.dataset.pbBaseHtml;
        });
    }

    function buildRenderedPriceHtml(model, currencyCode, rate, inlinePricesEnabled)
    {
        const currentValue = model.current * rate;
        const renewalValue = model.renewal !== null ? model.renewal * rate : null;
        const currentText = formatMoney(currentValue, currencyCode);
        const renewalText = renewalValue !== null ? formatMoney(renewalValue, currencyCode) : null;

        if(model.kind === 'aftermarket')
        {
            return `
                <div class="pb-price-render">
                    <div class="pb-price-render-badge">Aftermarket</div>
                    <div>${currentText}</div>
                    ${model.transferFee ? '<div class="pb-price-render-note">+ transfer fee</div>' : ''}
                </div>
            `;
        }

        if(inlinePricesEnabled && renewalText !== null)
        {
            return `
                <div class="pb-price-render">
                    ${currentText} | <strong>${renewalText}</strong> Renewal
                </div>
            `;
        }

        if(renewalText !== null)
        {
            return `
                <div class="pb-price-render">
                    <div>${currentText}${model.perYear ? ' / year' : ''}</div>
                    <div class="pb-price-render-note"><strong>${renewalText}</strong> Renewal</div>
                    ${model.premium ? '<div class="pb-price-render-subtle">Premium</div>' : ''}
                </div>
            `;
        }

        return `
            <div class="pb-price-render">
                <div>${currentText}${model.perYear ? ' / year' : ''}</div>
                ${model.premium ? '<div class="pb-price-render-subtle">Premium</div>' : ''}
            </div>
        `;
    }

    function getCachedFxRate(targetCurrency)
    {
        try
        {
            const raw = localStorage.getItem(FX_CACHE_PREFIX + targetCurrency);
            if(!raw) return null;

            const parsed = JSON.parse(raw);
            if(!parsed || typeof parsed.rate !== 'number' || typeof parsed.timestamp !== 'number') return null;
            if(Date.now() - parsed.timestamp > FX_CACHE_TTL_MS) return null;

            return parsed.rate;
        }
        catch(error)
        {
            return null;
        }
    }

    function setCachedFxRate(targetCurrency, rate)
    {
        try
        {
            localStorage.setItem(FX_CACHE_PREFIX + targetCurrency, JSON.stringify({
                rate: rate,
                timestamp: Date.now()
            }));
        }
        catch(error)
        {
        }
    }

    async function fetchFxRate(targetCurrency)
    {
        if(targetCurrency === 'USD') return 1;

        const cached = getCachedFxRate(targetCurrency);
        if(cached !== null) return cached;

        const response = await fetch(`https://api.frankfurter.dev/v2/rates?base=USD&quotes=${encodeURIComponent(targetCurrency)}`, {
            method: 'GET',
            credentials: 'omit',
            cache: 'no-store'
        });

        if(!response.ok)
        {
            throw new Error('HTTP ' + response.status);
        }

        const data = await response.json();
        if(!data || !data.rates || typeof data.rates[targetCurrency] !== 'number')
        {
            throw new Error('No rate');
        }

        const rate = data.rates[targetCurrency];
        setCachedFxRate(targetCurrency, rate);
        return rate;
    }

    function buildCurrencyOptions()
    {
        return SUPPORTED_CURRENCIES.map(code =>
            `<option value="${code}">${code}</option>`
        ).join('');
    }

    function ensureOverlay()
    {
        if(document.getElementById(UI_ID)) return;

        const overlay = document.createElement('div');
        overlay.id = UI_ID;
        overlay.innerHTML = `
            <div class="pb-tld-filter-header">
                <span>TLD filters</span>
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
                <div class="pb-tld-filter-checkbox">
                    <input id="${INLINE_PRICES_CHECKBOX_ID}" type="checkbox">
                    <label for="${INLINE_PRICES_CHECKBOX_ID}">Inline renewal prices</label>
                </div>
                <div class="pb-divider"></div>
                <div class="pb-section-title">Displayed currency</div>
                <div class="pb-tld-filter-checkbox">
                    <input id="${CONVERT_PRICES_CHECKBOX_ID}" type="checkbox">
                    <label for="${CONVERT_PRICES_CHECKBOX_ID}">Convert visible prices</label>
                </div>
                <div class="pb-tld-filter-row" style="margin-top:10px;">
                    <div class="pb-tld-filter-field">
                        <label for="${TARGET_CURRENCY_SELECT_ID}">Currency</label>
                        <select id="${TARGET_CURRENCY_SELECT_ID}">
                            ${buildCurrencyOptions()}
                        </select>
                    </div>
                </div>
                <div id="${FX_STATUS_ID}"></div>
            </div>
        `;

        document.body.appendChild(overlay);

        const minInput = document.getElementById(MIN_INPUT_ID);
        const maxInput = document.getElementById(MAX_INPUT_ID);
        const resetButton = document.getElementById(RESET_BUTTON_ID);
        const toggleButton = document.getElementById(TOGGLE_BUTTON_ID);
        const compoundCheckbox = document.getElementById(COMPOUND_TLD_CHECKBOX_ID);
        const aftermarketCheckbox = document.getElementById(AFTERMARKET_CHECKBOX_ID);
        const inlinePricesCheckbox = document.getElementById(INLINE_PRICES_CHECKBOX_ID);
        const convertPricesCheckbox = document.getElementById(CONVERT_PRICES_CHECKBOX_ID);
        const targetCurrencySelect = document.getElementById(TARGET_CURRENCY_SELECT_ID);

        const state = getLengthFilterState();
        minInput.value = state.min === '' ? '' : state.min;
        maxInput.value = state.max === '' ? '' : state.max;
        compoundCheckbox.checked = getHideCompoundTldsState();
        aftermarketCheckbox.checked = getHideAftermarketState();
        inlinePricesCheckbox.checked = getInlineRenewalPricesState();
        convertPricesCheckbox.checked = getConvertVisiblePricesState();
        targetCurrencySelect.value = getTargetCurrencyState();

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
            scheduleRefresh();
        });

        maxInput.addEventListener('input', () =>
        {
            const min = parseInputValue(minInput.value);
            const max = parseInputValue(maxInput.value);
            saveLengthFilterState(min, max);
            scheduleRefresh();
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
            scheduleRefresh();
        });

        compoundCheckbox.addEventListener('change', () =>
        {
            saveHideCompoundTldsState(compoundCheckbox.checked);
            scheduleRefresh();
        });

        aftermarketCheckbox.addEventListener('change', () =>
        {
            saveHideAftermarketState(aftermarketCheckbox.checked);
            scheduleRefresh();
        });

        inlinePricesCheckbox.addEventListener('change', () =>
        {
            saveInlineRenewalPricesState(inlinePricesCheckbox.checked);
            scheduleRefresh();
        });

        convertPricesCheckbox.addEventListener('change', () =>
        {
            saveConvertVisiblePricesState(convertPricesCheckbox.checked);
            scheduleRefresh();
        });

        targetCurrencySelect.addEventListener('change', () =>
        {
            saveTargetCurrencyState(targetCurrencySelect.value);
            scheduleRefresh();
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

    function autoExpandAllExtensions()
    {
        const candidates = Array.from(document.querySelectorAll('button, a'));

        for(const el of candidates)
        {
            const text = normalizeText(el.textContent || '');
            if(text.includes('show all extensions'))
            {
                if(el.dataset.pbAutoClicked !== '1')
                {
                    el.dataset.pbAutoClicked = '1';
                    el.click();
                }
                return;
            }
        }
    }

    function setFxStatus(text)
    {
        const el = document.getElementById(FX_STATUS_ID);
        if(el) el.textContent = text;
    }

    async function getConversionRate()
    {
        if(!getConvertVisiblePricesState())
        {
            setFxStatus('');
            return {
                currency: 'USD',
                rate: 1
            };
        }

        const requestToken = ++fxRequestToken;
        const targetCurrency = getTargetCurrencyState();
        setFxStatus('Loading ' + targetCurrency + ' rate...');

        if(targetCurrency === 'USD')
        {
            if(requestToken === fxRequestToken)
            {
                setFxStatus('Showing USD prices');
            }

            return {
                currency: 'USD',
                rate: 1
            };
        }

        try
        {
            const cached = getCachedFxRate(targetCurrency);
            if(cached !== null)
            {
                if(requestToken === fxRequestToken)
                {
                    setFxStatus('Showing ' + targetCurrency + ' prices');
                }

                return {
                    currency: targetCurrency,
                    rate: cached
                };
            }

            const response = await fetch(`https://api.frankfurter.dev/v2/rates?base=USD&quotes=${encodeURIComponent(targetCurrency)}`, {
                method: 'GET',
                credentials: 'omit',
                cache: 'no-store'
            });

            if(!response.ok)
            {
                throw new Error('HTTP ' + response.status);
            }

            const data = await response.json();
            if(!data || !data.rates || typeof data.rates[targetCurrency] !== 'number')
            {
                throw new Error('No rate');
            }

            const rate = data.rates[targetCurrency];
            setCachedFxRate(targetCurrency, rate);

            if(requestToken === fxRequestToken)
            {
                setFxStatus('Showing ' + targetCurrency + ' prices');
            }

            return {
                currency: targetCurrency,
                rate: rate
            };
        }
        catch(error)
        {
            if(requestToken === fxRequestToken)
            {
                setFxStatus('Conversion failed');
            }

            return {
                currency: 'USD',
                rate: 1
            };
        }
    }

    async function rebuildPrices()
    {
        captureBasePriceHtml();
        restoreBasePriceHtml();

        const inlinePricesEnabled = getInlineRenewalPricesState();
        const convertPricesEnabled = getConvertVisiblePricesState();

        if(!inlinePricesEnabled && !convertPricesEnabled)
        {
            setFxStatus('');
            return;
        }

        const conversion = await getConversionRate();

        getPriceContainers().forEach(container =>
        {
            if(container.dataset.pbBaseHtml === undefined) return;

            const model = extractPriceModel(container);
            if(!model) return;

            container.innerHTML = buildRenderedPriceHtml(
                model,
                conversion.currency,
                conversion.rate,
                inlinePricesEnabled
            );
        });
    }

    function refreshNow()
    {
        if(refreshRunning) return;

        refreshRunning = true;

        Promise.resolve().then(async () =>
        {
            try
            {
                ensureOverlay();
                autoExpandAllExtensions();
                filterMainRows();
                filterSidebarCards();
                cleanupExplicitEmptyRows();
                await rebuildPrices();
            }
            finally
            {
                refreshRunning = false;
            }
        });
    }

    function scheduleRefresh()
    {
        if(refreshTimer !== null)
        {
            clearTimeout(refreshTimer);
        }

        refreshTimer = setTimeout(() =>
        {
            refreshTimer = null;
            refreshNow();
        }, 150);
    }

    function observe()
    {
        const observer = new MutationObserver(() =>
        {
            scheduleRefresh();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function init()
    {
        injectStyle();
        refreshNow();
        observe();

        window.addEventListener('load', () =>
        {
            scheduleRefresh();
        });

        window.addEventListener('pageshow', () =>
        {
            scheduleRefresh();
        });

        setInterval(() =>
        {
            scheduleRefresh();
        }, 2500);
    }

    init();
})();
