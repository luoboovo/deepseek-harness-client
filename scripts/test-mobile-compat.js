const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { injectMobileAssets } = require('../src/lan-bridge');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'mobile-compat.js'), 'utf8');
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function runCompat(context) {
  vm.runInNewContext(source, context);
  return context;
}

const deterministic = runCompat({
  crypto: {
    getRandomValues(bytes) {
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = index;
      return bytes;
    }
  }
});
assert.match(deterministic.crypto.randomUUID(), uuidPattern);

const fallback = runCompat({});
assert.match(fallback.crypto.randomUUID(), uuidPattern);

const originalRandomUUID = () => 'kept';
const modern = runCompat({ crypto: { randomUUID: originalRandomUUID } });
assert.strictEqual(modern.crypto.randomUUID, originalRandomUUID);

const html = injectMobileAssets('<html><head><script type="module" src="/assets/app.js"></script></head><body></body></html>');
assert.ok(html.indexOf('/mobile-compat.js') < html.indexOf('/assets/app.js'));
assert.ok(html.includes('/mobile-adapt.css'));
assert.ok(html.includes('/mobile-adapt.js'));

console.log('Mobile compatibility tests passed.');
