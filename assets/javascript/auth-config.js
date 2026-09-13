window.HY_OAUTH_CONFIG = (function() {
  var host = window.location.hostname || '';
  var clientId, dataBranch;

  if (host === 'dev.hypenosys.com') {
    clientId = 'Ov23liF933GDejyN7FU9';
  } else if (host === 'localhost' || host === '127.0.0.1') {
    clientId = 'Ov23lizjvgb2NTRMklKq';
  } else {
    clientId = 'Ov23liAVwbXNtvhkHJQe';
  }

  // Explicit production domain allowlist for data branch resolution
  var PROD_HOSTNAMES = ['hypenosys.github.io', 'hypenosys.com', 'www.hypenosys.com'];

  if (PROD_HOSTNAMES.indexOf(host) !== -1) {
    dataBranch = 'master';
  } else {
    // Fail-safe default: Cloudflare Pages previews (*.pages.dev), dev.hypenosys.com,
    // local development (localhost, 127.0.0.1), and any unrecognized hostnames
    // resolve to 'develop' to protect production data from accidental writes.
    dataBranch = 'develop';
  }

  return { clientId: clientId, dataBranch: dataBranch };
})();
