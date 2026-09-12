import React, { useState } from "react";
import Button from "@/components/shared_ui/button";
import Modal from "@/components/shared_ui/modal";
import Text from "@/components/shared_ui/text";
import { localize } from "@deriv-com/translations";
import "./risk-disclaimer.scss";

const RiskDisclaimer = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleUnderstand = () => {
    setIsModalOpen(false);
  };

  return (
    <>
      {/* Floating Risk Disclaimer Button */}
      <div className="risk-disclaimer-button">
        <Button
          className="risk-disclaimer-button__btn"
          onClick={handleOpenModal}
          secondary
          small
        >
          {localize("Risk Disclaimer")}
        </Button>
      </div>

      {/* Risk Disclaimer Modal */}
      <Modal
        is_open={isModalOpen}
        title={localize("Risk Disclaimer")}
        onClose={handleCloseModal}
        width="500px"
        className="risk-disclaimer-modal"
      >
        <div className="risk-disclaimer-modal__content">
          <Text
            size="s"
            color="prominent"
            weight="bold"
            className="risk-disclaimer-modal__title"
          >
            {localize("Important Risk Warning")}
          </Text>

          <Text
            size="xs"
            color="general"
            className="risk-disclaimer-modal__text"
          >
            {localize(
              "Trading derivatives involves substantial risk of loss and may not be suitable for all investors. Past performance is not indicative of future results. Please ensure you fully understand the risks involved and seek independent advice if necessary.",
            )}
          </Text>

          <Text
            size="xs"
            color="general"
            className="risk-disclaimer-modal__text"
          >
            {localize(
              "The use of automated trading systems (bots) carries additional risks including but not limited to system failures, connectivity issues, and unexpected market conditions that may result in losses.",
            )}
          </Text>

          <Text
            size="xs"
            color="general"
            className="risk-disclaimer-modal__text"
          >
            {localize(
              "By using this platform, you acknowledge that you understand these risks and agree to trade at your own discretion and responsibility.",
            )}
          </Text>

          <div className="risk-disclaimer-modal__actions">
            <Button
              className="risk-disclaimer-modal__understand-btn"
              onClick={handleUnderstand}
              primary
            >
              {localize("I Understand")}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default RiskDisclaimer;
