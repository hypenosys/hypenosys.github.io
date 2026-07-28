window.HY_OAUTH_CONFIG = (function() {
  var host = window.location.hostname;
  var clientId, dataBranch;
  if (host === 'dev.hypenosys.com') {
    clientId = 'Ov23liF933GDejyN7FU9';
    dataBranch = 'develop';
  } else if (host === 'localhost' || host === '127.0.0.1') {
    clientId = 'Ov23lizjvgb2NTRMklKq';
    dataBranch = 'develop';
  } else {
    clientId = 'Ov23liAVwbXNtvhkHJQe';
    dataBranch = 'master';
  }
  return { clientId: clientId, dataBranch: dataBranch };
})();
