jest.mock('axios');
jest.mock('../store/keyvault', () => ({
  keyVaultStore: {
    getCollectionConfig: jest.fn(() => ({
      vaultName: 'default-vault',
      authMethod: 'service-principal',
      autoFetchBeforeRequest: true,
      tenantId: 'tenant-123',
      clientId: 'client-123',
      clientSecret: 'secret-123'
    })),
    updateLastSyncedAt: jest.fn()
  }
}));

const axios = require('axios');
const {
  normalizeVaultUrl,
  extractVaultName,
  listVaultSecrets,
  getVaultSecret,
  getKeyVaultAccessToken,
  parseExternalSecretMapping,
  buildExternalSecretEntry,
  hydrateEnvVarsWithKeyVault,
  clearKeyVaultCaches
} = require('./keyvault');

describe('Azure Key Vault utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearKeyVaultCaches();
  });

  describe('normalizeVaultUrl & extractVaultName', () => {
    it('normalizes vault name into https://<vault>.vault.azure.net', () => {
      expect(normalizeVaultUrl('my-company-kv')).toBe('https://my-company-kv.vault.azure.net');
      expect(normalizeVaultUrl('https://custom-kv.vault.azure.net/')).toBe('https://custom-kv.vault.azure.net');
    });

    it('extracts vault name from URL or plain name', () => {
      expect(extractVaultName('https://custom-kv.vault.azure.net/')).toBe('custom-kv');
      expect(extractVaultName('my-company-kv')).toBe('my-company-kv');
    });

    it('rejects non-https URLs and invalid vault names', () => {
      expect(() => normalizeVaultUrl('http://insecure.vault.azure.net')).toThrow('Key Vault URL must use https://');
      expect(() => normalizeVaultUrl('ab')).toThrow('Invalid Key Vault name');
    });
  });

  describe('parseExternalSecretMapping & buildExternalSecretEntry', () => {
    it('parses both yml object mappings and bru slash-delimited values', () => {
      expect(
        parseExternalSecretMapping({ name: 'api_key', vaultName: 'ati-kv', secretName: 'api-key' })
      ).toEqual({
        name: 'api_key',
        vaultName: 'ati-kv',
        secretName: 'api-key',
        version: ''
      });

      expect(
        parseExternalSecretMapping({ name: 'client_secret', value: 'ati-kv/oauth-client-secret' })
      ).toEqual({
        name: 'client_secret',
        vaultName: 'ati-kv',
        secretName: 'oauth-client-secret',
        version: ''
      });
    });

    it('builds entries compatible with both .yml and .bru serializers', () => {
      expect(
        buildExternalSecretEntry({ name: 'client_secret', vaultName: 'ati-kv', secretName: 'oauth-secret' })
      ).toEqual({
        name: 'client_secret',
        vaultName: 'ati-kv',
        secretName: 'oauth-secret',
        value: 'ati-kv/oauth-secret'
      });
    });
  });

  describe('hydrateEnvVarsWithKeyVault', () => {
    it('resolves externalSecrets mappings and inline {{$keyvault.*}} placeholders', async () => {
      axios.post.mockResolvedValue({
        data: { access_token: 'mock-entra-token', expires_in: 3600 }
      });

      axios.get.mockImplementation(async (url) => {
        if (url.includes('/secrets/api-key')) {
          return { data: { value: 'kv-secret-api-key-123', id: url } };
        }
        if (url.includes('/secrets/inline-token')) {
          return { data: { value: 'kv-inline-token-999', id: url } };
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const environment = {
        name: 'UIT',
        externalSecrets: {
          type: 'azure-keyvault',
          variables: [
            { name: 'API_KEY', vaultName: 'default-vault', secretName: 'api-key' }
          ]
        }
      };

      const envVars = {
        BASE_URL: 'https://api.example.com',
        AUTH_HEADER: 'Bearer {{$keyvault.inline-token}}'
      };

      const hydrated = await hydrateEnvVarsWithKeyVault({
        collectionPathname: '/tmp/col',
        environment,
        envVars
      });

      expect(hydrated).toEqual({
        BASE_URL: 'https://api.example.com',
        API_KEY: 'kv-secret-api-key-123',
        AUTH_HEADER: 'Bearer kv-inline-token-999'
      });
    });
  });

  describe('Security: SSRF, Token Exfiltration, and Injection Prevention', () => {
    it('blocks SSRF / Azure bearer token exfiltration to untrusted domains in normalizeVaultUrl', () => {
      expect(() => normalizeVaultUrl('https://evil-attacker.example.com')).toThrow(
        'Untrusted Key Vault host'
      );
      expect(() => normalizeVaultUrl('https://vault.azure.net.evil.com')).toThrow(
        'Untrusted Key Vault host'
      );
      expect(() => normalizeVaultUrl('https://my-vault.vault.usgovcloudapi.net')).not.toThrow();
    });

    it('blocks cross-origin pagination nextLink SSRF in listVaultSecrets', async () => {
      axios.post.mockResolvedValue({
        data: { access_token: 'mock-entra-token', expires_in: 3600 }
      });

      axios.get.mockResolvedValueOnce({
        data: {
          value: [{ id: 'https://default-vault.vault.azure.net/secrets/first-secret', attributes: { enabled: true } }],
          nextLink: 'https://evil-exfil.example.com/steal-token'
        }
      });

      const secrets = await listVaultSecrets({
        vaultName: 'default-vault',
        authConfig: {
          authMethod: 'service-principal',
          tenantId: 'tenant-123',
          clientId: 'client-123',
          clientSecret: 'secret-123'
        },
        forceRefresh: true
      });

      expect(secrets).toHaveLength(1);
      expect(axios.get).toHaveBeenCalledTimes(1);
    });

    it('blocks CLI option injection / URL path traversal in tenantId, secretName, and version', async () => {
      await expect(
        getKeyVaultAccessToken({
          authMethod: 'az-cli',
          tenantId: '--subscription=evil'
        }, true)
      ).rejects.toThrow('Invalid Azure Tenant ID');

      await expect(
        getVaultSecret({
          vaultName: 'default-vault',
          secretName: '../keys/master-key',
          authConfig: {
            authMethod: 'service-principal',
            tenantId: 'tenant-123',
            clientId: 'client-123',
            clientSecret: 'secret-123'
          }
        })
      ).rejects.toThrow('Invalid Key Vault secret name');

      await expect(
        getVaultSecret({
          vaultName: 'default-vault',
          secretName: 'valid-secret',
          version: '../../other-endpoint',
          authConfig: {
            authMethod: 'service-principal',
            tenantId: 'tenant-123',
            clientId: 'client-123',
            clientSecret: 'secret-123'
          }
        })
      ).rejects.toThrow('Invalid Key Vault secret version');
    });
  });
});
