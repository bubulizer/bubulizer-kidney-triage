import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bubulizer.kidneytriage',
  appName: 'BUBULIZER Kidney Triage',
  webDir: 'www',
  bundledWebRuntime: false,
  server: {
    // In production, keep this disabled. Useful for local dev only.
    // url: 'http://10.0.2.2:5173', // Android emulator
    cleartext: true
  }
};

export default config;
