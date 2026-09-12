import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { getAppId } from "@/components/shared/utils/config/config";
import { triggerOAuthLogin } from "@/hooks/auth/useOauth2";
import "./signup-modal.scss";

// ── Global event ──────────────────────────────────────────────────────────────
export const OPEN_SIGNUP_MODAL_EVENT = "openSignupModal";
export const openSignupModal = () =>
  window.dispatchEvent(new CustomEvent(OPEN_SIGNUP_MODAL_EVENT));

// ── Affiliate configuration ───────────────────────────────────────────────────
// New affiliate signup link:
// https://home.deriv.com/dashboard/signup?sidc=CE59670D-4F32-46BC-AA56-7765DA349281&utm_campaign=dynamicworks&utm_medium=affiliate&utm_source=CU51217
//
// sidc  = session/site tracking ID → passed as affiliate_token to new_account_virtual
// utm_source = CU51217 → stable affiliate account ID (used as fallback)
const MY_AFFILIATE_SIDC = "CE59670D-4F32-46BC-AA56-7765DA349281"; // sidc from affiliate link
const MY_AFFILIATE_SOURCE = "CU51217"; // utm_source (stable ID)

/**
 * Resolve the best available affiliate token to pass to new_account_virtual.
 * Priority order:
 *   1. 'sidc' cookie  — set by Deriv when user lands from your affiliate link
 *   2. 'affiliate_token' cookie — set by older Deriv tracking (track.deriv.be)
 *   3. URL param 'sidc' — if current page URL contains it
 *   4. localStorage 'affiliate_token' — previously captured value
 *   5. Hardcoded sidc — always guarantees attribution
 */
const getAffiliateToken = (): string => {
  try {
    const parseCookie = (name: string) =>
      document.cookie
        .split("; ")
        .find((r) => r.startsWith(`${name}=`))
        ?.split("=")[1] ?? null;

    // 1. sidc cookie (set when user visits from your affiliate link)
    const sidcCookie = parseCookie("sidc");
    if (sidcCookie) {
      return sidcCookie;
    }

    // 2. affiliate_token cookie (older tracking)
    const affCookie = parseCookie("affiliate_token");
    if (affCookie) {
      return affCookie;
    }

    // 3. sidc from current page URL params (user came directly from the link)
    const urlParams = new URLSearchParams(window.location.search);
    const urlSidc = urlParams.get("sidc");
    if (urlSidc) {
      // Persist it so it survives page navigation
      try {
        localStorage.setItem("affiliate_sidc", urlSidc);
      } catch {
        /* noop */
      }

      return urlSidc;
    }

    // 4. Previously persisted sidc in localStorage
    const lsSidc = localStorage.getItem("affiliate_sidc");
    if (lsSidc) {
      return lsSidc;
    }

    // 5. Generic affiliate_token in localStorage
    const lsToken = localStorage.getItem("affiliate_token");
    if (lsToken) {
      return lsToken;
    }
  } catch {
    // ignore errors — always fall through to hardcoded value
  }

  // 6. Hardcoded sidc — guarantees attribution even if user never clicked the link directly

  return MY_AFFILIATE_SIDC;
};

/**
 * Capture and persist affiliate params from the current URL on page load.
 * Call once when the app starts so sidc survives navigation.
 */
export const captureAffiliateParams = () => {
  try {
    const params = new URLSearchParams(window.location.search);
    const sidc = params.get("sidc");
    const utmSource = params.get("utm_source");
    if (sidc) localStorage.setItem("affiliate_sidc", sidc);
    if (utmSource) localStorage.setItem("affiliate_source", utmSource);
  } catch {
    /* noop */
  }
};

