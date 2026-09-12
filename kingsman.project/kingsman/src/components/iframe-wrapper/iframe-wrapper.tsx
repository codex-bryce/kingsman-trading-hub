import React, { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import "./iframe-wrapper.scss";
import {
  V2GetActiveToken,
  V2GetActiveClientId,
} from "@/external/bot-skeleton/services/api/appId";
import { CLIENT_ID, getAppId } from "@/components/shared/utils/config/config";
import { useStore } from "@/hooks/useStore";
import { contract_stages } from "@/constants/contract-stage";
import { isOAuthSessionActive } from "@/utils/deriv-oauth";

interface IframeWrapperProps {
  src: string;
  title: string;
  className?: string;
}

const IframeWrapper: React.FC<IframeWrapperProps> = observer(
  ({ src, title, className = "" }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [hasError, setHasError] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const { transactions, run_panel, client } = useStore();

    useEffect(() => {
      const iframe = iframeRef.current;
      if (!iframe) return;

      // Verify stores are available
      if (!transactions || !run_panel) {
      } else {
      }

      // Send auth token to iframe the same way for all account types
      const sendAuthData = () => {
        const token = V2GetActiveToken();
        const loginid = V2GetActiveClientId();
        const appId = getAppId();
        const is_oauth =
          isOAuthSessionActive(token) || token?.startsWith?.("ory_");

        if (token && loginid && iframe.contentWindow) {
          try {
            iframe.contentWindow.postMessage(
              {
                type: "AUTH_TOKEN",
                token,
                authToken: token,
                loginid,
                loginId: loginid,
                appId,
                app_id: appId,
                clientId: CLIENT_ID,
                client_id: CLIENT_ID,
                auth_mode: is_oauth ? "oauth" : "legacy",
                authMode: is_oauth ? "oauth" : "legacy",
                is_oauth,
                isOAuth: is_oauth,
                timestamp: Date.now(),
              },
              "*",
            );
          } catch (error) {}
        } else {
        }
      };

      // Listen for messages from iframe (auth requests and trade events)
      const handleMessage = (event: MessageEvent) => {
        // Security: Optionally validate event.origin
        // if (event.origin !== 'https://hyperbot-indol.vercel.app') return;

        // Debug: Log all messages from iframe
        if (event.data && event.data.type) {
        }

        if (!event.data || !event.data.type) return;

        // Handle auth requests
        if (event.data.type === "REQUEST_AUTH") {
          sendAuthData();
          return;
        }

        // Handle trade events from Hyperbot iframe
        if (
          event.data.type === "TRADE_PLACED" ||
          event.data.type === "CONTRACT_EVENT"
        ) {
          const tradeData = event.data;

          // Initialize run panel on first trade (like other bots do)
          if (run_panel && !run_panel.run_id) {
            // Generate run_id based on title (e.g., "Hyperbot" -> "hyperbot", "Diffbot" -> "diffbot")
            const botName = title.toLowerCase().replace(/\s+/g, "");
            run_panel.run_id = `${botName}-${Date.now()}`;
            run_panel.setIsRunning(true);
            run_panel.setContractStage(contract_stages.STARTING);
          }

          // Add to transactions panel
          if (transactions?.onBotContractEvent && tradeData.contract_id) {
            try {
              const contractData = {
                contract_id: tradeData.contract_id,
                transaction_ids: {
                  buy: tradeData.transaction_id || tradeData.buy_transaction_id,
                },
                buy_price: tradeData.buy_price || tradeData.price || 0,
                currency: tradeData.currency || client?.currency || "USD",
                contract_type:
                  tradeData.contract_type ||
                  (title.toLowerCase().includes("matches")
                    ? "DIGITMATCH"
                    : title.toLowerCase().includes("diffbot")
                      ? "DIGITDIFF"
                      : title.toLowerCase().includes("speedbot")
                        ? "DIGITUNDER"
                        : "DIGITUNDER"), // Default based on bot type (SpeedBot can use DIGITUNDER, DIGITOVER, DIGITEVEN, DIGITODD, DIGITMATCH, DIGITDIFF)
                underlying: tradeData.underlying || tradeData.symbol || "",
                display_name:
                  tradeData.display_name ||
                  tradeData.underlying ||
                  tradeData.symbol ||
                  "",
                date_start:
                  tradeData.date_start || Math.floor(Date.now() / 1000),
                status: tradeData.status || "open",
              };

              transactions.onBotContractEvent(contractData);

              // Update run panel state
              if (run_panel) {
                run_panel.setHasOpenContract(true);
                run_panel.setContractStage(contract_stages.PURCHASE_SENT);
                // Open run panel drawer if not already open
                if (!run_panel.is_drawer_open) {
                  run_panel.toggleDrawer(true);
                }
                // Switch to transactions tab
                run_panel.setActiveTabIndex(1);
              }

              // Verify transaction was added
              setTimeout(() => {
                const transactionList = transactions?.transactions || [];
                const found = transactionList.find(
                  (t: any) => t.data?.contract_id === contractData.contract_id,
                );
                if (found) {
                } else {
                }
              }, 100);
            } catch (error) {}
          } else {
          }
          return;
        }

        // Handle contract updates (when trades complete)
        if (event.data.type === "CONTRACT_UPDATE") {
          const updateData = event.data;

          // The transactions store should automatically update when contract completes
          // But we can trigger a refresh if needed
          if (updateData.contract_id && transactions) {
            // The store will handle updates via contract subscriptions
            // This is mainly for logging
          }
          return;
        }
      };

      window.addEventListener("message", handleMessage);

      // Send auth data when iframe loads
      const handleLoad = () => {
        // Immediately set loading to false so iframe becomes interactive
        setIsLoading(false);
        setHasError(false);
        // Wait a bit for iframe to be ready
        setTimeout(() => {
          sendAuthData();
          // Ensure loading is false
          setIsLoading(false);
          // Check if iframe has content
          try {
            if (iframe.contentWindow) {
              // Check if iframe actually has content (not just blank)
              try {
                const iframeDoc =
                  iframe.contentDocument || iframe.contentWindow?.document;
                if (iframeDoc) {
                  const body = iframeDoc.body;
                  if (body && body.innerHTML.trim() === "") {
                  }
                }
              } catch (e) {
                // Cross-origin, can't access - this is normal
              }
            }
          } catch (e) {}
        }, 500);
      };

      // Handle iframe errors
      const handleError = () => {
        setIsLoading(false);
        setHasError(true);
      };

      // Check if iframe content is accessible (for X-Frame-Options detection)
      const checkIframeAccess = () => {
        try {
          // Try to access iframe content - if blocked, this will throw
          if (iframe.contentWindow) {
            // Iframe is accessible (cross-origin is normal)
            // Don't set loading to false here, wait for load event
          }
        } catch (e) {
          // Cross-origin or blocked - this is normal for cross-origin iframes
          // Still wait for load event
        }
      };

      // Monitor localStorage for auth token changes (login/logout)
      let lastToken = V2GetActiveToken();
      let lastLoginId = V2GetActiveClientId();

      const checkAuthChanges = () => {
        const currentToken = V2GetActiveToken();
        const currentLoginId = V2GetActiveClientId();

        // If token changed (login or logout), send immediately
        if (currentToken !== lastToken || currentLoginId !== lastLoginId) {
          lastToken = currentToken;
          lastLoginId = currentLoginId;
          sendAuthData();
        }
      };

      // Check for auth changes every 1 second
      const authCheckInterval = setInterval(checkAuthChanges, 1000);

      // Send auth data periodically (in case token changes)
      const intervalId = setInterval(() => {
        sendAuthData();
      }, 5000); // Every 5 seconds

      // Timeout to detect if iframe never loads
      const loadTimeout = setTimeout(() => {
        if (isLoading) {
          setIsLoading(false);
          // Don't set error yet, might still be loading
        }
      }, 10000); // 10 second timeout

      // Listen for iframe load
      iframe.addEventListener("load", handleLoad);
      iframe.addEventListener("error", handleError);

      // Test the URL to check if it's serving HTML or downloads
      fetch(src, { method: "HEAD", mode: "no-cors" })
        .then(() => {})
        .catch((err) => {});

      // Check access after a short delay
      setTimeout(checkIframeAccess, 2000);

      // Send initial auth data after a delay
      setTimeout(() => {
        sendAuthData();
      }, 1000);

      // Cleanup
      return () => {
        iframe.removeEventListener("load", handleLoad);
        iframe.removeEventListener("error", handleError);
        window.removeEventListener("message", handleMessage);
        clearInterval(intervalId);
        clearInterval(authCheckInterval);
        clearTimeout(loadTimeout);
      };
    }, [src, isLoading, title]);

    return (
      <div
        className={`iframe-wrapper ${className}`}
        style={{ pointerEvents: "auto", position: "relative" }}
      >
        {isLoading && !hasError && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              color: "var(--text-prominent)",
              fontSize: "1.4rem",
              zIndex: 100,
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            Loading {title}...
          </div>
        )}
        {hasError && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              color: "var(--text-prominent)",
              fontSize: "1.4rem",
              textAlign: "center",
              padding: "2rem",
              zIndex: 1000,
              backgroundColor: "var(--general-main-1)",
              borderRadius: "0.8rem",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            }}
          >
            <p style={{ fontWeight: "bold", marginBottom: "1rem" }}>
              Failed to load {title}
            </p>
            <p
              style={{
                fontSize: "1rem",
                marginTop: "1rem",
                color: "var(--text-less-prominent)",
                marginBottom: "1.5rem",
              }}
            >
              The external site may be blocking iframe embedding or serving
              downloads instead of HTML.
              <br />
              <br />
              <strong>Possible causes:</strong>
              <br />
              • X-Frame-Options header blocking embedding
              <br />
              • Content-Type header causing downloads
              <br />• CORS policy restrictions
            </p>
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block",
                padding: "0.8rem 1.6rem",
                backgroundColor: "var(--button-primary-default)",
                color: "white",
                textDecoration: "none",
                borderRadius: "0.4rem",
                fontSize: "1.2rem",
                marginTop: "1rem",
              }}
            >
              Open in New Tab
            </a>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={src}
          title={title}
          className="iframe-wrapper__frame"
          frameBorder="0"
          allowFullScreen
          loading="eager"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen; display-capture"
          referrerPolicy="no-referrer-when-downgrade"
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            minHeight: "100%",
            opacity: hasError ? 0 : 1,
            transition: "opacity 0.3s",
            border: "none",
            background: "transparent",
            visibility: hasError ? "hidden" : "visible",
            pointerEvents: hasError ? "none" : "auto",
            zIndex: 10,
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
          onLoad={() => {
            // Additional load handler to catch any issues
            setIsLoading(false);
            // Force set loading to false after a short delay to ensure it's clickable
            setTimeout(() => {
              setIsLoading(false);
            }, 100);
          }}
        />
      </div>
    );
  },
);

export default IframeWrapper;
