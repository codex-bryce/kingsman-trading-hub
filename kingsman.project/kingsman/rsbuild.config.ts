import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { pluginSass } from "@rsbuild/plugin-sass";

const path = require("path");
const defineEnv = (name: string) => JSON.stringify(process.env[name] ?? "");

export default defineConfig({
  plugins: [
    pluginSass({
      sassLoaderOptions: {
        sourceMap: true,
        sassOptions: {
          // includePaths: [path.resolve(__dirname, 'src')],
        },
        // additionalData: `@use "${path.resolve(__dirname, 'src/components/shared/styles')}" as *;`,
      },
      exclude: /node_modules/,
    }),
    pluginReact(),
    // pluginBasicSsl(), // Disabled for easier local access
  ],
  source: {
    entry: {
      index: "./src/main.tsx",
    },
    define: {
      "process.env": {
        TRANSLATIONS_CDN_URL: defineEnv("TRANSLATIONS_CDN_URL"),
        R2_PROJECT_NAME: defineEnv("R2_PROJECT_NAME"),
        CROWDIN_BRANCH_NAME: defineEnv("CROWDIN_BRANCH_NAME"),
        TRACKJS_TOKEN: defineEnv("TRACKJS_TOKEN"),
        APP_ENV: defineEnv("APP_ENV"),
        REF_NAME: defineEnv("REF_NAME"),
        REMOTE_CONFIG_URL: defineEnv("REMOTE_CONFIG_URL"),
        GD_CLIENT_ID: defineEnv("GD_CLIENT_ID"),
        GD_APP_ID: defineEnv("GD_APP_ID"),
        GD_API_KEY: defineEnv("GD_API_KEY"),
        REACT_APP_SUPABASE_URL: defineEnv("REACT_APP_SUPABASE_URL"),
        REACT_APP_SUPABASE_ANON_KEY: defineEnv("REACT_APP_SUPABASE_ANON_KEY"),
        REMOTE_CONFIG_URL_STAGING: defineEnv("REMOTE_CONFIG_URL_STAGING"),
        REMOTE_CONFIG_URL_PROD: defineEnv("REMOTE_CONFIG_URL_PROD"),
        DERIV_OPTIONS_OAUTH_APP_ID: defineEnv("DERIV_OPTIONS_OAUTH_APP_ID"),
        DERIV_OPTIONS_PAT_APP_ID: defineEnv("DERIV_OPTIONS_PAT_APP_ID"),
        DATADOG_SESSION_REPLAY_SAMPLE_RATE: defineEnv(
          "DATADOG_SESSION_REPLAY_SAMPLE_RATE",
        ),
        DATADOG_SESSION_SAMPLE_RATE: defineEnv("DATADOG_SESSION_SAMPLE_RATE"),
        DATADOG_APPLICATION_ID: defineEnv("DATADOG_APPLICATION_ID"),
        DATADOG_CLIENT_TOKEN: defineEnv("DATADOG_CLIENT_TOKEN"),
        RUDDERSTACK_KEY: defineEnv("RUDDERSTACK_KEY"),
        GROWTHBOOK_CLIENT_KEY: defineEnv("GROWTHBOOK_CLIENT_KEY"),
        GROWTHBOOK_DECRYPTION_KEY: defineEnv("GROWTHBOOK_DECRYPTION_KEY"),
      },
    },
    alias: {
      react: path.resolve("./node_modules/react"),
      "react-dom": path.resolve("./node_modules/react-dom"),
      // Temporary shim for malformed @deriv-com/ui import path "Submenu /index.js"
      "./components/AppLayout/Submenu /index.js": path.resolve(
        __dirname,
        "./src/components/shims/ui-submenu/index.js",
      ),
      "../Submenu /index.js": path.resolve(
        __dirname,
        "./src/components/shims/ui-submenu/index.js",
      ),
      "@/external": path.resolve(__dirname, "./src/external"),
      "@/components": path.resolve(__dirname, "./src/components"),
      "@/hooks": path.resolve(__dirname, "./src/hooks"),
      "@/utils": path.resolve(__dirname, "./src/utils"),
      "@/constants": path.resolve(__dirname, "./src/constants"),
      "@/stores": path.resolve(__dirname, "./src/stores"),
    },
  },
  output: {
    copy: [
      {
        from: "node_modules/@deriv/deriv-charts/dist/*",
        to: "js/smartcharts/[name][ext]",
        globOptions: {
          ignore: ["**/*.LICENSE.txt"],
        },
      },
      {
        from: "node_modules/@deriv/deriv-charts/dist/chart/assets/*",
        to: "assets/[name][ext]",
      },
      {
        from: "node_modules/@deriv/deriv-charts/dist/chart/assets/fonts/*",
        to: "assets/fonts/[name][ext]",
      },
      {
        from: "node_modules/@deriv/deriv-charts/dist/chart/assets/shaders/*",
        to: "assets/shaders/[name][ext]",
      },
      { from: path.join(__dirname, "public") },
    ],
  },
  html: {
    template: "./index.html",
  },
  server: {
    port: 3000,
    host: "0.0.0.0", // Allow external connections
    compress: true,
    historyApiFallback: true, // Enable client-side routing fallback
    https: false, // Disable HTTPS for easier local access
  },
  dev: {
    hmr: true,
  },
  tools: {
    rspack: {
      plugins: [],
      resolve: {},
      module: {
        rules: [
          {
            test: /\.xml$/,
            exclude: /node_modules/,
            use: "raw-loader",
          },
        ],
      },
    },
  },
});