// ── Country list ──────────────────────────────────────────────────────────────
const COUNTRIES: { code: string; name: string }[] = [
  { code: "af", name: "Afghanistan" },
  { code: "al", name: "Albania" },
  { code: "dz", name: "Algeria" },
  { code: "ao", name: "Angola" },
  { code: "ar", name: "Argentina" },
  { code: "au", name: "Australia" },
  { code: "at", name: "Austria" },
  { code: "az", name: "Azerbaijan" },
  { code: "bh", name: "Bahrain" },
  { code: "bd", name: "Bangladesh" },
  { code: "be", name: "Belgium" },
  { code: "bo", name: "Bolivia" },
  { code: "br", name: "Brazil" },
  { code: "bg", name: "Bulgaria" },
  { code: "kh", name: "Cambodia" },
  { code: "cm", name: "Cameroon" },
  { code: "ca", name: "Canada" },
  { code: "cl", name: "Chile" },
  { code: "cn", name: "China" },
  { code: "co", name: "Colombia" },
  { code: "cr", name: "Costa Rica" },
  { code: "hr", name: "Croatia" },
  { code: "cy", name: "Cyprus" },
  { code: "cz", name: "Czech Republic" },
  { code: "dk", name: "Denmark" },
  { code: "do", name: "Dominican Republic" },
  { code: "ec", name: "Ecuador" },
  { code: "eg", name: "Egypt" },
  { code: "ee", name: "Estonia" },
  { code: "et", name: "Ethiopia" },
  { code: "fi", name: "Finland" },
  { code: "fr", name: "France" },
  { code: "ge", name: "Georgia" },
  { code: "de", name: "Germany" },
  { code: "gh", name: "Ghana" },
  { code: "gr", name: "Greece" },
  { code: "gt", name: "Guatemala" },
  { code: "hn", name: "Honduras" },
  { code: "hk", name: "Hong Kong" },
  { code: "hu", name: "Hungary" },
  { code: "in", name: "India" },
  { code: "id", name: "Indonesia" },
  { code: "iq", name: "Iraq" },
  { code: "ie", name: "Ireland" },
  { code: "il", name: "Israel" },
  { code: "it", name: "Italy" },
  { code: "jm", name: "Jamaica" },
  { code: "jp", name: "Japan" },
  { code: "jo", name: "Jordan" },
  { code: "kz", name: "Kazakhstan" },
  { code: "ke", name: "Kenya" },
  { code: "kw", name: "Kuwait" },
  { code: "lv", name: "Latvia" },
  { code: "lb", name: "Lebanon" },
  { code: "lt", name: "Lithuania" },
  { code: "my", name: "Malaysia" },
  { code: "mv", name: "Maldives" },
  { code: "mt", name: "Malta" },
  { code: "mx", name: "Mexico" },
  { code: "mn", name: "Mongolia" },
  { code: "ma", name: "Morocco" },
  { code: "mz", name: "Mozambique" },
  { code: "mm", name: "Myanmar" },
  { code: "na", name: "Namibia" },
  { code: "np", name: "Nepal" },
  { code: "nl", name: "Netherlands" },
  { code: "nz", name: "New Zealand" },
  { code: "ng", name: "Nigeria" },
  { code: "no", name: "Norway" },
  { code: "om", name: "Oman" },
  { code: "pk", name: "Pakistan" },
  { code: "pa", name: "Panama" },
  { code: "py", name: "Paraguay" },
  { code: "pe", name: "Peru" },
  { code: "ph", name: "Philippines" },
  { code: "pl", name: "Poland" },
  { code: "pt", name: "Portugal" },
  { code: "qa", name: "Qatar" },
  { code: "ro", name: "Romania" },
  { code: "ru", name: "Russia" },
  { code: "rw", name: "Rwanda" },
  { code: "sa", name: "Saudi Arabia" },
  { code: "sn", name: "Senegal" },
  { code: "rs", name: "Serbia" },
  { code: "sg", name: "Singapore" },
  { code: "sk", name: "Slovakia" },
  { code: "za", name: "South Africa" },
  { code: "kr", name: "South Korea" },
  { code: "es", name: "Spain" },
  { code: "lk", name: "Sri Lanka" },
  { code: "se", name: "Sweden" },
  { code: "ch", name: "Switzerland" },
  { code: "tw", name: "Taiwan" },
  { code: "tz", name: "Tanzania" },
  { code: "th", name: "Thailand" },
  { code: "tn", name: "Tunisia" },
  { code: "tr", name: "Turkey" },
  { code: "ug", name: "Uganda" },
  { code: "ua", name: "Ukraine" },
  { code: "ae", name: "United Arab Emirates" },
  { code: "gb", name: "United Kingdom" },
  { code: "uy", name: "Uruguay" },
  { code: "uz", name: "Uzbekistan" },
  { code: "ve", name: "Venezuela" },
  { code: "vn", name: "Vietnam" },
  { code: "ye", name: "Yemen" },
  { code: "zm", name: "Zambia" },
  { code: "zw", name: "Zimbabwe" },
];

