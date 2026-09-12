import { useDevice } from "@deriv-com/ui";
import { useState, useEffect, useRef } from "react";

import { LegacyMenuHamburger1pxIcon } from "@deriv/quill-icons/Legacy";
// Custom icons to match uploaded images exactly
import "./app-logo.scss";

// Menu Icon for mobile/tablet
const MenuIcon = ({ onClick }: { onClick: () => void }) => (
  <button
    className="app-header__menu-icon-button"
    onClick={onClick}
    type="button"
    aria-label="Open menu"
  >
    <LegacyMenuHamburger1pxIcon iconSize="sm" fill="var(--text-general)" />
  </button>
);

// Logo asset served from public folder
const LOGO_SRC = "/assets/images/dinsider.jpg";
const CONTACT_NUMBER = "071754374";
const CONTACT_NUMBER_INTERNATIONAL = `254${CONTACT_NUMBER.slice(1)}`;
const WHATSAPP_URL = `https://wa.me/${CONTACT_NUMBER_INTERNATIONAL}`;
const TELEGRAM_URL = `https://t.me/+${CONTACT_NUMBER_INTERNATIONAL}`;

// WhatsApp Icon Component
const WhatsAppIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"
      fill="#25D366"
    />
  </svg>
);

// Telegram Icon Component
const TelegramIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"
      fill="#0088cc"
    />
  </svg>
);

// Small message icon + dropdown
const MessageMenu = () => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  return (
    <div className="brand-message" ref={menuRef}>
      <button
        className="brand-message__btn brand-message__btn--message"
        type="button"
        aria-label="Contact menu"
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M21 11.5C21.0034 12.8199 20.6951 14.1219 20.1 15.3C19.3944 16.7118 18.3098 17.8992 16.9674 18.7293C15.6251 19.5594 14.0782 19.9994 12.5 20C11.1801 20.0035 9.87812 19.6951 8.7 19.1L3 21L4.9 15.3C4.30493 14.1219 3.99656 12.8199 4 11.5C4.00061 9.92179 4.44061 8.37488 5.27072 7.03258C6.10083 5.69028 7.28825 4.6056 8.7 3.90003C9.87812 3.30496 11.1801 2.99659 12.5 3.00003H13C15.0843 3.11502 17.053 3.99479 18.5291 5.47089C20.0052 6.94699 20.885 8.91568 21 11V11.5Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <path
            d="M17 8H17.01M12 8H12.01M7 8H7.01"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            cx="20"
            cy="4"
            r="3.5"
            fill="#ef4444"
            stroke="#fff"
            strokeWidth="1.5"
          />
        </svg>
      </button>
      {open && (
        <div className="brand-message__menu">
          <a
            className="brand-message__item"
            href={WHATSAPP_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            <WhatsAppIcon />
            <span>WhatsApp: {CONTACT_NUMBER}</span>
          </a>
          <a
            className="brand-message__item"
            href={TELEGRAM_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            <TelegramIcon />
            <span>Telegram: {CONTACT_NUMBER}</span>
          </a>
        </div>
      )}
    </div>
  );
};

export const AppLogo = ({ onMenuClick }: { onMenuClick?: () => void }) => {
  const { isDesktop } = useDevice();

  return (
    <div className="app-header__logo-container">
      {!isDesktop && onMenuClick && <MenuIcon onClick={onMenuClick} />}
    </div>
  );
};
