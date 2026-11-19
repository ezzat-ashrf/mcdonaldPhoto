'use strict';

window.getPhotoBoothAppCheckToken = (() => {
  const ready = (async () => {
    const config = window.PHOTO_BOOTH_CONFIG || {};
    if (!config.firebase || !config.recaptchaEnterpriseSiteKey) {
      throw new Error('Firebase App Check is not configured in config.js.');
    }
    const appModule = await import('https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js');
    const checkModule = await import('https://www.gstatic.com/firebasejs/11.2.0/firebase-app-check.js');
    const app = appModule.initializeApp(config.firebase);
    const appCheck = checkModule.initializeAppCheck(app, {
      provider: new checkModule.ReCaptchaEnterpriseProvider(config.recaptchaEnterpriseSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
    return { appCheck, getToken: checkModule.getToken };
  })();

  return async () => {
    const { appCheck, getToken } = await ready;
    const result = await getToken(appCheck, false);
    if (!result?.token) throw new Error('App Check did not return a token.');
    return result.token;
  };
})();
