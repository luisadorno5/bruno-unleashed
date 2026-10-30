const { execFile } = require('child_process');
const axios = require('axios');
const { keyVaultStore } = require('../store/keyvault');

const KEYVAULT_API_VERSION = '7.4';
const TOKEN_BUFFER_MS = 2 * 60 * 1000; // Refresh token 2 minutes before expiry
const SECRET_CACHE_TTL_MS = 5 * 60 * 1000; // Cache secret values for 5 minutes in memory

const tokenCache = new Map();
const secretValueCache = new Map();

const getAugmentedEnv = () => {
  const currentPath = process.env.PATH || '';
  const extraPaths = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
  const pathSet = new Set([...currentPath.split(':').filter(Boolean), ...extraPaths]);
  return {
    ...process.env,
    PATH: Array.from(pathSet).join(':')
  };
};

const execAzCommand = (args = [], timeoutMs = 15000) => {
  return new Promise((resolve, reject) => {
    execFile(
      'az',
      args,
      {
        env: getAugmentedEnv(),
        timeout: timeoutMs,
        maxBuffer: 5 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error) {
          const msg = (stderr || error.message || '').trim();
          if (error.code === 'ENOENT') {
            return reject(
              new Error('Azure CLI (`az`) was not found. Install Azure CLI (`brew install azure-cli`) and run `az login`.')
            );
          }
          return reject(new Error(msg || 'Failed to execute Azure CLI command'));
        }
        resolve(stdout);
      }
    );
  });
};

const ALLOWED_KEYVAULT_HOST_REGEX = /^([a-zA-Z0-9-]{3,24})\.(vault\.azure\.net|vault\.usgovcloudapi\.net|vault\.azure\.cn|vault\.microsoftazure\.de)$/i;
const SAFE_TENANT_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,127}$/;
const SAFE_SECRET_NAME_REGEX = /^[a-zA-Z0-9-]{1,127}$/;
const SAFE_SECRET_VERSION_REGEX = /^[a-zA-Z0-9]{1,64}$/;

const validateTenantId = (tenantId) => {
  const trimmed = String(tenantId || '').trim();
  if (!trimmed) return '';
  if (!SAFE_TENANT_ID_REGEX.test(trimmed)) {
    throw new Error('Invalid Azure Tenant ID format');
  }
  return trimmed;
};

const validateSecretName = (secretName) => {
  const trimmed = String(secretName || '').trim();
  if (!trimmed) {
    throw new Error('Secret name is required');
  }
  if (!SAFE_SECRET_NAME_REGEX.test(trimmed)) {
    throw new Error(`Invalid Key Vault secret name "${trimmed}". Secret names may only contain alphanumeric characters and hyphens.`);
  }
  return trimmed;
};

const validateSecretVersion = (version) => {
  const trimmed = String(version || '').trim();
  if (!trimmed) return '';
  if (!SAFE_SECRET_VERSION_REGEX.test(trimmed)) {
    throw new Error('Invalid Key Vault secret version');
  }
  return trimmed;
};

const normalizeVaultUrl = (vaultNameOrUrl) => {
  const raw = String(vaultNameOrUrl || '').trim().replace(/\/+$/, '');
  if (!raw) {
    throw new Error('Key Vault name or URL is required');
  }

  if (/^https?:\/\//i.test(raw)) {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') {
      throw new Error('Key Vault URL must use https://');
    }
    if (!ALLOWED_KEYVAULT_HOST_REGEX.test(parsed.hostname)) {
      throw new Error(
        `Untrusted Key Vault host "${parsed.hostname}". Host must be an official Azure Key Vault domain (*.vault.azure.net).`
      );
    }
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}`;
  }

  if (!/^[a-zA-Z0-9-]{3,24}$/.test(raw) || raw.startsWith('-')) {
    throw new Error(
      `Invalid Key Vault name "${raw}". Enter a valid Azure Key Vault name (3-24 alphanumeric/hyphen characters) or full https://<vault>.vault.azure.net URL.`
    );
  }

  return `https://${raw.toLowerCase()}.vault.azure.net`;
};

const extractVaultName = (vaultNameOrUrl) => {
  const raw = String(vaultNameOrUrl || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      return parsed.hostname.split('.')[0] || raw;
    } catch {
      return raw;
    }
  }
  return raw;
};

