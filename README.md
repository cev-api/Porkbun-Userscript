# Porkbun Search Filter Userscript

Tampermonkey userscript for cleaning up Porkbun search results.

## Features

- hides sold, unavailable, and error results
- hides inquire-only results
- hides compound TLDs like `example.uk.com`
- hides aftermarket results
- filters by TLD length
- can format renewal pricing inline
- can convert displayed USD prices to another currency
- auto-clicks `Show All Extensions`

## Also included

This project also has a separate minimal script that only removes sold, unavailable, and error results, without the extra filtering or UI features.

## Supported pages

- `https://porkbun.com/checkout/search*`
- `https://www.porkbun.com/checkout/search*`

## Install

1. Install Tampermonkey.
2. Create a new userscript.
3. Paste in the script.
4. Save.

## Use

A filter panel appears on the page with:

- min/max TLD length
- hide compound TLDs
- hide aftermarket results
- inline renewal prices
- displayed currency conversion

## Notes

- currency conversion is display-only
- final pricing and checkout are still Porkbun's
- the script may need updates if Porkbun changes their page structure
