import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.agendasalon.app',
  appName: 'Agenda Salón',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  plugins: { CapacitorSQLite: { iosDatabaseLocation: 'Library/CapacitorDatabase', androidIsEncryption: false } }
};

export default config;
