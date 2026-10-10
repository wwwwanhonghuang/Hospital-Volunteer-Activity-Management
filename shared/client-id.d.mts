export function createClientId(provider?: Pick<Crypto, 'getRandomValues'> & Partial<Pick<Crypto, 'randomUUID'>>): string;
