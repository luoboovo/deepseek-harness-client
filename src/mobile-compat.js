(() => {
  const root = globalThis;
  let cryptoObject = root.crypto;

  if (!cryptoObject || (typeof cryptoObject !== 'object' && typeof cryptoObject !== 'function')) {
    cryptoObject = {};
    try {
      Object.defineProperty(root, 'crypto', {
        configurable: true,
        value: cryptoObject
      });
    } catch {
      root.crypto = cryptoObject;
    }
  }

  if (typeof cryptoObject.randomUUID === 'function') return;

  let fallbackCounter = 0;

  function fillRandom(bytes) {
    if (typeof cryptoObject.getRandomValues === 'function') {
      cryptoObject.getRandomValues(bytes);
      return;
    }

    // This fallback is only used for client-side RPC correlation on very old WebViews.
    let seed = Date.now() + (fallbackCounter += 1);
    for (let index = 0; index < bytes.length; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      bytes[index] = (seed ^ Math.floor(Math.random() * 256)) & 0xff;
    }
  }

  function randomUUID() {
    const bytes = new Uint8Array(16);
    fillRandom(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  try {
    Object.defineProperty(cryptoObject, 'randomUUID', {
      configurable: true,
      value: randomUUID
    });
  } catch {
    cryptoObject.randomUUID = randomUUID;
  }
})();