// ── Step 1: send verify_email ─────────────────────────────────────────────────
const sendVerificationEmail = (email: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const appId = getAppId();
    const ws = new WebSocket(
      `wss://ws.derivws.com/websockets/v3?app_id=${appId}&l=EN&brand=deriv`,
    );
    const t = setTimeout(() => {
      ws.close();
      reject(new Error("Connection timed out. Please try again."));
    }, 20000);

    ws.onopen = () => {
      // NOTE: verify_email does NOT accept affiliate_token — only new_account_virtual does
      ws.send(
        JSON.stringify({
          verify_email: email,
          type: "account_opening",
        }),
      );
    };
    ws.onmessage = (ev) => {
      clearTimeout(t);
      try {
        const d = JSON.parse(ev.data);
        ws.close();
        if (d.error) {
          reject(
            new Error(d.error.message || "Failed to send verification email."),
          );
          return;
        }
        // verify_email returns { verify_email: 1 } on success

        resolve();
      } catch (e) {
        ws.close();
        reject(e);
      }
    };
    ws.onerror = () => {
      clearTimeout(t);
      ws.close();
      reject(new Error("WebSocket error. Check your internet connection."));
    };
    ws.onclose = () => clearTimeout(t);
  });

// ── Step 2: new_account_virtual ───────────────────────────────────────────────
interface NewAccountResult {
  client_id: string;
  oauth_token: string;
  email: string;
  currency: string;
  balance: number;
}

const createVirtualAccount = (
  verificationCode: string,
  password: string,
  residence: string,
): Promise<NewAccountResult> =>
  new Promise((resolve, reject) => {
    const appId = getAppId();
    const ws = new WebSocket(
      `wss://ws.derivws.com/websockets/v3?app_id=${appId}&l=EN&brand=deriv`,
    );
    const t = setTimeout(() => {
      ws.close();
      reject(new Error("Connection timed out. Please try again."));
    }, 20000);

    ws.onopen = () => {
      const affiliateToken = getAffiliateToken();

      ws.send(
        JSON.stringify({
          new_account_virtual: 1,
          client_password: password,
          residence,
          verification_code: verificationCode,
          affiliate_token: affiliateToken,
        }),
      );
    };
    ws.onmessage = (ev) => {
      clearTimeout(t);
      try {
        const d = JSON.parse(ev.data);
        ws.close();
        if (d.error) {
          reject(new Error(d.error.message || "Account creation failed."));
          return;
        }
        if (d.new_account_virtual) {
          resolve(d.new_account_virtual as NewAccountResult);
        }
      } catch (e) {
        ws.close();
        reject(e);
      }
    };
    ws.onerror = () => {
      clearTimeout(t);
      ws.close();
      reject(new Error("WebSocket error. Check your internet connection."));
    };
    ws.onclose = () => clearTimeout(t);
  });

