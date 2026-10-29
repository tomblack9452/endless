// The Firebase plugin's web half imports the Firebase JS SDK, which the game
// doesn't ship: analytics only runs in the Android app. These stand in for it.
const none = (): undefined => undefined;
export const getAnalytics = none;
export const logEvent = none;
export const setAnalyticsCollectionEnabled = none;
export const setConsent = none;
export const setUserId = none;
export const setUserProperties = none;