const getAzCliStatus = async () => {
  try {
    const stdout = await execAzCommand(['account', 'show', '--output', 'json']);
    const account = JSON.parse(stdout);
    return {
      loggedIn: true,
      user: account?.user?.name || '',
      subscriptionName: account?.name || '',
      subscriptionId: account?.id || '',
      tenantId: account?.tenantId || ''
    };
  } catch (error) {
    return {
      loggedIn: false,
      error: error.message
    };
  }
};

const getKeyVaultAccessToken = async ({
  authMethod = 'az-cli',
  tenantId = '',
  clientId = '',
  clientSecret = '',
  forceRefresh = false
} = {}) => {
  const safeTenantId = validateTenantId(tenantId);
  const cacheKey = `${authMethod}:${safeTenantId || 'default'}:${clientId || 'default'}`;

  if (!forceRefresh && tokenCache.has(cacheKey)) {
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expiresAt - TOKEN_BUFFER_MS > Date.now()) {
      return cached.accessToken;
    }
  }

  if (authMethod === 'service-principal') {
    const resolvedTenantId = validateTenantId(safeTenantId || process.env.AZURE_TENANT_ID);
    const resolvedClientId = clientId || process.env.AZURE_CLIENT_ID;
    const resolvedClientSecret = clientSecret || process.env.AZURE_CLIENT_SECRET;

    if (!resolvedTenantId || !resolvedClientId || !resolvedClientSecret) {
      throw new Error('Service Principal authentication requires Tenant ID, Client ID, and Client Secret.');
    }

    const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(resolvedTenantId)}/oauth2/v2.0/token`;
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', resolvedClientId);
    params.append('client_secret', resolvedClientSecret);
    params.append('scope', 'https://vault.azure.net/.default');

    const response = await axios.post(tokenUrl, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000
    });

    const accessToken = response.data?.access_token;
    const expiresInSec = Number(response.data?.expires_in || 3600);
    if (!accessToken) {
      throw new Error('Failed to obtain access token from Microsoft Entra ID.');
    }

    tokenCache.set(cacheKey, {
      accessToken,
      expiresAt: Date.now() + expiresInSec * 1000
    });

    return accessToken;
  }

  // Default: Azure CLI (`az account get-access-token`)
  const args = ['account', 'get-access-token', '--resource', 'https://vault.azure.net', '--output', 'json'];
  if (safeTenantId) {
    args.push('--tenant', safeTenantId);
  }

  const stdout = await execAzCommand(args);
  const parsed = JSON.parse(stdout);
  const accessToken = parsed?.accessToken;
  if (!accessToken) {
    throw new Error('Azure CLI did not return an access token. Please run `az login`.');
  }

  let expiresAt = Date.now() + 45 * 60 * 1000;
  if (parsed.expires_on) {
    expiresAt = Number(parsed.expires_on) * 1000;
  } else if (parsed.expiresOn) {
    const parsedDate = Date.parse(parsed.expiresOn);
    if (!Number.isNaN(parsedDate)) {
      expiresAt = parsedDate;
    }
  }

  tokenCache.set(cacheKey, { accessToken, expiresAt });
  return accessToken;
};

const formatKeyVaultAxiosError = (error, vaultUrl, secretName = '') => {
  const status = error?.response?.status;
  const apiMessage = error?.response?.data?.error?.message || error?.message || 'Unknown Key Vault error';
  if (status === 401) {
    return new Error(`Unauthorized (401) accessing ${vaultUrl}: ${apiMessage}. Verify your Azure login or tenant.`);
  }
  if (status === 403) {
    return new Error(
      `Forbidden (403) accessing ${vaultUrl}: ${apiMessage}. Ensure your account has "Key Vault Secrets User" RBAC role or Secret Get/List access policy.`
    );
  }
  if (status === 404) {
    return new Error(
      secretName
        ? `Secret "${secretName}" was not found in ${vaultUrl}.`
        : `Key Vault ${vaultUrl} was not found.`
    );
  }
  return new Error(`Key Vault error (${vaultUrl}): ${apiMessage}`);
};

const listVaultSecrets = async ({ vaultName, authConfig = {}, forceRefresh = false }) => {
  const vaultUrl = normalizeVaultUrl(vaultName);
  const accessToken = await getKeyVaultAccessToken({ ...authConfig, forceRefresh });

  const secrets = [];
  let nextUrl = `${vaultUrl}/secrets?maxresults=25&api-version=${KEYVAULT_API_VERSION}`;
  let pageCount = 0;

  try {
    while (nextUrl && pageCount < 8) {
      pageCount += 1;
      const response = await axios.get(nextUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json'
        },
        timeout: 15000
      });

      const items = response.data?.value || [];
      for (const item of items) {
        // item.id is e.g. "https://myvault.vault.azure.net/secrets/my-secret-name"
        const idParts = String(item.id || '').split('/secrets/');
        const secretName = idParts[1] ? idParts[1].split('/')[0] : '';
        if (secretName) {
          secrets.push({
            secretName,
            id: item.id,
            enabled: item.attributes?.enabled !== false,
            updatedOn: item.attributes?.updated ? new Date(item.attributes.updated * 1000).toISOString() : null,
            contentType: item.contentType || ''
          });
        }
      }

      const candidateNext = response.data?.nextLink || null;
      if (candidateNext && typeof candidateNext === 'string' && candidateNext.startsWith(`${vaultUrl}/`)) {
        nextUrl = candidateNext;
      } else {
        nextUrl = null;
      }
    }
  } catch (error) {
    throw formatKeyVaultAxiosError(error, vaultUrl);
  }

  return secrets.sort((a, b) => a.secretName.localeCompare(b.secretName));
};

const getVaultSecret = async ({ vaultName, secretName, version = '', authConfig = {}, forceRefresh = false }) => {
  const vaultUrl = normalizeVaultUrl(vaultName);
  const trimmedSecretName = validateSecretName(secretName);
  const safeVersion = validateSecretVersion(version);

  const cacheKey = `${vaultUrl}:${trimmedSecretName}:${safeVersion || 'latest'}`;
  if (!forceRefresh && secretValueCache.has(cacheKey)) {
    const cached = secretValueCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
  }

  const accessToken = await getKeyVaultAccessToken({ ...authConfig, forceRefresh });
  const versionSegment = safeVersion ? `/${encodeURIComponent(safeVersion)}` : '';
  const url = `${vaultUrl}/secrets/${encodeURIComponent(trimmedSecretName)}${versionSegment}?api-version=${KEYVAULT_API_VERSION}`;

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json'
      },
      timeout: 15000
    });

    const result = {
      secretName: trimmedSecretName,
      vaultName: extractVaultName(vaultUrl),
      vaultUrl,
      value: response.data?.value ?? '',
      id: response.data?.id || '',
      contentType: response.data?.contentType || '',
      updatedOn: response.data?.attributes?.updated
        ? new Date(response.data.attributes.updated * 1000).toISOString()
        : null
    };

    secretValueCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + SECRET_CACHE_TTL_MS
    });

    return result;
  } catch (error) {
    throw formatKeyVaultAxiosError(error, vaultUrl, trimmedSecretName);
  }
};

const parseExternalSecretMapping = (entry = {}, fallbackVaultName = '') => {
  const varName = String(entry.name || '').trim();
  let vaultName = String(entry.vaultName || '').trim();
  let secretName = String(entry.secretName || entry.path || '').trim();
  let version = String(entry.version || '').trim();

  if ((!vaultName || !secretName) && entry.value) {
    const rawVal = String(entry.value).trim();
    if (rawVal.includes('/')) {
      const [vName, sName, ver] = rawVal.split('/');
      if (!vaultName) vaultName = vName;
      if (!secretName) secretName = sName;
      if (!version && ver) version = ver;
    } else if (!secretName) {
      secretName = rawVal;
    }
  }

  if (!vaultName) {
    vaultName = fallbackVaultName;
  }

  // Default secretName to varName (with underscores converted to hyphens if user left secretName blank)
  if (!secretName && varName) {
    secretName = varName.replace(/_/g, '-');
  }

  return {
    name: varName,
    vaultName: extractVaultName(vaultName) || vaultName,
    secretName,
    version
  };
};

const buildExternalSecretEntry = ({ name, vaultName, secretName, version = '' }) => {
  const cleanName = String(name || '').trim();
  const cleanVault = extractVaultName(vaultName) || String(vaultName || '').trim();
  const cleanSecret = String(secretName || '').trim();
  const cleanVersion = String(version || '').trim();

  const entry = {
    name: cleanName,
    vaultName: cleanVault,
    secretName: cleanSecret,
    value: cleanVault ? `${cleanVault}/${cleanSecret}` : cleanSecret
  };

  if (cleanVersion) {
    entry.version = cleanVersion;
  }

  return entry;
};

const fetchEnvironmentKeyVaultSecrets = async ({
  collectionPathname,
  environment,
  configOverride = null,
  forceRefresh = false
}) => {
  const storedConfig = keyVaultStore.getCollectionConfig(collectionPathname, environment?.name);
  const config = {
    ...storedConfig,
    ...(configOverride || {})
  };

  const rawVariables = environment?.externalSecrets?.variables || [];
  if (!rawVariables.length) {
    return {
      resolvedMap: {},
      results: []
    };
  }

  const mappings = rawVariables
    .map((entry) => parseExternalSecretMapping(entry, config.vaultName))
    .filter((m) => m.name && m.vaultName && m.secretName);

  const results = await Promise.all(
    mappings.map(async (mapping) => {
      try {
        const secret = await getVaultSecret({
          vaultName: mapping.vaultName,
          secretName: mapping.secretName,
          version: mapping.version,
          authConfig: config,
          forceRefresh
        });
        return {
          name: mapping.name,
          vaultName: mapping.vaultName,
          secretName: mapping.secretName,
          value: secret.value,
          status: 'ok'
        };
      } catch (error) {
        return {
          name: mapping.name,
          vaultName: mapping.vaultName,
          secretName: mapping.secretName,
          value: null,
          status: 'error',
          error: error.message
        };
      }
    })
  );

  const resolvedMap = {};
  for (const item of results) {
    if (item.status === 'ok' && item.value !== null && item.value !== undefined) {
      resolvedMap[item.name] = item.value;
    }
  }

  if (forceRefresh && collectionPathname) {
    keyVaultStore.updateLastSyncedAt(collectionPathname, environment?.name);
  }

  return {
    resolvedMap,
    results
  };
};

// Matches {{$keyvault.secretName}} or {{$keyvault.vaultName.secretName}}
const KEYVAULT_PLACEHOLDER_REGEX = /\{\{\s*\$keyvault\.([a-zA-Z0-9_-]+)(?:\.([a-zA-Z0-9_-]+))?\s*\}\}/g;

const hydrateEnvVarsWithKeyVault = async ({
  collectionPathname,
  environment,
  envVars = {},
  forceRefresh = false
}) => {
  if (!collectionPathname && !environment) {
    return envVars;
  }

  const config = keyVaultStore.getCollectionConfig(collectionPathname, environment?.name);
  const hydrated = { ...envVars };

  // 1. If environment has externalSecrets mappings and autoFetchBeforeRequest is enabled, resolve them
  const hasExternalMappings = Array.isArray(environment?.externalSecrets?.variables)
    && environment.externalSecrets.variables.length > 0;

  if (hasExternalMappings && config.autoFetchBeforeRequest !== false) {
    try {
      const { resolvedMap } = await fetchEnvironmentKeyVaultSecrets({
        collectionPathname,
        environment,
        configOverride: config,
        forceRefresh
      });
      Object.assign(hydrated, resolvedMap);
    } catch (error) {
      console.warn('[KeyVault] Warning resolving environment externalSecrets:', error.message);
    }
  }

  // 2. Also resolve any environment variable whose value contains {{$keyvault.secretName}} or {{$keyvault.vaultName.secretName}}
  const entries = Object.entries(hydrated);
  for (const [key, val] of entries) {
    if (typeof val !== 'string' || !val.includes('$keyvault.')) continue;
    KEYVAULT_PLACEHOLDER_REGEX.lastIndex = 0;
    const matches = [...val.matchAll(KEYVAULT_PLACEHOLDER_REGEX)];
    if (!matches.length) continue;

    let updatedVal = val;
    for (const match of matches) {
      const [fullMatch, part1, part2] = match;
      const targetVault = part2 ? part1 : config.vaultName;
      const targetSecret = part2 ? part2 : part1;
      if (!targetVault || !targetSecret) continue;
      try {
        const secret = await getVaultSecret({
          vaultName: targetVault,
          secretName: targetSecret,
          authConfig: config,
          forceRefresh
        });
        updatedVal = updatedVal.split(fullMatch).join(secret.value);
      } catch (error) {
        console.warn(`[KeyVault] Failed to resolve ${fullMatch}:`, error.message);
      }
    }
    hydrated[key] = updatedVal;
  }

  return hydrated;
};

const clearKeyVaultCaches = () => {
  tokenCache.clear();
  secretValueCache.clear();
};

module.exports = {
  normalizeVaultUrl,
  extractVaultName,
  getAzCliStatus,
  getKeyVaultAccessToken,
  listVaultSecrets,
  getVaultSecret,
  parseExternalSecretMapping,
  buildExternalSecretEntry,
  fetchEnvironmentKeyVaultSecrets,
  hydrateEnvVarsWithKeyVault,
  clearKeyVaultCaches
};