// ── Step 3: authorize ─────────────────────────────────────────────────────────
const authorizeWithToken = (
  token: string,
  email?: string,
): Promise<{ loginid: string; currency: string }> =>
  new Promise((resolve, reject) => {
    const appId = getAppId();
    const ws = new WebSocket(
      `wss://ws.derivws.com/websockets/v3?app_id=${appId}&l=EN&brand=deriv`,
    );
    const t = setTimeout(() => {
      ws.close();
      reject(new Error("Authorization timed out."));
    }, 15000);

    ws.onopen = () => ws.send(JSON.stringify({ authorize: token }));
    ws.onmessage = (ev) => {
      clearTimeout(t);
      try {
        const d = JSON.parse(ev.data);
        ws.close();
        if (d.error) {
          reject(new Error(d.error.message));
          return;
        }
        if (d.authorize) {
          const auth = d.authorize;

          // Build accountsList (loginid → token) and clientAccounts (loginid → full info)
          // — these are the EXACT keys AuthWrapper/callback-page uses —
          const accountsList: Record<string, string> = {};
          const clientAccounts: Record<
            string,
            { loginid: string; token: string; currency: string; email?: string }
          > = {};

          accountsList[auth.loginid] = token;
          clientAccounts[auth.loginid] = {
            loginid: auth.loginid,
            token,
            currency: auth.currency || "USD",
            ...(email ? { email } : {}),
          };

          if (auth.account_list?.length) {
            auth.account_list.forEach(
              (acc: { loginid: string; token?: string; currency?: string }) => {
                if (acc.token) {
                  accountsList[acc.loginid] = acc.token;
                  clientAccounts[acc.loginid] = {
                    loginid: acc.loginid,
                    token: acc.token,
                    currency: acc.currency || "USD",
                  };
                }
              },
            );
          }

          // ── Save all keys the app needs (matching AuthWrapper + callback-page) ──
          localStorage.setItem("accountsList", JSON.stringify(accountsList));
          localStorage.setItem(
            "clientAccounts",
            JSON.stringify(clientAccounts),
          );
          localStorage.setItem("authToken", token); // ← app reads THIS
          localStorage.setItem("active_loginid", auth.loginid);
          if (auth.country)
            localStorage.setItem("client.country", auth.country);

          // ── Set logged_state cookie (exactly as AuthWrapper does) ──
          const exp = new Date();
          exp.setDate(exp.getDate() + 30);
          document.cookie = [
            "logged_state=true",
            `domain=${window.location.hostname}`,
            `expires=${exp.toUTCString()}`,
            "path=/",
            ...(window.location.protocol === "https:" ? ["secure"] : []),
          ].join("; ");

          resolve({ loginid: auth.loginid, currency: auth.currency || "USD" });
        }
      } catch (e) {
        ws.close();
        reject(e);
      }
    };
    ws.onerror = () => {
      clearTimeout(t);
      ws.close();
      reject(new Error("Authorization connection error."));
    };
    ws.onclose = () => clearTimeout(t);
  });

// ── Types ─────────────────────────────────────────────────────────────────────
type Step =
  | "step1"
  | "sendingEmail"
  | "step2"
  | "creatingAccount"
  | "success"
  | "error";

