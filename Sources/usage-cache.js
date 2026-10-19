// Local account identity and quota snapshot I/O. The refresh controller in
// usage.js decides when to restore/save and how cached values are presented.
function readUsageAccountId() {
  try {
    var customHome = ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey('CODEX_HOME'));
    var path = (customHome || codexDirectory) + '/auth.json';
    var text = ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null));
    return text && text.length <= 65536 ? usageAccountIdFromAuth(JSON.parse(text)) : null;
  } catch (ignored) { return null; }
}

function readUsageCache(accountId) {
  if (!accountId) return null;
  try {
    if (!$.NSFileManager.defaultManager.fileExistsAtPath(usageCachePath)) return null;
    var text = ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(usageCachePath, $.NSUTF8StringEncoding, null));
    if (!text || text.length > 16384) throw new Error('Invalid quota cache size');
    return normalizeUsageCache(JSON.parse(text), accountId, Date.now());
  } catch (error) {
    // Corrupt/expired/other-account snapshots never prevent a live read.
    logError('usage-cache-read', new Error('Quota cache ignored.'));
    return null;
  }
}

function saveUsageCache(normalized) {
  if (!usageAccountId || readUsageAccountId() !== usageAccountId) return;
  try {
    var snapshot = { version: 1, accountId: usageAccountId, savedAt: Date.now(), usage: normalized,
      planType:typeof usagePlanType==='undefined'?null:usagePlanType };
    writePrivateUsageJSON(usageCachePath, snapshot);
  } catch (error) { logError('usage-cache-write', error); }
}

function writePrivateUsageJSON(path, snapshot) {
  // Both caches contain account identifiers: keep their privacy and atomic
  // write behavior in one place. Recheck identity just before touching disk.
  if (!usageAccountId || readUsageAccountId() !== usageAccountId) return;
  writePrivateJSON(path, snapshot);
}

function writePrivateJSON(path, snapshot) {
  var manager = $.NSFileManager.defaultManager;
  var folder = path.slice(0, path.lastIndexOf('/'));
  var privateFolder = $({ NSFilePosixPermissions: 448 }); // 0700
  if (!manager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(folder, true, privateFolder, null) ||
      !manager.setAttributesOfItemAtPathError(privateFolder, folder, null))
    throw new Error('Unable to protect usage cache directory');
  if (!$(JSON.stringify(snapshot)).writeToFileAtomicallyEncodingError(path, true, $.NSUTF8StringEncoding, null))
    throw new Error('Unable to write usage cache');
  if (!manager.setAttributesOfItemAtPathError($({ NSFilePosixPermissions: 384 }), path, null))
    throw new Error('Unable to protect usage cache');
}
