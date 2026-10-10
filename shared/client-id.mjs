// SPDX-License-Identifier: AGPL-3.0-only
/** Non-secret record identifiers, including demos served over plain HTTP. */
export function createClientId(provider = globalThis.crypto) {
  if (typeof provider?.randomUUID === 'function') return provider.randomUUID();
  if (typeof provider?.getRandomValues !== 'function') throw new Error('This browser does not provide secure random values.');
  // randomUUID requires a secure context; getRandomValues also works on HTTP.
  const bytes = provider.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
