const _ = require('lodash');
const Store = require('electron-store');
const { encryptStringSafe, decryptStringSafe } = require('../utils/encryption');

const posixifyPath = (p) => (p ? String(p).replace(/\\/g, '/') : '');

class KeyVaultStore {
  constructor() {
    this.store = new Store({
      name: 'keyvault-config',
      clearInvalidConfig: true
    });
  }

  getCollectionConfig(collectionPathname, environmentName = null) {
    const normalizedPath = posixifyPath(collectionPathname);
    const collections = this.store.get('collections') || [];
    const collectionEntry = _.find(collections, (c) => posixifyPath(c.path) === normalizedPath);

    const defaultConfig = {
      vaultName: '',
      authMethod: 'az-cli',
      autoFetchBeforeRequest: true,
      tenantId: '',
      clientId: '',
      clientSecret: '',
      lastSyncedAt: null
    };

    if (!collectionEntry) {
      return defaultConfig;
    }

    const baseConfig = {
      ...defaultConfig,
      ...(collectionEntry.config || {})
    };

    if (baseConfig.clientSecret) {
      baseConfig.clientSecret = decryptStringSafe(baseConfig.clientSecret).value || '';
    }

    if (environmentName && collectionEntry.environments && collectionEntry.environments[environmentName]) {
      const envConfig = { ...collectionEntry.environments[environmentName] };
      if (envConfig.clientSecret) {
        envConfig.clientSecret = decryptStringSafe(envConfig.clientSecret).value || '';
      }
      return {
        ...baseConfig,
        ..._.omitBy(envConfig, (v) => v === undefined || v === null || v === '')
      };
    }

    return baseConfig;
  }

  saveCollectionConfig(collectionPathname, config = {}, environmentName = null) {
    const normalizedPath = posixifyPath(collectionPathname);
    const collections = this.store.get('collections') || [];
    let collectionEntry = _.find(collections, (c) => posixifyPath(c.path) === normalizedPath);

    const sanitized = {
      vaultName: (config.vaultName || '').trim(),
      authMethod: config.authMethod || 'az-cli',
      autoFetchBeforeRequest: config.autoFetchBeforeRequest !== false,
      tenantId: (config.tenantId || '').trim(),
      clientId: (config.clientId || '').trim(),
      clientSecret: config.clientSecret ? encryptStringSafe(String(config.clientSecret)).value : '',
      lastSyncedAt: config.lastSyncedAt || null
    };

    if (!collectionEntry) {
      collectionEntry = {
        path: normalizedPath,
        config: sanitized,
        environments: {}
      };
      collections.push(collectionEntry);
    } else {
      collectionEntry.path = normalizedPath;
      collectionEntry.config = {
        ...(collectionEntry.config || {}),
        ...sanitized
      };
    }

    if (environmentName) {
      collectionEntry.environments = collectionEntry.environments || {};
      collectionEntry.environments[environmentName] = sanitized;
    }

    this.store.set('collections', collections);
    return this.getCollectionConfig(collectionPathname, environmentName);
  }

  updateLastSyncedAt(collectionPathname, environmentName = null, timestamp = new Date().toISOString()) {
    const current = this.getCollectionConfig(collectionPathname, environmentName);
    return this.saveCollectionConfig(
      collectionPathname,
      { ...current, lastSyncedAt: timestamp },
      environmentName
    );
  }
}

const keyVaultStore = new KeyVaultStore();

module.exports = {
  KeyVaultStore,
  keyVaultStore
};
