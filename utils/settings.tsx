import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { I18nManager, NativeModules, Alert } from 'react-native';

interface Settings {
  groupByFreshness: boolean;
  compactMode: boolean;
  locationOrder: string[];
  sourceOrder: string[];
  language: 'en' | 'ar';
}

interface SettingsContextType {
  settings: Settings;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

const DEFAULT_SETTINGS: Settings = {
  groupByFreshness: false,
  compactMode: true,
  locationOrder: [],
  sourceOrder: [],
  language: 'en',
};

const STORAGE_KEY = 'grocery_runner_settings';

const SettingsContext = createContext<SettingsContextType>({
  settings: DEFAULT_SETTINGS,
  updateSetting: () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setSettings({ ...DEFAULT_SETTINGS, ...parsed });
          
          // Enforce RTL state on boot if it got wiped or out of sync
          const isArabic = parsed.language === 'ar';
          if (I18nManager.isRTL !== isArabic) {
            I18nManager.allowRTL(isArabic);
            I18nManager.forceRTL(isArabic);
            
            // Auto-reload in dev/Expo Go if out of sync
            if (__DEV__ && NativeModules.DevSettings) {
              NativeModules.DevSettings.reload();
            } else {
              Alert.alert('Restart Required', 'Please restart the app to apply the layout direction.');
            }
          }
        }
      } catch (e) {
        console.error('Failed to load settings:', e);
      }
      setLoaded(true);
    })();
  }, []);

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(console.error);
      return next;
    });
  };

  if (!loaded) return null;

  return (
    <SettingsContext.Provider value={{ settings, updateSetting }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