// ── Modal ─────────────────────────────────────────────────────────────────────
const SignupModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<Step>("step1");
  const [errorMsg, setErrorMsg] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showCpw, setShowCpw] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [successInfo, setSuccessInfo] = useState<{ client_id: string } | null>(
    null,
  );
  const [countdown, setCountdown] = useState(3);

  // Step 1 fields
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [residence, setResidence] = useState("");

  // Step 2 fields
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  // Listen for open event
  useEffect(() => {
    const handler = () => {
      setIsOpen(true);
      reset();
    };
    window.addEventListener(OPEN_SIGNUP_MODAL_EVENT, handler);
    return () => window.removeEventListener(OPEN_SIGNUP_MODAL_EVENT, handler);
  }, []);

  // Auto-focus
  useEffect(() => {
    if (!isOpen) return;
    if (step === "step1") setTimeout(() => emailRef.current?.focus(), 100);
    if (step === "step2") setTimeout(() => codeRef.current?.focus(), 100);
  }, [isOpen, step]);

  const reset = () => {
    setStep("step1");
    setErrorMsg("");
    setEmail("");
    setPhone("");
    setResidence("");
    setCode("");
    setPassword("");
    setConfirmPw("");
    setShowPw(false);
    setShowCpw(false);
    setCountrySearch("");
    setSuccessInfo(null);
    setCountdown(3);
  };

  // Auto-redirect countdown after successful signup (3s)
  useEffect(() => {
    if (step !== "success") return;
    setCountdown(3);
    const tick = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(tick);
          handleClose();
          window.location.reload();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const handleClose = () => {
    setIsOpen(false);
    reset();
  };

  const filteredCountries = COUNTRIES.filter((c) =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase()),
  );

  // ── Submit Step 1: send verification email ──────────────────────────────
  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !phone || !residence) {
      setErrorMsg("Please fill in all fields.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMsg("Please enter a valid email address.");
      return;
    }
    if (!/^\+?[0-9\s().-]{7,}$/.test(phone)) {
      setErrorMsg("Please enter a valid phone number.");
      return;
    }
    setErrorMsg("");
    setStep("sendingEmail");
    try {
      await sendVerificationEmail(email);
      setStep("step2");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to send email.");
      setStep("step1");
    }
  };

  // ── Submit Step 2: create virtual account ──────────────────────────────
  const handleStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setErrorMsg("Please enter the verification code from your email.");
      return;
    }
    if (!password || password.length < 8) {
      setErrorMsg("Password must be at least 8 characters.");
      return;
    }
    if (!/[A-Z]/.test(password)) {
      setErrorMsg("Password must contain at least one uppercase letter.");
      return;
    }
    if (!/[0-9]/.test(password)) {
      setErrorMsg("Password must contain at least one number.");
      return;
    }
    if (password !== confirmPw) {
      setErrorMsg("Passwords do not match.");
      return;
    }
    setErrorMsg("");
    setStep("creatingAccount");
    try {
      const result = await createVirtualAccount(
        code.trim(),
        password,
        residence,
      );
      localStorage.setItem("signup_client_id", result.client_id);
      localStorage.setItem(
        "signup_profile",
        JSON.stringify({ email, phone, residence }),
      );

      // Auto-authorize — stores all session keys so app shows logged in on reload
      if (result.oauth_token) {
        try {
          await authorizeWithToken(result.oauth_token, email);
        } catch (ae) {}
      }

      setSuccessInfo({ client_id: result.client_id });
      setStep("success");
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Account creation failed.",
      );
      setStep("error");
    }
  };

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="signup-modal-overlay"
      onClick={handleClose}
      role="dialog"
      aria-modal
    >
      <div className="signup-modal" onClick={(e) => e.stopPropagation()}>
        {/* ── Header ── */}
        <div className="signup-modal__header">
          <div className="signup-modal__logo">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="white">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
            </svg>
          </div>
          <div>
            <h2 className="signup-modal__title">Create your Deriv account</h2>
            <p className="signup-modal__subtitle">
              {step === "step1" || step === "sendingEmail"
                ? "Step 1 of 2 — Enter your details"
                : step === "step2" || step === "creatingAccount"
                  ? "Step 2 of 2 — Verify & set password"
                  : "Account ready"}
            </p>
          </div>
          <button
            className="signup-modal__close"
            onClick={handleClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* ── Step indicators ── */}
        {(step === "step1" ||
          step === "sendingEmail" ||
          step === "step2" ||
          step === "creatingAccount") && (
          <div className="signup-modal__steps">
            <div
              className={`su-step ${step === "step1" || step === "sendingEmail" ? "su-step--active" : "su-step--done"}`}
            >
              <span className="su-step__num">1</span>
              <span>Your Details</span>
            </div>
            <div className="su-step-line" />
            <div
              className={`su-step ${step === "step2" || step === "creatingAccount" ? "su-step--active" : step === "success" ? "su-step--done" : ""}`}
            >
              <span className="su-step__num">2</span>
              <span>Verify Email</span>
            </div>
          </div>
        )}

        {/* ── Sending email loader ── */}
        {step === "sendingEmail" && (
          <div className="signup-modal__state">
            <div className="signup-spinner">
              <div className="signup-spinner__ring" />
            </div>
            <p className="signup-modal__state-title">
              Sending verification email…
            </p>
            <p className="signup-modal__state-sub">Please wait a moment.</p>
          </div>
        )}

        {/* ── Creating account loader ── */}
        {step === "creatingAccount" && (
          <div className="signup-modal__state">
            <div className="signup-spinner">
              <div className="signup-spinner__ring" />
            </div>
            <p className="signup-modal__state-title">Creating your account…</p>
            <p className="signup-modal__state-sub">
              Connecting to Deriv, please wait.
            </p>
          </div>
        )}

        {/* ── Success ── */}
        {step === "success" && (
          <div className="signup-modal__state">
            <div className="signup-success-icon">🎉</div>
            <p className="signup-modal__state-title">You're logged in!</p>
            {successInfo?.client_id && (
              <p className="signup-modal__state-sub">
                Account ID:{" "}
                <strong className="signup-client-id">
                  {successInfo.client_id}
                </strong>
              </p>
            )}
            <p className="signup-modal__state-sub">
              Your <strong>$10,000 demo account</strong> is ready. Loading your
              dashboard…
            </p>
            <div className="signup-modal__state-actions">
              <button
                className="signup-modal__btn signup-modal__btn--primary"
                onClick={() => {
                  handleClose();
                  window.location.reload();
                }}
              >
                Start Trading ({countdown}s)
              </button>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {step === "error" && (
          <div className="signup-modal__state">
            <div className="signup-error-icon">❌</div>
            <p className="signup-modal__state-title">Something went wrong</p>
            <p className="signup-modal__state-sub signup-modal__state-sub--error">
              {errorMsg}
            </p>
            <div className="signup-modal__state-actions">
              <button
                className="signup-modal__btn signup-modal__btn--primary"
                onClick={() => {
                  setStep("step2");
                  setErrorMsg("");
                }}
              >
                Try Again
              </button>
              <button
                className="signup-modal__btn signup-modal__btn--ghost"
                onClick={handleClose}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Step 1: Email + Residence ── */}
        {step === "step1" && (
          <form
            className="signup-modal__form"
            onSubmit={handleStep1}
            noValidate
          >
            {/* Affiliate badge - Hidden but still functional */}
            <div
              className="signup-modal__affiliate-badge"
              style={{ display: "none" }}
            >
              <span className="signup-modal__affiliate-icon">🔗</span>
              <span>
                Signing up via <strong>DynamicWorks affiliate</strong> (ID:{" "}
                {MY_AFFILIATE_SOURCE}) — free $10,000 demo account included.
              </span>
            </div>

            <div className="signup-modal__field">
              <label className="signup-modal__label" htmlFor="su-email">
                Email address
              </label>
              <input
                id="su-email"
                ref={emailRef}
                className="signup-modal__input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>

            <div className="signup-modal__field">
              <label className="signup-modal__label" htmlFor="su-phone">
                Phone number
              </label>
              <input
                id="su-phone"
                className="signup-modal__input"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 123 4567"
                autoComplete="tel"
                inputMode="tel"
                required
              />
            </div>

            <div className="signup-modal__field">
              <label className="signup-modal__label" htmlFor="su-res-search">
                Residence / Country
              </label>
              <input
                className="signup-modal__input signup-modal__input--sm"
                type="text"
                placeholder="Search country…"
                value={countrySearch}
                onChange={(e) => setCountrySearch(e.target.value)}
              />
              <select
                id="su-residence"
                className="signup-modal__input signup-modal__input--select"
                value={residence}
                onChange={(e) => setResidence(e.target.value)}
                required
              >
                <option value="">Select your country of residence</option>
                {filteredCountries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {errorMsg && (
              <div className="signup-modal__error-bar">⚠️ {errorMsg}</div>
            )}

            <button
              type="submit"
              className="signup-modal__btn signup-modal__btn--primary signup-modal__btn--full"
              disabled={!email || !phone || !residence}
            >
              Send Verification Email →
            </button>

            <p className="signup-modal__footer-note">
              Already have an account?{" "}
              <button
                type="button"
                className="signup-modal__link"
                onClick={() => {
                  handleClose();
                  // Use same OAuth flow as normal login
                  void (async () => {
                    try {
                      await triggerOAuthLogin();
                    } catch (error) {
                      // Fallback: try to open login modal
                      window.dispatchEvent(new CustomEvent("triggerLogin"));
                    }
                  })();
                }}
              >
                Log in
              </button>
            </p>
          </form>
        )}

        {/* ── Step 2: Verification code + Password ── */}
        {step === "step2" && (
          <form
            className="signup-modal__form"
            onSubmit={handleStep2}
            noValidate
          >
            {/* Info banner */}
            <div className="signup-modal__info-bar">
              📬 We sent a verification code to <strong>{email}</strong>. Check
              your inbox (and spam folder).
            </div>

            <div className="signup-modal__field">
              <label className="signup-modal__label" htmlFor="su-code">
                Verification code
              </label>
              <input
                id="su-code"
                ref={codeRef}
                className="signup-modal__input signup-modal__input--code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
                placeholder="Paste code from email"
                autoComplete="one-time-code"
                required
              />
            </div>

            <div className="signup-modal__field">
              <label className="signup-modal__label" htmlFor="su-password">
                Password
              </label>
              <div className="signup-modal__input-wrap">
                <input
                  id="su-password"
                  className="signup-modal__input"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 chars, 1 uppercase, 1 number"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="signup-modal__eye"
                  onClick={() => setShowPw((p) => !p)}
                >
                  {showPw ? "🙈" : "👁️"}
                </button>
              </div>
              <div className="signup-modal__pw-hints">
                <span className={password.length >= 8 ? "ok" : ""}>
                  8+ chars
                </span>
                <span className={/[A-Z]/.test(password) ? "ok" : ""}>
                  Uppercase
                </span>
                <span className={/[0-9]/.test(password) ? "ok" : ""}>
                  Number
                </span>
              </div>
            </div>

            <div className="signup-modal__field">
              <label className="signup-modal__label" htmlFor="su-cpw">
                Confirm password
              </label>
              <div className="signup-modal__input-wrap">
                <input
                  id="su-cpw"
                  className="signup-modal__input"
                  type={showCpw ? "text" : "password"}
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="signup-modal__eye"
                  onClick={() => setShowCpw((p) => !p)}
                >
                  {showCpw ? "🙈" : "👁️"}
                </button>
              </div>
              {confirmPw && password !== confirmPw && (
                <p className="signup-modal__field-error">
                  Passwords do not match
                </p>
              )}
            </div>

            {errorMsg && (
              <div className="signup-modal__error-bar">⚠️ {errorMsg}</div>
            )}

            <button
              type="submit"
              className="signup-modal__btn signup-modal__btn--primary signup-modal__btn--full"
              disabled={!code.trim() || !password || !confirmPw}
            >
              Create Account
            </button>

            <button
              type="button"
              className="signup-modal__btn signup-modal__btn--ghost signup-modal__btn--full"
              onClick={() => {
                setStep("step1");
                setErrorMsg("");
                setCode("");
                setPassword("");
                setConfirmPw("");
              }}
            >
              ← Change email
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default SignupModal;
