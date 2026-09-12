import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import "./community-modal.scss";

const MODAL_DELAY = 1500;

const LINKS = {
  telegram: "https://t.me/+3XEdgI20_W84Yzk0",
} as const;

const CommunityModal: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), MODAL_DELAY);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("modal-open", isVisible);
    if (isVisible) modalRef.current?.focus();

    return () => document.body.classList.remove("modal-open");
  }, [isVisible]);

  const handleClose = useCallback(() => setIsVisible(false), []);

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) handleClose();
    },
    [handleClose],
  );

  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isVisible) handleClose();
    };

    document.addEventListener("keydown", handleEscapeKey);
    return () => document.removeEventListener("keydown", handleEscapeKey);
  }, [handleClose, isVisible]);

  if (!isVisible) return null;

  const modalContent = (
    <div
      className="modal-overlay"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        aria-labelledby="modal-title"
        aria-modal="true"
        className="modal"
        onClick={(event) => event.stopPropagation()}
        ref={modalRef}
        role="dialog"
        tabIndex={-1}
      >
        <button
          className="modal__close"
          onClick={handleClose}
          type="button"
          aria-label="Close modal"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M18 6L6 18M6 6L18 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div className="modal__header">
          <div className="modal__icon" aria-hidden="true">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 17L9 12L13 16L20 7"
                stroke="white"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M16 7H20V11"
                stroke="white"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 id="modal-title" className="modal__title">
            KingsmanTradingHub Network
          </h2>
          <p className="modal__subtitle">
            Signals, tutorials, and trader updates in one place.
          </p>
        </div>

        <div className="modal__content">
          {/* Community links disabled
                    <div className='modal__row'>
                        <a className='modal__btn modal__btn--telegram' href={LINKS.telegram} onClick={handleClose} rel='noopener noreferrer' target='_blank'>
                            <svg className='modal__btn-icon' viewBox='0 0 24 24' fill='currentColor' aria-hidden='true'>
                                <path d='M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.51l-3-2.21-1.446 1.394c-.14.14-.26.26-.532.26l.188-2.68 4.88-4.41c.21-.188-.046-.293-.322-.104l-6.02 3.79-2.614-.82c-.568-.18-.58-.568.12-.84l10.22-3.94c.474-.176.89.116.734.85z' />
                            </svg>
                            Telegram signals
                        </a>
                    </div>
                    */}

          <div className="modal__trust">
            <span>Pro signals</span>
            <span className="dot" aria-hidden="true">
              •
            </span>
            <span>Fresh bots</span>
            <span className="dot" aria-hidden="true">
              •
            </span>
            <span>Live updates</span>
          </div>

          <div className="modal__footer">
            <button
              className="modal__footer-btn modal__footer-btn--no"
              onClick={handleClose}
              type="button"
            >
              Skip
            </button>
            <button
              className="modal__footer-btn modal__footer-btn--later"
              onClick={handleClose}
              type="button"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
};

export default CommunityModal;
