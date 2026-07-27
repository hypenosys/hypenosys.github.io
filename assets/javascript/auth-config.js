window.HY_OAUTH_CONFIG = (function() {
  var host = window.location.hostname;
  var clientId;
  if (host === 'dev.hypenosys.com') {
    clientId = 'Ov23liF933GDejyN7FU9';
  } else if (host === 'localhost' || host === '127.0.0.1') {
    clientId = 'Ov23lizjvgb2NTRMklKq';
  } else {
    clientId = 'Ov23liAVwbXNtvhkHJQe';
  }
  return { clientId: clientId };
})();
