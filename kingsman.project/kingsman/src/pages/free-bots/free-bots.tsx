import React, { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import Button from "@/components/shared_ui/button";
import Text from "@/components/shared_ui/text";
import { DBOT_TABS } from "@/constants/bot-contents";
import { useStore } from "@/hooks/useStore";
import { localize } from "@deriv-com/translations";
import {
  getBotsManifest,
  prefetchAllXmlInBackground,
  fetchXmlWithCache,
} from "@/utils/freebots-cache";
import "./free-bots.scss";

interface BotData {
  name: string;
  description: string;
  difficulty: string;
  STRATEGYDBOT: string;
  features: string[];
  xml: string;
}

const DEFAULT_FEATURES = [
  "Automated Trading",
  "Risk Management",
  "Profit Optimization",
];

const FreeBots = observer(() => {
  const { dashboard, app } = useStore();
  const { active_tab, setActiveTab, setPendingFreeBot } = dashboard;
  const [availableBots, setAvailableBots] = useState<BotData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bot descriptions mapping
  const getBotDescription = (botName: string): string => {
    const descriptions: { [key: string]: string } = {
      "NEXUS OVER PRO":
        "Professional Over 1 trading bot with advanced recovery STRATEGYDBOT. Optimized for high win rates with intelligent recovery mechanisms and risk management.",
      "QUANTUM OVER PRO":
        "Advanced Over 2 bot featuring sophisticated recovery system. Designed for consistent profits with intelligent entry points and recovery strategies.",
      "ALPHA TRADER PRO":
        "Premium multi-STRATEGYDBOT trading bot with advanced approach. Combines technical analysis with automated execution for maximum profitability.",
      "TURBO UNDER PRO":
        "High-performance Under trading bot with optimized STRATEGYDBOT. Optimized for rapid execution and high-probability trades in Under markets.",
      "PRIME UNDER PRO":
        "Professional Under 7 bot with intelligent recovery mechanism. Features advanced risk management and recovery strategies for consistent returns.",
      "ELITE UNDER PRO":
        "Advanced Under 8 trading bot with sophisticated recovery system. Designed for optimal performance with intelligent pattern recognition and recovery.",
    };

    // Try exact match first
    if (descriptions[botName]) {
      return descriptions[botName];
    }

    // Try partial matches
    for (const key in descriptions) {
      if (botName.includes(key) || key.includes(botName)) {
        return descriptions[key];
      }
    }

    return `Advanced trading bot: ${botName}. Features automated trading, risk management, and profit optimization.`;
  };

  // Show selected bots from public/xml (explicit curated list)
  const getXmlFiles = () => {
    return [
      "MEGA SWITCHER.xml",
      "Mega  E&O bot.xml",
      "Mega switcher_stoploss_added.xml",
      "MEGA OVER UNDER BOT WITH AN ENTRY.xml",
    ];
  };

  // Wait for workspace to be available
  const waitForWorkspace = (maxAttempts = 10, delay = 500) => {
    return new Promise((resolve, reject) => {
      let attempts = 0;

      const checkWorkspace = () => {
        attempts++;
        if (window.Blockly?.derivWorkspace) {
          resolve(window.Blockly.derivWorkspace);
        } else if (attempts >= maxAttempts) {
          reject(new Error("Workspace not available after maximum attempts"));
        } else {
          setTimeout(checkWorkspace, delay);
        }
      };

      checkWorkspace();
    });
  };

  // Load bot into builder
  const loadBotIntoBuilder = async (bot: BotData) => {
    try {
      if (bot.xml) {
        // Flag the selected bot for the Bot Builder to load after navigation
        setPendingFreeBot({ name: bot.name, xml: bot.xml });

        // Navigate to Bot Builder; loading will be handled when workspace is ready
        setActiveTab(DBOT_TABS.BOT_BUILDER);
      }
    } catch (error) {}
  };

  // Load bots with instant UI and progressive loading (no blocking spinner)
  useEffect(() => {
    const loadBots = async () => {
      // Always load when component is mounted (now used as sub-component)

      setError(null);

      // 0) Immediately render skeleton cards from a small fallback list
      const fallback = getXmlFiles().map((file) => ({
        name: file.replace(".xml", ""),
        file,
      }));
      const initialSkeleton: BotData[] = fallback.map((item) => {
        const botName = (item.name || item.file.replace(".xml", "")).replace(
          /[_-]/g,
          " ",
        );
        return {
          name: botName,
          description: getBotDescription(botName),
          difficulty: "Intermediate",
          STRATEGYDBOT: "Multi-STRATEGYDBOT",
          features: DEFAULT_FEATURES,
          xml: "",
        };
      });
      setAvailableBots(initialSkeleton);
      setIsLoading(false); // hide "Loading BOT! BOT@..." right away

      try {
        // Force use of explicit list only; ignore remote manifest
        const manifest = getXmlFiles().map((file) => ({
          name: file.replace(".xml", ""),
          file,
        }));

        // Update skeletons to our explicit list
        const skeletonBots: BotData[] = manifest.map((item) => {
          const botName = (item.name || item.file.replace(".xml", "")).replace(
            /[_-]/g,
            " ",
          );
          return {
            name: botName,
            description: getBotDescription(botName),
            difficulty: "Intermediate",
            STRATEGYDBOT: "Multi-STRATEGYDBOT",
            features: DEFAULT_FEATURES,
            xml: "",
          };
        });
        setAvailableBots(skeletonBots);

        // 3) Load XMLs progressively in background
        const loadedBots: BotData[] = [];
        for (let i = 0; i < manifest.length; i++) {
          const item = manifest[i];
          try {
            const xml = await fetchXmlWithCache(item.file);
            if (xml) {
              const botName = (
                item.name || item.file.replace(".xml", "")
              ).replace(/[_-]/g, " ");
              loadedBots.push({
                name: botName,
                description: getBotDescription(botName),
                difficulty: "Intermediate",
                STRATEGYDBOT: "Multi-STRATEGYDBOT",
                features: DEFAULT_FEATURES,
                xml,
              });
              setAvailableBots([
                ...loadedBots,
                ...skeletonBots.slice(loadedBots.length),
              ]);
            }
          } catch (err) {}
        }
      } catch (error) {
        setError("Failed to load bots. Please try again.");
      }
    };

    loadBots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="free-bots">
      <div className="free-bots__container">
        {isLoading ? (
          <div className="free-bots__loading">
            <Text size="s" color="general">
              {localize("Loading BOT! BOT@...")}
            </Text>
          </div>
        ) : error ? (
          <div className="free-bots__error">
            <Text size="s" color="general">
              {error}
            </Text>
            <div style={{ marginTop: "20px" }}>
              <Button onClick={() => window.location.reload()}>
                {localize("Retry")}
              </Button>
            </div>
          </div>
        ) : availableBots.length === 0 ? (
          <div className="free-bots__empty">
            <Text size="s" color="general">
              {localize("No bots available at the moment.")}
            </Text>
          </div>
        ) : (
          <div className="free-bots__grid">
            {availableBots.map((bot, index) => (
              <div key={index} className="free-bot-card">
                <div className="free-bot-card__header">
                  <Text size="s" weight="bold" className="free-bot-card__title">
                    {bot.name}
                  </Text>

                  {/* Star Rating */}
                  <div className="free-bot-card__rating">
                    <span className="star">★</span>
                    <span className="star">★</span>
                    <span className="star">★</span>
                    <span className="star">★</span>
                    <span className="star">★</span>
                  </div>

                  {/* Bot Description */}
                  <Text size="xs" className="free-bot-card__description">
                    {bot.description}
                  </Text>
                </div>

                <Button
                  className="free-bot-card__load-btn"
                  onClick={() => loadBotIntoBuilder(bot)}
                  primary
                  has_effect
                  type="button"
                  disabled={!bot.xml} // Disable if XML not loaded yet
                >
                  {bot.xml ? "LOAD PREMIUM BOT" : "LOADING..."}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export default FreeBots;
