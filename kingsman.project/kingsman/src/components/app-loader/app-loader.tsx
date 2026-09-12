import React, { useEffect, useMemo, useState } from "react";
import "./app-loader.scss";

type TAppLoaderProps = {
  duration?: number;
  onLoadingComplete: () => void;
};

const loaderSteps = [
  "Initialising engine",
  "Loading workspace",
  "Syncing market data",
  "Ready",
];

const AppLoader: React.FC<TAppLoaderProps> = ({
  duration = 3000,
  onLoadingComplete,
}) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const progressTimer = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setProgress(Math.min(100, Math.round((elapsed / duration) * 100)));
    }, 35);

    const doneTimer = setTimeout(() => {
      clearInterval(progressTimer);
      onLoadingComplete();
    }, duration);

    return () => {
      clearInterval(progressTimer);
      clearTimeout(doneTimer);
    };
  }, [duration, onLoadingComplete]);

  const activeStep = useMemo(
    () =>
      Math.min(
        loaderSteps.length - 1,
        Math.floor((progress / 100) * loaderSteps.length),
      ),
    [progress],
  );

  return (
    <main className="kth-boot" aria-label="KingsmanTradingHub is loading">
      {/* Background grid + glow */}
      <div className="kth-boot__bg" aria-hidden="true" />
      <div className="kth-boot__scanline" aria-hidden="true" />

      {/* Centre card */}
      <section className="kth-boot__panel">
        {/* Animated logo */}
        <div className="kth-boot__logo" aria-hidden="true">
          <span className="kth-boot__logo-ring" />
          <span className="kth-boot__logo-ring kth-boot__logo-ring--2" />
          <div className="kth-boot__logo-mark">K</div>
        </div>

        {/* Brand */}
        <div className="kth-boot__brand">
          <h1>KingsmanTradingHub</h1>
        </div>
        <p className="kth-boot__tagline">Professional Trading Platform</p>

        {/* Current step */}
        <div className="kth-boot__status">
          <span className="kth-boot__status-dot" aria-hidden="true" />
          <span className="kth-boot__status-text">
            {loaderSteps[activeStep]}
          </span>
        </div>

        {/* Progress bar */}
        <div className="kth-boot__bar-wrap" aria-hidden="true">
          <div
            className="kth-boot__bar-fill"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Step indicators row */}
        <div className="kth-boot__steps">
          {loaderSteps.map((step, index) => (
            <span
              key={step}
              className={
                index < activeStep
                  ? "kth-boot__step kth-boot__step--done"
                  : index === activeStep
                    ? "kth-boot__step kth-boot__step--active"
                    : "kth-boot__step"
              }
            >
              {step}
            </span>
          ))}
          <span className="kth-boot__counter">{progress}%</span>
        </div>
      </section>
    </main>
  );
};

export default AppLoader;
