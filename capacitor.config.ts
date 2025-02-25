import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.agroseguro.chatbot',
  appName: 'Agroseguro Chatbot',
  webDir: 'www',
  plugins: {
    CapacitorBrowser: {}
  }
};

export default config;
