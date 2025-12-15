// ==UserScript==
// @name         Fluz Bank Balance
// @namespace    fluz_balance
// @version      1.9.0
// @description  Show Fluz Bank Balance in table and dropdown with account management
// @author       GammaExpansion
// @match        https://fluz.app/*
// @grant        none
// @icon         https://fluz.099.im/favicon.png
// @downloadURL  https://raw.githubusercontent.com/GammaExpansion/FluzAccountBalance/main/script.user.js
// @updateURL    https://raw.githubusercontent.com/GammaExpansion/FluzAccountBalance/main/script.user.js
// @run-at       document-end
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    /**
     * Checks if current URL is the manage-money page.
     */
    function isOnManageMoneyPage() {
        return window.location.pathname.startsWith('/manage-money');
    }

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
            "bank_account_id": option.bank_account_id,
            "bank_institution_auth_id": option.bank_institution_auth_id,
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
    * LocalStorage key for table expansion state.
    */
    const STORAGE_KEY = 'fluz_account_table_expanded';

    /**
    * Gets the saved expansion state from localStorage.
    * @returns {boolean} - True if expanded, false if collapsed. Defaults to true.
    */
    function getExpansionState() {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved === null ? true : saved === 'true';
    }

    /**
    * Saves the expansion state to localStorage.
    * @param {boolean} isExpanded - Whether the table is expanded.
    */
    function setExpansionState(isExpanded) {
        localStorage.setItem(STORAGE_KEY, isExpanded.toString());
    }

    /**
    * Toggles the expansion state of the account table.
    */
    function toggleAccountTable() {
        const content = document.getElementById('fluz-account-content');
        const icon = document.getElementById('fluz-expand-icon');

        if (!content || !icon) return;

        const isCurrentlyExpanded = content.style.display !== 'none';
        const newState = !isCurrentlyExpanded;

        content.style.display = newState ? 'flex' : 'none';
        icon.textContent = newState ? '▼' : '▶';

        setExpansionState(newState);
    }

    /**
    * Removes/disconnects a bank account from Fluz.
    * @param {string} bankInstitutionAuthId - The bank institution auth ID.
    * @param {string} bankAccountId - The bank account ID.
    * @param {string} accountName - The account name for confirmation dialog.
    */
    async function removeAccount(bankInstitutionAuthId, bankAccountId, accountName) {
        const confirmed = confirm(`Are you sure you want to disconnect "${accountName.trim()}"?\n\nThis will remove the account from Fluz.`);
        if (!confirmed) return;

        const button = document.querySelector(`[data-account-id="${bankAccountId}"]`);
        if (button) {
            button.disabled = true;
            button.textContent = '...';
        }

        try {
            const response = await fetch(
                `https://fluz.app/payment-methods/connected-accounts/removePlaidInstitution/${bankInstitutionAuthId}/${bankAccountId}.data`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ bankInstitutionId: bankAccountId }),
                    credentials: 'include'
                }
            );

            if (response.ok || response.status === 202) {
                // Remove the card from UI
                const card = document.getElementById(`fluz-account-card-${bankAccountId}`);
                if (card) {
                    card.style.transition = 'opacity 0.3s, transform 0.3s';
                    card.style.opacity = '0';
                    card.style.transform = 'translateX(-20px)';
                    setTimeout(() => card.remove(), 300);
                }

                // Reload the page after a short delay to refresh data
                setTimeout(() => {
                    window.location.reload();
                }, 500);
            } else {
                throw new Error(`Failed to remove account: ${response.status}`);
            }
        } catch (error) {
            console.error('Error removing account:', error);
            alert('Failed to disconnect account. Please try again or use the Fluz app.');
            if (button) {
                button.disabled = false;
                button.textContent = 'X';
            }
        }
    }

    /**
    * Adds balance information to dropdown menu options.
    * @param {Array} accountData - The array of account objects with balance info.
    */
    function enhanceDropdownWithBalances(accountData) {
        // Find all dropdown options
        const dropdownOptions = document.querySelectorAll('.options .option');

        dropdownOptions.forEach((option) => {
            // Check if this is a bank account option (NO FEE badge)
            const badge = option.querySelector('.fluz-badges .title');
            const isBankAccount = badge && badge.textContent.trim() === 'NO FEE';

            if (!isBankAccount) return;

            // Get the label text
            const label = option.querySelector('.content .label');
            if (!label) return;

            const labelText = label.textContent.trim();

            // Find matching account by comparing the full account name
            // The dropdown label matches the account.name field exactly
            const matchingAccount = accountData.find(account => {
                return account.name.trim() === labelText;
            });

            if (!matchingAccount) return;

            // Check if subline already exists (don't duplicate)
            const existingSubline = option.querySelector('.content .subline');
            if (existingSubline && existingSubline.classList.contains('fluz-balance-info')) return;

            // Create and add the subline with balance info
            const subline = document.createElement('p');
            subline.className = 'subline fluz-balance-info';
            subline.style.cssText = 'margin: 4px 0 0 0; font-size: 0.85em; color: #666;';
            subline.textContent = `Balance: ${formatCurrency(matchingAccount.last_recorded_balance)} | Pending: ${formatCurrency(matchingAccount.pending_transactions)} | Available: ${formatCurrency(matchingAccount.available_spend_power)}`;

            const content = option.querySelector('.content');
            if (content) {
                content.appendChild(subline);
            }
        });
    }

    /**
    * Takes the account data and returns card-based HTML for narrow layouts.
    * @param {Array} data - The array of account objects.
    * @param {boolean} isExpanded - Whether the table should be expanded initially.
    * @returns {string} - The HTML string.
    */
    function createAccountTableHtml(data, isExpanded) {
        const arrowIcon = isExpanded ? '▼' : '▶';
        const contentDisplay = isExpanded ? 'flex' : 'none';

        let htmlString = `
            <div id="fluz-account-header" style="display: flex; align-items: center; justify-content: space-between; margin: 16px 0 10px 0; cursor: pointer; user-select: none; padding: 8px; border-radius: 6px; transition: background-color 0.2s;">
                <h3 style="margin: 0; font-size: 18px; font-weight: 600;">Account Summary</h3>
                <span id="fluz-expand-icon" style="font-size: 14px; color: #666; transition: transform 0.2s;">${arrowIcon}</span>
            </div>
        `;
        htmlString += `<div id="fluz-account-content" style="display: ${contentDisplay}; flex-direction: column; gap: 8px;">`;

        // Create a card for each account
        data.forEach(account => {
            htmlString += `
                <div id="fluz-account-card-${account.bank_account_id}" style="background: white; border-radius: 6px; padding: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.08); border: 1px solid #E7E5E4; position: relative;">
                    <button
                        class="fluz-remove-btn"
                        data-account-id="${account.bank_account_id}"
                        data-auth-id="${account.bank_institution_auth_id}"
                        data-account-name="${account.name.replace(/"/g, '&quot;')}"
                        style="position: absolute; top: 8px; right: 8px; width: 20px; height: 20px; border-radius: 50%; border: 1px solid #E7E5E4; background: #fff; color: #787571; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; line-height: 1; transition: all 0.2s;"
                        title="Disconnect account"
                    >X</button>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; padding-right: 24px;">
                        <div style="font-weight: 600; font-size: 14px; color: #1A0000; line-height: 1.3;">${account.institution_name}</div>
                        <div style="font-weight: 600; font-size: 14px; color: #1A0000; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${account.name.trim()}</div>
                    </div>
                    <div style="display: flex; justify-content: space-between; gap: 10px; font-size: 13px;">
                        <div style="flex: 1; min-width: 0;">
                            <div style="color: #787571; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 3px;">Bal</div>
                            <div style="font-weight: 600; color: #1A0000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${formatCurrency(account.last_recorded_balance)}</div>
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="color: #787571; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 3px;">Pend</div>
                            <div style="font-weight: 600; color: #1A0000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${formatCurrency(account.pending_transactions)}</div>
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="color: #787571; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 3px;">Avail</div>
                            <div style="font-weight: 600; color: #10B981; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${formatCurrency(account.available_spend_power)}</div>
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="color: #787571; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 3px;">Final</div>
                            <div style="font-weight: 600; color: #10B981; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${formatCurrency(account.final_spend_power)}</div>
                        </div>
                    </div>
                </div>
            `;
        });

        htmlString += '</div>';
        return htmlString;
    }

    // Main script logic
    let fundingSourceOptions = null;
    let lastUrl = window.location.href;

    const checkInterval = setInterval(() => {
        // Detect URL changes (SPA navigation)
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            // Reset state when navigating
            fundingSourceOptions = null;
            const existingSheet = document.querySelector('._fluz_balance_sheet');
            if (existingSheet) {
                existingSheet.remove();
            }
        }

        // Only run on manage-money page
        if (!isOnManageMoneyPage()) {
            return;
        }

        // Safely check for required DOM elements
        const fundingWrapper = document.querySelectorAll('[class*="_funding-wrapper"]')[1];
        const depositStepsElement = document.querySelector('[class*="_prepayment-title"]');

        if (!fundingWrapper || !depositStepsElement) {
            return; // Elements not ready yet
        }

        const depositSteps = depositStepsElement.parentElement;
        if (!depositSteps) {
            return; // Parent element not available
        }

        const reactProps = findReactProps(fundingWrapper);
        if (!reactProps || !reactProps.children || !reactProps.children.props) {
            return; // React props not ready yet
        }

        const props = reactProps.children.props;
        let fundingPropsAvailable = !!props;
        let fluzBalanceSheetRendered = !!document.querySelector('[class="_fluz_balance_sheet"]');

        // Render table once
        if (fundingPropsAvailable && !fluzBalanceSheetRendered) {
            try {
                // Get funding source from React Props.
                fundingSourceOptions = parseFundingSourceOptions(props.options);

                // Get saved expansion state
                const isExpanded = getExpansionState();

                // Render table with funding options.
                let table = document.createElement('div');
                table.className = '_fluz_balance_sheet';
                table.innerHTML = createAccountTableHtml(fundingSourceOptions, isExpanded);
                depositSteps.appendChild(table);

                // Attach click handler to header
                const header = document.getElementById('fluz-account-header');
                if (header) {
                    header.addEventListener('click', toggleAccountTable);
                    // Add hover effect
                    header.addEventListener('mouseenter', () => {
                        header.style.backgroundColor = 'rgba(0, 0, 0, 0.03)';
                    });
                    header.addEventListener('mouseleave', () => {
                        header.style.backgroundColor = 'transparent';
                    });
                }

                // Attach click handlers to remove buttons
                const removeButtons = document.querySelectorAll('.fluz-remove-btn');
                removeButtons.forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const accountId = btn.getAttribute('data-account-id');
                        const authId = btn.getAttribute('data-auth-id');
                        const accountName = btn.getAttribute('data-account-name');
                        removeAccount(authId, accountId, accountName);
                    });
                    // Add hover effect
                    btn.addEventListener('mouseenter', () => {
                        btn.style.backgroundColor = '#FEE2E2';
                        btn.style.borderColor = '#EF4444';
                        btn.style.color = '#EF4444';
                    });
                    btn.addEventListener('mouseleave', () => {
                        btn.style.backgroundColor = '#fff';
                        btn.style.borderColor = '#E7E5E4';
                        btn.style.color = '#787571';
                    });
                });

            } catch (error) {
                console.error('Userscript error:', error);
            }
        }

        // Enhance dropdown with balance info whenever it's visible and has bank accounts
        if (fundingSourceOptions) {
            try {
                // Look for ALL open dropdowns and check each one
                const allOpenDropdowns = document.querySelectorAll('.options.open');

                allOpenDropdowns.forEach((dropdownOptions) => {
                    // Only process dropdowns that have fluz-badges (funding source dropdowns)
                    const allBadges = dropdownOptions.querySelectorAll('.fluz-badges');

                    if (allBadges.length === 0) {
                        return; // Not a funding source dropdown
                    }

                    // Check if any bank account options exist and haven't been enhanced yet
                    const unenhancedBankAccounts = dropdownOptions.querySelectorAll('.option .fluz-badges .title');

                    const hasUnenhanced = Array.from(unenhancedBankAccounts).some(badge => {
                        const isNoFee = badge.textContent.trim() === 'NO FEE';
                        const hasBalanceInfo = badge.closest('.option').querySelector('.fluz-balance-info');
                        return isNoFee && !hasBalanceInfo;
                    });

                    if (hasUnenhanced) {
                        enhanceDropdownWithBalances(fundingSourceOptions);
                    }
                });
            } catch (error) {
                console.error('Userscript dropdown enhancement error:', error);
            }
        }
    }, 1000); // Check every 1s
})();
