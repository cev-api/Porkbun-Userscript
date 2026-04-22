// ==UserScript==
// @name         Porkbun - Hide sold/unavailable/error results
// @namespace    https://tampermonkey.net/
// @version      1.3
// @description  Hides unavailable, sold, error, and inquire-only results on Porkbun search pages.
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

    function hideElement(element)
    {
        if(element) element.classList.add(HIDE_CLASS);
    }

    function showElement(element)
    {
        if(element) element.classList.remove(HIDE_CLASS);
    }

    function filterMainRows()
    {
        getMainRows().forEach(row =>
        {
            if(mainRowShouldHide(row))
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
            if(sidebarCardShouldHide(card))
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
        filterAll();
        observe();

        window.addEventListener('load', filterAll);
        window.addEventListener('pageshow', filterAll);

        setInterval(filterAll, 1000);
    }

    init();
})();
