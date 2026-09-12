/**
 * Public Store Configuration
 *
 * This file contains non-secret storefront display settings synced from
 * WooCommerce. It is safe to commit to GitHub. Keep API keys, payment secrets,
 * and access tokens in .env or deployment environment variables.
 */

export type StoreCurrencyPosition = 'left' | 'right' | 'left_space' | 'right_space';

export interface StoreConfig {
    currency: string;
    currencySymbol: string;
    currencyPosition: StoreCurrencyPosition;
    currencyDecimalSeparator: string;
    currencyThousandSeparator: string;
    currencyMinorUnit: number;
}

export const storeConfig: StoreConfig = {
    currency: 'USD',
    currencySymbol: '$',
    currencyPosition: 'left',
    currencyDecimalSeparator: '.',
    currencyThousandSeparator: ',',
    currencyMinorUnit: 2,
};

export function formatStorePrice(price: number, config: StoreConfig = storeConfig): string {
    if (!Number.isFinite(price)) return '';

    const minorUnit = Number.isFinite(config.currencyMinorUnit) ? config.currencyMinorUnit : 2;
    const fixed = price.toFixed(minorUnit);
    const [integerPart, fractionPart] = fixed.split('.');
    const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, config.currencyThousandSeparator || ',');
    const amount = minorUnit > 0 && fractionPart !== undefined
        ? groupedInteger + (config.currencyDecimalSeparator || '.') + fractionPart
        : groupedInteger;

    const symbol = config.currencySymbol || config.currency;
    switch (config.currencyPosition) {
        case 'right':
            return amount + symbol;
        case 'right_space':
            return amount + ' ' + symbol;
        case 'left_space':
            return symbol + ' ' + amount;
        case 'left':
        default:
            return symbol + amount;
    }
}
