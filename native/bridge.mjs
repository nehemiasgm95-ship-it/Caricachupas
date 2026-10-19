// Punto de entrada de la versión Android: se empaqueta con esbuild en www/native-plugins.js.
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import {
  AdMob, BannerAdPluginEvents, BannerAdSize, BannerAdPosition, InterstitialAdPluginEvents,
  RewardAdPluginEvents, AdmobConsentStatus, MaxAdContentRating,
} from '@capacitor-community/admob';
import { installNative } from './install.mjs';

installNative({
  win: window, doc: document, capacitor: Capacitor, SpeechRecognition, AdMob,
  enums: {
    BannerAdPluginEvents, BannerAdSize, BannerAdPosition, InterstitialAdPluginEvents,
    RewardAdPluginEvents, AdmobConsentStatus, MaxAdContentRating,
  },
});
