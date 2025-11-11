// ==UserScript==
// @name         Fluz Bank Balance
// @namespace    fluz_balance
// @version      1.0.3
// @description  Show Fluz Bank Balance
// @author       GammaExpansion
// @match        https://fluz.app/manage-money*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addElement
// @icon         https://fluz.099.im/favicon.png
// @downloadURL  https://raw.githubusercontent.com/GammaExpansion/FluzAccountBalance/main/script.user.js
// @updateURL    https://raw.githubusercontent.com/GammaExpansion/FluzAccountBalance/main/script.user.js
// @run-at       document-end
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    /**
     * Finds the React props for a given DOM element.
     */
    function findReactProps(element) {
        const propKey = Object.keys(element).find(key => key.startsWith('__reactProps$'));
        if (!propKey) {
            return null;
        }
        return element[propKey];
    }

    /**
     * Parse funding source options into readable dictionary.
     */
    function parseFundingSourceOptions(options) {
        return options.filter(
            (option) => option.type == "BANK_ACCOUNT"
        ).flatMap((option) => ({
            "institution_name": option.bank_institution_auth.platform_institution_name,
            "name": option.name,
            "final_spend_power": option.spend_power.final_spend_power,
            "available_spend_power": option.spend_power.spend_power.available_spend_power,
            "last_recorded_balance": option.spend_power.spend_power.last_recorded_balance,
            "pending_transactions": option.spend_power.spend_power.pending_transactions,
            "spend_power": option.spend_power.spend_power.spend_power
        }))
    }

    /**
    * Formats a number as USD currency.
    * @param {number} number - The number to format.
    * @returns {string} - The formatted currency string.
    */
    function formatCurrency(number) {
        // A simple polyfill in case Intl is not available
        if (typeof Intl !== 'undefined' && typeof Intl.NumberFormat !== 'undefined') {
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
            }).format(number);
        } else {
            // Fallback for older environments
            return '$' + number.toFixed(2);
        }
    }

    /**
    * Takes the account data and returns an HTML table as a string.
    * @param {Array} data - The array of account objects.
    * @returns {string} - The HTML table string.
    */
    function createAccountTableHtml(data) {
        // Start the table and add the header row
        let htmlString = '<h3>Account Summary</h3>';
        htmlString += '<table border="1" cellspacing="0" cellpadding="5">';
        htmlString += `
                <thead>
                    <tr>
                        <th>Institution</th>
                        <th>Account</th>
                        <th>Available</th>
                        <th>Pending</th>
                        <th>Total Balance</th>
                        <th>Final Spend Power</th>
                    </tr>
                </thead>
            `;

        // Add the table body
        htmlString += '<tbody>';

        // Loop through each account and create a table row
        data.forEach(account => {
            htmlString += `
                    <tr>
                        <td>${account.institution_name}</td>
                        <td>${account.name.trim()}</td>
                        <td>${formatCurrency(account.available_spend_power)}</td>
                        <td>${formatCurrency(account.pending_transactions)}</td>
                        <td>${formatCurrency(account.last_recorded_balance)}</td>
                        <td>${formatCurrency(account.final_spend_power)}</td>
                    </tr>
                `;
        });

        // Close the table body and table tags
        htmlString += '</tbody>';
        htmlString += '</table>';

        return htmlString;
    }

    // Main script logic
    const checkInterval = setInterval(() => {
        const fundingWrapper = document.querySelectorAll('[class*="_funding-wrapper"]')[1];
        const depositSteps = document.querySelector('[class*="_prepayment-title"]').parentElement;

        const props = findReactProps(fundingWrapper).children.props;

        let fundingPropsAvailable = !!props;
        let fluzBalanceSheetRendered = !!document.querySelector('[class="_fluz_balance_sheet"]');
        if (fundingPropsAvailable && !fluzBalanceSheetRendered) {
            try {
                // Get funding source from React Props.
                let fundingSourceOptions = parseFundingSourceOptions(props.options);

                // Render table with funding options.
                let table = document.createElement('div');
                table.className = '_fluz_balance_sheet';
                table.innerHTML = createAccountTableHtml(fundingSourceOptions);
                depositSteps.appendChild(table);

            } catch (error) {
                console.error('Userscript error:', error);
            }
        }
    }, 1000); // Check every 1s
})();
