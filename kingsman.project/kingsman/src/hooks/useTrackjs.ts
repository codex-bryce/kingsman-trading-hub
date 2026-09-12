import { useCallback } from "react";
import { TrackJS } from "trackjs";

const { TRACKJS_TOKEN } = process.env;

/**
 * Custom hook to initialize TrackJS.
 * @returns {Object} An object containing the `init` function.
 */
const useTrackjs = () => {
  const isProduction = process.env.APP_ENV === "production";
  const trackjs_version = process.env.REF_NAME ?? "undefined";

  const initTrackJS = useCallback(
    (loginid: string) => {
      try {
        if (!isProduction || !TRACKJS_TOKEN) {
          return;
        }
        if (!TrackJS.isInstalled()) {
          TrackJS.install({
            application: "standalone-deriv-bot",
            dedupe: false,
            enabled: isProduction,
            token: TRACKJS_TOKEN!,
            userId: loginid,
            version:
              (document.querySelector("meta[name=version]") as HTMLMetaElement)
                ?.content ?? trackjs_version,
          });
        }
      } catch (error) {
        // eslint-disable-next-line no-console
      }
    },
    [isProduction, trackjs_version],
  );

  return { initTrackJS };
};

export default useTrackjs;
