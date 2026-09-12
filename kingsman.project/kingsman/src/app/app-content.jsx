import React, { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { ToastContainer } from 'react-toastify';
import AuthLoadingWrapper from '@/components/auth-loading-wrapper';
import useLiveChat from '@/components/chat/useLiveChat';
import { BOT_RESTRICTED_COUNTRIES_LIST } from '@/components/layout/header/utils';
import ChunkLoader from '@/components/loader/chunk-loader';
import { getUrlBase } from '@/components/shared';
import TncStatusUpdateModal from '@/components/tnc-status-update-modal';
import TransactionDetailsModal from '@/components/transaction-details';
import { api_base, ApiHelpers, ServerTime } from '@/external/bot-skeleton';
import { V2GetActiveToken } from '@/external/bot-skeleton/services/api/appId';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { useApiBase } from '@/hooks/useApiBase';
import useIntercom from '@/hooks/useIntercom';
import { useStore } from '@/hooks/useStore';
import useThemeSwitcher from '@/hooks/useThemeSwitcher';
import useTrackjs from '@/hooks/useTrackjs';
import initDatadog from '@/utils/datadog';
import { isOAuthSessionActive } from '@/utils/deriv-oauth';
import initHotjar from '@/utils/hotjar';
import { setSmartChartsPublicPath } from '@deriv/deriv-charts';
import { ThemeProvider } from '@deriv-com/quill-ui';
import { localize } from '@deriv-com/translations';
import Audio from '../components/audio';
import BlocklyLoading from '../components/blockly-loading';
import BotStopped from '../components/bot-stopped';
import AiScanner from '../components/ai-scanner';
import RiskDisclaimer from '../components/risk-disclaimer';
import BotBuilder from '../pages/bot-builder';
import Main from '../pages/main';
import './app.scss';
import 'react-toastify/dist/ReactToastify.css';
import '../components/bot-notification/bot-notification.scss';

const ACTIVE_SYMBOLS_TIMEOUT_MS = 15000;
const ACTIVE_SYMBOLS_POLL_INTERVAL_MS = 500;
const ACTIVE_SYMBOLS_POLL_TIMEOUT_MS = 10000;

const AppContent = observer(() => {
    const [is_api_initialized, setIsApiInitialized] = React.useState(false);
    const [is_loading, setIsLoading] = React.useState(true);
    const [is_eu_error_loading, setIsEuErrorLoading] = React.useState(true);
    const store = useStore();
    const { app, transactions, common, client } = store;
    const { showDigitalOptionsMaltainvestError } = app;
    const { is_dark_mode_on } = useThemeSwitcher();

    const { recovered_transactions, recoverPendingContracts } = transactions;
    const is_subscribed_to_msg_listener = React.useRef(false);
    const msg_listener = React.useRef(null);
    const { connectionStatus } = useApiBase();
    const { initTrackJS } = useTrackjs();
    const is_oauth_session = isOAuthSessionActive(localStorage.getItem('authToken'));

    React.useEffect(() => {
        initTrackJS(client.loginid);
    }, [client.loginid, initTrackJS]);

    const livechat_client_information = {
        is_client_store_initialized: client?.is_logged_in ? !!client?.account_settings?.email : !!client,
        is_logged_in: client?.is_logged_in,
        loginid: client?.loginid,
        landing_company_shortcode: client?.landing_company_shortcode,
        currency: client?.currency,
        residence: client?.residence,
        email: client?.account_settings?.email,
        first_name: client?.account_settings?.first_name,
        last_name: client?.account_settings?.last_name,
    };

    useLiveChat(livechat_client_information);

    const token = V2GetActiveToken() ?? null;
    useIntercom(token);

    useEffect(() => {
        if (connectionStatus === CONNECTION_STATUS.OPENED) {
            setIsApiInitialized(true);
            common.setSocketOpened(true);
        } else if (connectionStatus !== CONNECTION_STATUS.OPENED) {
            common.setSocketOpened(false);
        }
    }, [common, connectionStatus]);

    const { current_language } = common;
    const html = document.documentElement;
    React.useEffect(() => {
        html?.setAttribute('lang', current_language.toLowerCase());
        html?.setAttribute('dir', current_language.toLowerCase() === 'ar' ? 'rtl' : 'ltr');
    }, [current_language, html]);

    // Check for EU client error early
    const is_eu_country = client?.is_eu_country;
    const clients_logged_out_country_code = client?.clients_country;
    const clients_logged_in_country_code = client?.account_settings?.country_code;
    const is_client_logged_in = client?.is_logged_in;

    useEffect(() => {
        const bot_restricted_countries = BOT_RESTRICTED_COUNTRIES_LIST();

        if (!client.is_logged_in) {
            // For logged out users
            if (clients_logged_out_country_code) {
                const is_restricted = !!bot_restricted_countries[clients_logged_out_country_code];
                setIsEuErrorLoading(client.is_eu_country && is_restricted);
            }
        } else {
            // For logged in users
            if (clients_logged_in_country_code) {
                const is_restricted = !!bot_restricted_countries[clients_logged_in_country_code];
                setIsEuErrorLoading(is_restricted);
            }
        }
    }, [is_eu_country, clients_logged_out_country_code, clients_logged_in_country_code, is_client_logged_in]);

    const handleMessage = React.useCallback(
        ({ data }) => {
            if (data?.msg_type === 'proposal_open_contract' && !data?.error) {
                const { proposal_open_contract } = data;
                if (
                    proposal_open_contract?.status !== 'open' &&
                    !recovered_transactions?.includes(proposal_open_contract?.contract_id)
                ) {
                    recoverPendingContracts(proposal_open_contract);
                }
            }
        },
        [recovered_transactions, recoverPendingContracts]
    );

    React.useEffect(() => {
        setSmartChartsPublicPath(getUrlBase('/js/smartcharts/'));
    }, []);

    React.useEffect(() => {
        // Check if api is initialized and then subscribe to the api messages
        // Also we should only subscribe to the messages once user is logged in
        // And is not already subscribed to the messages
        if (!is_subscribed_to_msg_listener.current && client.is_logged_in && is_api_initialized && api_base?.api) {
            is_subscribed_to_msg_listener.current = true;
            msg_listener.current = api_base.api.onMessage()?.subscribe(handleMessage);
        }
        return () => {
            if (is_subscribed_to_msg_listener.current && msg_listener.current) {
                is_subscribed_to_msg_listener.current = false;
                msg_listener.current.unsubscribe?.();
            }
        };
    }, [is_api_initialized, client.is_logged_in, client.loginid, handleMessage, connectionStatus]);

    React.useEffect(() => {
        showDigitalOptionsMaltainvestError(client, common);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client.is_options_blocked, client.account_settings?.country_code, client.clients_country]);

    const showInitializationError = React.useCallback(
        (error?: unknown) => {
            // Market data can be temporarily unavailable while the app shell and
            // account flows remain usable (especially before the user logs in).
            console.warn('Active symbols initialization failed:', error);
            setIsLoading(false);
        },
        []
    );

    const init = () => {
        ServerTime.init(common);
        app.setDBotEngineStores();
        ApiHelpers.setInstance(app.api_helpers_store);
        import('@/utils/gtm').then(({ default: GTM }) => {
            GTM.init(store);
        });
    };

    const changeActiveSymbolLoadingState = React.useCallback(() => {
        init();
        let is_cancelled = false;
        let intervalId;

        const clearBootstrapInterval = () => {
            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }
        };

        const finishLoading = () => {
            clearBootstrapInterval();
            if (!is_cancelled) {
                setIsLoading(false);
            }
        };

        const failLoading = (error?: unknown) => {
            clearBootstrapInterval();
            if (!is_cancelled) {
                showInitializationError(error);
            }
        };

        const retrieveActiveSymbols = async () => {
            try {
                const { active_symbols } = ApiHelpers.instance || {};

                if (!active_symbols) {
                    throw new Error('Active symbols service is unavailable.');
                }

                await Promise.race([
                    active_symbols.retrieveActiveSymbols(true),
                    new Promise((_, reject) => {
                        setTimeout(() => {
                            reject(new Error('Timed out while retrieving active symbols.'));
                        }, ACTIVE_SYMBOLS_TIMEOUT_MS);
                    }),
                ]);

                finishLoading();
            } catch (error) {
                failLoading(error);
            }
        };

        if (ApiHelpers?.instance?.active_symbols) {
            void retrieveActiveSymbols();
        } else {
            // This is a workaround to fix the issue where the active symbols are not loaded immediately
            // when the API is initialized. Should be replaced with RxJS pubsub
            const startedAt = Date.now();
            intervalId = setInterval(() => {
                if (ApiHelpers?.instance?.active_symbols) {
                    clearBootstrapInterval();
                    void retrieveActiveSymbols();
                } else if (Date.now() - startedAt >= ACTIVE_SYMBOLS_POLL_TIMEOUT_MS) {
                    failLoading(new Error('Active symbols service did not initialize in time.'));
                }
            }, ACTIVE_SYMBOLS_POLL_INTERVAL_MS);
        }

        return () => {
            is_cancelled = true;
            clearBootstrapInterval();
        };
    }, [app.api_helpers_store, common, showInitializationError, store]);

    React.useEffect(() => {
        if (is_api_initialized) {
            setIsLoading(true);
            if (!client.is_logged_in) {
                return changeActiveSymbolLoadingState();
            }
            init();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [is_api_initialized]);

    // use is_landing_company_loaded to know got details of accounts to identify should show an error or not
    React.useEffect(() => {
        // OAuth sessions can be fully authenticated on the fallback socket without ever
        // hydrating landing company details, so don't block the entire app on that flag.
        if (client.is_logged_in && (client.is_landing_company_loaded || is_oauth_session) && is_api_initialized) {
            return changeActiveSymbolLoadingState();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client.is_landing_company_loaded, is_api_initialized, client.loginid, is_oauth_session]);

    useEffect(() => {
        initDatadog(true);
        if (client) {
            initHotjar(client);
        }
    }, []);

    if (common?.error) return null;

    return is_loading ? (
        <ChunkLoader message={is_eu_error_loading ? '' : localize('Initializing KingsmanTradingHub account...')} />
    ) : (
        <AuthLoadingWrapper>
            <ThemeProvider theme={is_dark_mode_on ? 'dark' : 'light'}>
                <BlocklyLoading />
                <div className='bot-dashboard bot' data-testid='dt_bot_dashboard'>
                    <Audio />
                    <Main />
                    <BotBuilder />
                    <BotStopped />
                    <TransactionDetailsModal />
                    <ToastContainer limit={3} draggable={false} />
                    <TncStatusUpdateModal />
                    <RiskDisclaimer />
                    <AiScanner />
                </div>
            </ThemeProvider>
        </AuthLoadingWrapper>
    );
});

export default AppContent;
