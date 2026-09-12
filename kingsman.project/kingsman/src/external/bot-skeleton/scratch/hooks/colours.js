const lightMode = () => {
  const workspace = Blockly;
  workspace.Colours.RootBlock = {
    // Green color for trade parameters blocks - matching Run button color
    colour: "#4bb4b3",
    colourSecondary: "#4bb4b3",
    colourTertiary: "#3d9494",
  };

  workspace.Colours.Base = {
    colour: "#e5e5e5",
    colourSecondary: "#ffffff",
    colourTertiary: "#6d7278",
  };

  workspace.Colours.Special1 = {
    colour: "#e5e5e5",
    colourSecondary: "#ffffff",
    colourTertiary: "#6d7278",
  };

  workspace.Colours.Special2 = {
    colour: "#e5e5e5",
    colourSecondary: "#ffffff",
    colourTertiary: "#6d7278",
  };

  workspace.Colours.Special3 = {
    colour: "#e5e5e5",
    colourSecondary: "#ffffff",
    colourTertiary: "#6d7278",
  };

  workspace.Colours.Special4 = {
    colour: "#e5e5e5",
    colourSecondary: "#000000",
    colourTertiary: "#0e0e0e",
  };
};

export const setColors = () => lightMode();
