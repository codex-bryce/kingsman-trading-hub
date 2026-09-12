import React, { useEffect } from "react";

/**
 * Security Protection Component
 * - Disables right-click (desktop only)
 * - Blocks DevTools keyboard shortcuts (desktop only)
 * - DevTools detection disabled (too many false positives)
 */
const SecurityProtection: React.FC = () => {
  useEffect(() => {
    // Check if mobile device
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
      );

    // Disable right-click (desktop only - mobile needs context menu for some features)
    const disableRightClick = (e: MouseEvent) => {
      // if (!isMobile && (e.button === 2 || e.which === 3)) {
      //   e.preventDefault();
      //   e.stopPropagation();
      //   return false;
      // }
    };

    // Disable context menu (desktop only)
    const disableContextMenu = (e: Event) => {
      if (!isMobile) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    // Disable keyboard shortcuts for DevTools (desktop only)
    const disableDevToolsShortcuts = (e: KeyboardEvent) => {
      if (isMobile) return; // Skip on mobile

      // F12
      if (e.key === "F12") {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      // Ctrl+Shift+I (Windows/Linux)
      if (e.ctrlKey && e.shiftKey && e.key === "I") {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      // Ctrl+Shift+J (Windows/Linux)
      if (e.ctrlKey && e.shiftKey && e.key === "J") {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      // Ctrl+Shift+C (Windows/Linux)
      if (e.ctrlKey && e.shiftKey && e.key === "C") {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      // Ctrl+U (View Source)
      if (e.ctrlKey && e.key === "u") {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      // Ctrl+S (Save Page)
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    // DevTools detection - DISABLED due to too many false positives
    // Only keeping right-click and keyboard shortcut blocking
    const detectDevTools = () => {
      // Detection disabled - return empty cleanup
      return () => {};
    };

    // Add event listeners
    document.addEventListener("contextmenu", disableContextMenu);
    document.addEventListener("mousedown", disableRightClick);
    document.addEventListener("mouseup", disableRightClick);
    document.addEventListener("keydown", disableDevToolsShortcuts);

    // Start DevTools detection (disabled, but keeping for cleanup)
    const cleanupDetection = detectDevTools();

    // Cleanup
    return () => {
      document.removeEventListener("contextmenu", disableContextMenu);
      document.removeEventListener("mousedown", disableRightClick);
      document.removeEventListener("mouseup", disableRightClick);
      document.removeEventListener("keydown", disableDevToolsShortcuts);
      cleanupDetection();
    };
  }, []);

  // White screen detection disabled - too many false positives
  // Only right-click and keyboard shortcuts are blocked
  return null;
};

export default SecurityProtection;
