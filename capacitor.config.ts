import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.buzzie.roadster",
  appName: "Roadster",
  webDir: "out",
  backgroundColor: "#070a17",
  ios: {
    // The game draws edge to edge and pads its own HUD by the safe-area insets.
    contentInset: "never",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: "#070a17",
      showSpinner: false,
    },
  },
};

export default config;
