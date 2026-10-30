const fs = require('fs');
const path = require('path');
const { ipcMain } = require('electron');
const { parseEnvironment, stringifyEnvironment } = require('@usebruno/filestore');
const { getCollectionFormat, writeFile, withFileLock } = require('../utils/filesystem');
const { uuid } = require('../utils/common');
const EnvironmentSecretsStore = require('../store/env-secrets');
const { keyVaultStore } = require('../store/keyvault');
const {
  getAzCliStatus,
  listVaultSecrets,
  getVaultSecret,
  buildExternalSecretEntry,
  fetchEnvironmentKeyVaultSecrets
} = require('../utils/keyvault');

const environmentSecretsStore = new EnvironmentSecretsStore();

const resolveEnvFile = (collectionPathname, environmentName) => {
  if (!collectionPathname || !environmentName) {
    throw new Error('collectionPathname and environmentName are required');
  }
  const cleanEnvName = String(environmentName);
  if (
    cleanEnvName.includes('\0')
    || cleanEnvName.includes('/')
    || cleanEnvName.includes('\\')
    || cleanEnvName === '.'
    || cleanEnvName === '..'
  ) {
    throw new Error(`Invalid environment name: ${environmentName}`);
  }
  const format = getCollectionFormat(collectionPathname);
  const envDirPath = path.join(collectionPathname, 'environments');
  const envFilePath = path.join(envDirPath, `${cleanEnvName}.${format}`);
  if (path.dirname(path.resolve(envFilePath)) !== path.resolve(envDirPath)) {
    throw new Error(`Invalid environment name: ${environmentName}`);
  }
  return { envFilePath, format };
};

const handleGetKeyVaultConfig = async (event, { collectionPathname, environmentName }) => {
  return keyVaultStore.getCollectionConfig(collectionPathname, environmentName);
};

const handleSaveKeyVaultConfig = async (event, { collectionPathname, environmentName, config }) => {
  if (!collectionPathname) {
    throw new Error('Collection path is required');
  }
  return keyVaultStore.saveCollectionConfig(collectionPathname, config, environmentName);
};

const handleGetAzStatus = async () => {
  return getAzCliStatus();
};

const handleTestKeyVaultConnection = async (event, { vaultName, authConfig = {} }) => {
  const secrets = await listVaultSecrets({
    vaultName,
    authConfig,
    forceRefresh: true
  });
  return {
    connected: true,
    secretCount: secrets.length,
    secrets
  };
};

const handleListKeyVaultSecrets = async (event, { vaultName, authConfig = {}, forceRefresh = false }) => {
  return listVaultSecrets({ vaultName, authConfig, forceRefresh });
};

const handleGetKeyVaultSecret = async (event, { vaultName, secretName, version = '', authConfig = {}, forceRefresh = false }) => {
  return getVaultSecret({ vaultName, secretName, version, authConfig, forceRefresh });
};

const handleSaveKeyVaultMappings = async (event, { collectionPathname, environmentName, mappings = [], config = null }) => {
  if (config) {
    keyVaultStore.saveCollectionConfig(collectionPathname, config, environmentName);
  }

  const savedConfig = keyVaultStore.getCollectionConfig(collectionPathname, environmentName);
  const { envFilePath, format } = resolveEnvFile(collectionPathname, environmentName);

  if (!fs.existsSync(envFilePath)) {
    throw new Error(`Environment file does not exist: ${envFilePath}`);
  }

  let updatedExternalSecrets;
  await withFileLock(envFilePath, async () => {
    const fileContent = fs.readFileSync(envFilePath, 'utf8');
    const environment = parseEnvironment(fileContent, { format });

    const cleanMappings = (Array.isArray(mappings) ? mappings : [])
      .filter((m) => m && m.name && (m.secretName || m.name))
      .map((m) =>
        buildExternalSecretEntry({
          name: m.name,
          vaultName: m.vaultName || savedConfig.vaultName,
          secretName: m.secretName || m.name,
          version: m.version || ''
        })
      );

    if (cleanMappings.length > 0) {
      environment.externalSecrets = {
        type: 'azure-keyvault',
        variables: cleanMappings
      };
    } else {
      delete environment.externalSecrets;
    }

    updatedExternalSecrets = environment.externalSecrets;
    const updatedContent = await stringifyEnvironment(environment, { format });
    await writeFile(envFilePath, updatedContent);
  });

  return {
    externalSecrets: updatedExternalSecrets
  };
};

