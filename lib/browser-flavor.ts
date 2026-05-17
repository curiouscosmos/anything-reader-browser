export function isFirefoxRuntime() {
  const runtime = typeof browser !== 'undefined' ? browser.runtime as { getBrowserInfo?: () => Promise<{ name?: string }> } | undefined : undefined;
  if (typeof runtime?.getBrowserInfo === 'function') {
    return true;
  }

  if (typeof navigator === 'undefined') {
    return false;
  }

  const userAgent = navigator.userAgent || '';
  if (/firefox/i.test(userAgent)) {
    return true;
  }

  const platform = navigator.platform || '';
  return /firefox/i.test(platform);
}
