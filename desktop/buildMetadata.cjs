const crypto = require('node:crypto');
const CHANNELS = new Set(['development', 'local', 'alpha', 'beta', 'stable']);
const SAFE_NUMBER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
function createBuildInfo(pkg, {command, env = process.env, now = new Date(), random = () => crypto.randomBytes(4).toString('hex')} = {}) {
  const channel = env.HIVE_BUILD_CHANNEL || (command === 'serve' ? 'development' : 'local');
  if (!CHANNELS.has(channel) || (command === 'serve' && channel !== 'development')) throw new Error('Invalid HIVE_BUILD_CHANNEL');
  const buildNumber = env.HIVE_BUILD_NUMBER || `${now.toISOString().replace(/[-:.TZ]/g, '')}-${random()}`;
  if (!SAFE_NUMBER.test(buildNumber)) throw new Error('Invalid HIVE_BUILD_NUMBER');
  return {appName: pkg.build?.productName || pkg.name, version: pkg.version, buildNumber, buildTime: now.toISOString(), channel};
}
function validBuildInfo(value, pkg) {
  return !!value && typeof value === 'object' && value.appName === (pkg.build?.productName || pkg.name) && value.version === pkg.version && typeof value.buildNumber === 'string' && SAFE_NUMBER.test(value.buildNumber) && typeof value.buildTime === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.buildTime) && !Number.isNaN(Date.parse(value.buildTime)) && new Date(value.buildTime).toISOString() === value.buildTime && CHANNELS.has(value.channel);
}
module.exports = {createBuildInfo, validBuildInfo};