const handleSyncEnvironmentFromKeyVault = async (
  event,
  { collectionPathname, environment, mappings = null, config = null }
) => {
  if (!collectionPathname || !environment?.name) {
    throw new Error('Collection path and environment are required');
  }

  if (config) {
    keyVaultStore.saveCollectionConfig(collectionPathname, config, environment.name);
  }

  const savedConfig = keyVaultStore.getCollectionConfig(collectionPathname, environment.name);
  const { envFilePath, format } = resolveEnvFile(collectionPathname, environment.name);

  if (!fs.existsSync(envFilePath)) {
    throw new Error(`Environment file does not exist: ${envFilePath}`);
  }

  const cleanMappings = Array.isArray(mappings)
    ? mappings
        .filter((m) => m && m.name && (m.secretName || m.name))
        .map((m) =>
          buildExternalSecretEntry({
            name: m.name,
            vaultName: m.vaultName || savedConfig.vaultName,
            secretName: m.secretName || m.name,
            version: m.version || ''
          })
        )
    : environment?.externalSecrets?.variables || [];

  const externalSecrets = cleanMappings.length > 0
    ? { type: 'azure-keyvault', variables: cleanMappings }
    : undefined;

  const tempEnv = {
    ...environment,
    externalSecrets
  };

  const { resolvedMap, results } = await fetchEnvironmentKeyVaultSecrets({
    collectionPathname,
    environment: tempEnv,
    configOverride: savedConfig,
    forceRefresh: true
  });

  // Merge resolved secret values into environment.variables as secret variables
  const updatedVariables = Array.isArray(environment.variables)
    ? environment.variables.map((v) => ({ ...v }))
    : [];

  for (const [varName, secretValue] of Object.entries(resolvedMap)) {
    const existingIdx = updatedVariables.findIndex((v) => v.name === varName);
    if (existingIdx >= 0) {
      updatedVariables[existingIdx] = {
        ...updatedVariables[existingIdx],
        value: secretValue,
        secret: true,
        enabled: updatedVariables[existingIdx].enabled !== false,
        type: 'text'
      };
    } else {
      updatedVariables.push({
        uid: uuid(),
        name: varName,
        value: secretValue,
        type: 'text',
        enabled: true,
        secret: true
      });
    }
  }

  await withFileLock(envFilePath, async () => {
    const fileContent = fs.readFileSync(envFilePath, 'utf8');
    const diskEnv = parseEnvironment(fileContent, { format });

    diskEnv.variables = updatedVariables;
    if (externalSecrets) {
      diskEnv.externalSecrets = externalSecrets;
    } else {
      delete diskEnv.externalSecrets;
    }

    environmentSecretsStore.storeEnvSecrets(collectionPathname, diskEnv);

    const updatedContent = await stringifyEnvironment(diskEnv, { format });
    await writeFile(envFilePath, updatedContent);
  });

  const updatedConfig = keyVaultStore.getCollectionConfig(collectionPathname, environment.name);

  return {
    variables: updatedVariables,
    externalSecrets,
    results,
    lastSyncedAt: updatedConfig.lastSyncedAt
  };
};

const registerKeyVaultIpc = () => {
  ipcMain.handle('renderer:keyvault-get-config', handleGetKeyVaultConfig);
  ipcMain.handle('renderer:keyvault-save-config', handleSaveKeyVaultConfig);
  ipcMain.handle('renderer:keyvault-get-az-status', handleGetAzStatus);
  ipcMain.handle('renderer:keyvault-test-connection', handleTestKeyVaultConnection);
  ipcMain.handle('renderer:keyvault-list-secrets', handleListKeyVaultSecrets);
  ipcMain.handle('renderer:keyvault-get-secret', handleGetKeyVaultSecret);
  ipcMain.handle('renderer:keyvault-save-mappings', handleSaveKeyVaultMappings);
  ipcMain.handle('renderer:keyvault-sync-environment', handleSyncEnvironmentFromKeyVault);
};

module.exports = registerKeyVaultIpc;
module.exports.handleGetKeyVaultConfig = handleGetKeyVaultConfig;
module.exports.handleSaveKeyVaultConfig = handleSaveKeyVaultConfig;
module.exports.handleGetAzStatus = handleGetAzStatus;
module.exports.handleTestKeyVaultConnection = handleTestKeyVaultConnection;
module.exports.handleListKeyVaultSecrets = handleListKeyVaultSecrets;
module.exports.handleGetKeyVaultSecret = handleGetKeyVaultSecret;
module.exports.handleSaveKeyVaultMappings = handleSaveKeyVaultMappings;
module.exports.handleSyncEnvironmentFromKeyVault = handleSyncEnvironmentFromKeyVault;
module.exports.resolveEnvFile = resolveEnvFile;
