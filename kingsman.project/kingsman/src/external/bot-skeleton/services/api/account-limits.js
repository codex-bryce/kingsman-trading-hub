export default class AccountLimits {
  constructor(store) {
    this.store = store;
  }
  // eslint-disable-next-line default-param-last
  getStakePayoutLimits(
    currency = "AUD",
    landing_company_shortcode = "svg",
    selected_market,
  ) {
    const normalized_shortcode = landing_company_shortcode || "svg";
    if (!selected_market) {
      return Promise.resolve({});
    }

    return this.store.ws
      .send({
        landing_company_details: normalized_shortcode,
      })
      .then((landing_company) => {
        const currency_configs =
          landing_company?.landing_company_details?.currency_config || {};
        const currency_config =
          currency_configs[selected_market] ||
          currency_configs.synthetic_index ||
          {};
        return currency_config?.[currency] || currency_config?.USD || {};
      })
      .catch((error) => {
        console.warn(
          "[AccountLimits] Unable to fetch stake/payout limits on the current socket.",
          {
            landing_company_shortcode: normalized_shortcode,
            selected_market,
            error_code: error?.error?.code,
            error_message: error?.error?.message || error?.message,
          },
        );
        return {};
      });
  }
}
