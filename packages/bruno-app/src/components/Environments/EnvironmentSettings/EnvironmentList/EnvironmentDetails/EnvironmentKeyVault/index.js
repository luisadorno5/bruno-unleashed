import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import {
  IconKey,
  IconRefresh,
  IconPlus,
  IconTrash,
  IconCheck,
  IconAlertTriangle,
  IconCloudDownload,
  IconDeviceFloppy,
  IconShieldLock
} from '@tabler/icons';
import toast from 'react-hot-toast';
import { saveEnvironmentExternalSecrets } from 'providers/ReduxStore/slices/collections';
import StyledWrapper from './StyledWrapper';

const parseInitialMappings = (environment) => {
  const raw = environment?.externalSecrets?.variables || [];
  return raw.map((entry, idx) => {
    let vaultName = entry.vaultName || '';
    let secretName = entry.secretName || entry.path || '';
    if ((!vaultName || !secretName) && entry.value) {
      const val = String(entry.value).trim();
      if (val.includes('/')) {
        const [v, s] = val.split('/');
        if (!vaultName) vaultName = v;
        if (!secretName) secretName = s;
      } else if (!secretName) {
        secretName = val;
      }
    }
    return {
      id: `${entry.name || 'row'}-${idx}`,
      name: entry.name || '',
      secretName: secretName || '',
      vaultName: vaultName || ''
    };
  });
};

const toEnvVarName = (secretName = '') => String(secretName).replace(/-/g, '_');

const EnvironmentKeyVault = ({ environment, collection, searchQuery = '' }) => {
  const dispatch = useDispatch();

  const [config, setConfig] = useState({
    vaultName: '',
    authMethod: 'az-cli',
    autoFetchBeforeRequest: true,
    tenantId: '',
    clientId: '',
    clientSecret: '',
    lastSyncedAt: null
  });

  const [azStatus, setAzStatus] = useState({ loading: true, loggedIn: false, user: '', subscriptionName: '' });
  const [mappings, setMappings] = useState(() => parseInitialMappings(environment));
  const [vaultSecrets, setVaultSecrets] = useState([]);
  const [isLoadingSecrets, setIsLoadingSecrets] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [syncResultsByVar, setSyncResultsByVar] = useState({});

  // Reload mappings when switching environment
  useEffect(() => {
    setMappings(parseInitialMappings(environment));
    setSyncResultsByVar({});
  }, [environment?.uid, environment?.externalSecrets]);

  const loadConfigAndAzStatus = useCallback(async () => {
    const { ipcRenderer } = window;
    if (!ipcRenderer || !collection?.pathname) return;

    try {
      const savedConfig = await ipcRenderer.invoke('renderer:keyvault-get-config', {
        collectionPathname: collection.pathname,
        environmentName: environment?.name
      });
      if (savedConfig) {
        setConfig((prev) => ({
          ...prev,
          ...savedConfig,
          // If vaultName wasn't saved yet in config store, infer from existing externalSecrets if present
          vaultName:
            savedConfig.vaultName
            || parseInitialMappings(environment).find((m) => m.vaultName)?.vaultName
            || ''
        }));
      }
    } catch (error) {
      console.error('Error loading Key Vault config:', error);
    }

    setAzStatus((prev) => ({ ...prev, loading: true }));
    try {
      const status = await ipcRenderer.invoke('renderer:keyvault-get-az-status');
      setAzStatus({ loading: false, ...(status || { loggedIn: false }) });
    } catch (error) {
      setAzStatus({ loading: false, loggedIn: false, error: error.message });
    }
  }, [collection?.pathname, environment?.name]);

  useEffect(() => {
    loadConfigAndAzStatus();
  }, [loadConfigAndAzStatus]);

  const handleSaveConfigOnly = async () => {
    const { ipcRenderer } = window;
    if (!ipcRenderer || !collection?.pathname) return;
    setIsSaving(true);
    try {
      const saved = await ipcRenderer.invoke('renderer:keyvault-save-config', {
        collectionPathname: collection.pathname,
        environmentName: environment?.name,
        config
      });
      setConfig((prev) => ({ ...prev, ...saved }));
      toast.success('Key Vault configuration saved');
    } catch (error) {
      toast.error(error?.message || 'Failed to save Key Vault configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadVaultSecrets = async () => {
    const { ipcRenderer } = window;
    if (!ipcRenderer) return;
    if (!config.vaultName?.trim()) {
      toast.error('Enter an Azure Key Vault name or URL first');
      return;
    }

    setIsLoadingSecrets(true);
    try {
      await ipcRenderer.invoke('renderer:keyvault-save-config', {
        collectionPathname: collection.pathname,
        environmentName: environment?.name,
        config
      });

      const res = await ipcRenderer.invoke('renderer:keyvault-test-connection', {
        vaultName: config.vaultName,
        authConfig: config
      });
      setVaultSecrets(res?.secrets || []);
      toast.success(`Connected to Key Vault (${res?.secretCount || 0} secrets available)`);
    } catch (error) {
      toast.error(error?.message || 'Failed to connect to Azure Key Vault');
    } finally {
      setIsLoadingSecrets(false);
    }
  };

  const handleAddMappingRow = (secretName = '', varName = '') => {
    setMappings((prev) => [
      ...prev,
      {
        id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: varName || (secretName ? toEnvVarName(secretName) : ''),
        secretName: secretName || '',
        vaultName: config.vaultName || ''
      }
    ]);
  };

  const handleMapAllVaultSecrets = () => {
    const existingSecrets = new Set(mappings.map((m) => m.secretName));
    const toAdd = vaultSecrets
      .filter((s) => s.enabled !== false && !existingSecrets.has(s.secretName))
      .map((s) => ({
        id: `row-${s.secretName}-${Date.now()}`,
        name: toEnvVarName(s.secretName),
        secretName: s.secretName,
        vaultName: config.vaultName || ''
      }));

    if (toAdd.length === 0) {
      toast('All available Key Vault secrets are already mapped');
      return;
    }

    setMappings((prev) => [...prev, ...toAdd]);
    toast.success(`Added ${toAdd.length} secret mapping(s)`);
  };

  const handleUpdateMapping = (id, field, value) => {
    setMappings((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const handleRemoveMapping = (id) => {
    setMappings((prev) => prev.filter((row) => row.id !== id));
  };

  const handleSaveMappings = async () => {
    const { ipcRenderer } = window;
    if (!ipcRenderer || !collection?.pathname || !environment?.name) return;

    setIsSaving(true);
    try {
      const validMappings = mappings.filter((m) => m.name?.trim());
      const result = await ipcRenderer.invoke('renderer:keyvault-save-mappings', {
        collectionPathname: collection.pathname,
        environmentName: environment.name,
        mappings: validMappings,
        config
      });

      dispatch(
        saveEnvironmentExternalSecrets({
          collectionUid: collection.uid,
          environmentUid: environment.uid,
          externalSecrets: result?.externalSecrets
        })
      );
      toast.success('Key Vault mappings saved to environment');
    } catch (error) {
      toast.error(error?.message || 'Failed to save Key Vault mappings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncFromKeyVault = async () => {
    const { ipcRenderer } = window;
    if (!ipcRenderer || !collection?.pathname || !environment?.name) return;

    const validMappings = mappings.filter((m) => m.name?.trim());
    if (validMappings.length === 0) {
      toast.error('Add at least one secret variable mapping before syncing');
      return;
    }

    setIsSyncing(true);
    try {
      const result = await ipcRenderer.invoke('renderer:keyvault-sync-environment', {
        collectionPathname: collection.pathname,
        environment,
        mappings: validMappings,
        config
      });

      const statusMap = {};
      let okCount = 0;
      let errCount = 0;
      for (const item of result?.results || []) {
        statusMap[item.name] = item;
        if (item.status === 'ok') okCount += 1;
        else errCount += 1;
      }
      setSyncResultsByVar(statusMap);

      if (result?.lastSyncedAt) {
        setConfig((prev) => ({ ...prev, lastSyncedAt: result.lastSyncedAt }));
      }

      dispatch(
        saveEnvironmentExternalSecrets({
          collectionUid: collection.uid,
          environmentUid: environment.uid,
          externalSecrets: result?.externalSecrets,
          variables: result?.variables
        })
      );

      if (errCount === 0) {
        toast.success(`Synced ${okCount} secret(s) from Azure Key Vault into "${environment.name}"`);
      } else {
        toast.error(`Synced ${okCount} secret(s); ${errCount} failed (hover row status for details)`);
      }
    } catch (error) {
      toast.error(error?.message || 'Failed to sync secrets from Azure Key Vault');
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredMappings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return mappings;
    return mappings.filter(
      (m) =>
        m.name.toLowerCase().includes(q)
        || m.secretName.toLowerCase().includes(q)
        || m.vaultName.toLowerCase().includes(q)
    );
  }, [mappings, searchQuery]);

  const mappedSecretNames = useMemo(
    () => new Set(mappings.map((m) => m.secretName)),
    [mappings]
  );

  return (
    <StyledWrapper>
      {/* 1. Connection & Authentication Card */}
      <div className="kv-card">
        <div className="kv-card-header">
          <div className="kv-title-group">
            <IconShieldLock size={16} />
            <span>Azure Key Vault Connection</span>
          </div>
          <div className="kv-actions">
            <button
              type="button"
              className="kv-btn"
              onClick={handleLoadVaultSecrets}
              disabled={isLoadingSecrets || !config.vaultName?.trim()}
            >
              <IconRefresh size={14} />
              <span>{isLoadingSecrets ? 'Connecting...' : 'Test & Load Secrets'}</span>
            </button>
            <button
              type="button"
              className="kv-btn"
              onClick={handleSaveConfigOnly}
              disabled={isSaving}
            >
              <IconDeviceFloppy size={14} />
              <span>Save Config</span>
            </button>
            <button
              type="button"
              className="kv-btn primary"
              onClick={handleSyncFromKeyVault}
              disabled={isSyncing || mappings.length === 0}
            >
              <IconCloudDownload size={14} />
              <span>{isSyncing ? 'Syncing Secrets...' : 'Sync Secrets to Environment'}</span>
            </button>
          </div>
        </div>

        <div className="kv-grid">
          <div className="kv-field">
            <label>Key Vault Name or URL</label>
            <input
              type="text"
              placeholder="e.g. my-company-kv or https://my-company-kv.vault.azure.net"
              value={config.vaultName}
              onChange={(e) => setConfig((prev) => ({ ...prev, vaultName: e.target.value }))}
            />
          </div>

          <div className="kv-field">
            <label>Authentication Method</label>
            <select
              value={config.authMethod}
              onChange={(e) => setConfig((prev) => ({ ...prev, authMethod: e.target.value }))}
            >
              <option value="az-cli">Azure CLI (`az login` session)</option>
              <option value="service-principal">Service Principal (Client Credentials)</option>
            </select>
          </div>

          <div className="kv-field">
            <label>Tenant ID (Optional for Azure CLI)</label>
            <input
              type="text"
              placeholder={azStatus.tenantId || 'Default Tenant'}
              value={config.tenantId}
              onChange={(e) => setConfig((prev) => ({ ...prev, tenantId: e.target.value }))}
            />
          </div>
        </div>

        {config.authMethod === 'service-principal' && (
          <div className="kv-grid">
            <div className="kv-field">
              <label>Client ID (App ID)</label>
              <input
                type="text"
                placeholder="00000000-0000-0000-0000-000000000000"
                value={config.clientId}
                onChange={(e) => setConfig((prev) => ({ ...prev, clientId: e.target.value }))}
              />
            </div>
            <div className="kv-field">
              <label>Client Secret</label>
              <input
                type="password"
                placeholder="Enter Service Principal Client Secret"
                value={config.clientSecret}
                onChange={(e) => setConfig((prev) => ({ ...prev, clientSecret: e.target.value }))}
              />
            </div>
          </div>
        )}

        <div className="kv-status-row">
          <div className="flex items-center gap-2">
            {config.authMethod === 'az-cli' && (
              azStatus.loading ? (
                <span className="kv-status-pill warn">Checking Azure CLI session...</span>
              ) : azStatus.loggedIn ? (
                <span className="kv-status-pill ok">
                  <IconCheck size={13} />
                  <span>
                    Azure CLI: {azStatus.user}
                    {azStatus.subscriptionName ? ` (${azStatus.subscriptionName})` : ''}
                  </span>
                </span>
              ) : (
                <span className="kv-status-pill warn" title={azStatus.error}>
                  <IconAlertTriangle size={13} />
                  <span>Not signed in to Azure CLI — run `az login` in terminal</span>
                </span>
              )
            )}
            {config.lastSyncedAt && (
              <span className="kv-hint">
                Last synced: {new Date(config.lastSyncedAt).toLocaleString()}
              </span>
            )}
          </div>

          <label className="kv-checkbox-label">
            <input
              type="checkbox"
              checked={config.autoFetchBeforeRequest !== false}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, autoFetchBeforeRequest: e.target.checked }))}
            />
            <span>Auto-fetch mapped secrets before requests run</span>
          </label>
        </div>
      </div>

      {/* 2. Available Key Vault Secrets Browser (shown when secrets are loaded from Vault) */}
      {vaultSecrets.length > 0 && (
        <div className="kv-card">
          <div className="kv-card-header">
            <div className="kv-title-group">
              <IconKey size={15} />
              <span>Available Secrets in Vault ({vaultSecrets.length})</span>
            </div>
            <div className="kv-actions">
              <button type="button" className="kv-btn" onClick={handleMapAllVaultSecrets}>
                <IconPlus size={13} />
                <span>Map All Unmapped Secrets</span>
              </button>
            </div>
          </div>
          <div className="kv-browser-chips">
            {vaultSecrets.map((s) => {
              const isMapped = mappedSecretNames.has(s.secretName);
              return (
                <button
                  key={s.secretName}
                  type="button"
                  className={`kv-secret-chip ${isMapped ? 'mapped' : ''}`}
                  disabled={isMapped}
                  onClick={() => handleAddMappingRow(s.secretName)}
                  title={isMapped ? 'Already mapped below' : `Click to map "${s.secretName}"`}
                >
                  <span>{s.secretName}</span>
                  {isMapped ? <IconCheck size={12} /> : <IconPlus size={12} />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Secret Variable Mappings Table */}
      <div className="kv-card">
        <div className="kv-card-header">
          <div className="kv-title-group">
            <IconKey size={15} />
            <span>Environment Secret Mappings ({mappings.length})</span>
          </div>
          <div className="kv-actions">
            <button type="button" className="kv-btn" onClick={() => handleAddMappingRow()}>
              <IconPlus size={13} />
              <span>Add Secret Mapping</span>
            </button>
            <button
              type="button"
              className="kv-btn"
              onClick={handleSaveMappings}
              disabled={isSaving}
            >
              <IconDeviceFloppy size={13} />
              <span>Save Mappings</span>
            </button>
          </div>
        </div>

        <datalist id="azure-kv-secret-names">
          {vaultSecrets.map((s) => (
            <option key={s.secretName} value={s.secretName} />
          ))}
        </datalist>

        <table className="kv-table">
          <thead>
            <tr>
              <th style={{ width: '34%' }}>Bruno Variable Name (`{'{{varName}}'}`)</th>
              <th style={{ width: '36%' }}>Key Vault Secret Name</th>
              <th style={{ width: '20%' }}>Vault Name (Optional Override)</th>
              <th style={{ width: '10%' }}>Status</th>
              <th style={{ width: '36px' }}></th>
            </tr>
          </thead>
          <tbody>
            {filteredMappings.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '18px 8px', opacity: 0.7 }}>
                  No Key Vault secret mappings yet. Click &ldquo;Add Secret Mapping&rdquo; or &ldquo;Test &amp; Load Secrets&rdquo; to import secrets from Azure Key Vault.
                </td>
              </tr>
            ) : (
              filteredMappings.map((row) => {
                const syncStatus = syncResultsByVar[row.name];
                return (
                  <tr key={row.id}>
                    <td>
                      <input
                        type="text"
                        placeholder="e.g. api_key"
                        value={row.name}
                        onChange={(e) => handleUpdateMapping(row.id, 'name', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        list="azure-kv-secret-names"
                        placeholder={row.name ? row.name.replace(/_/g, '-') : 'e.g. api-key'}
                        value={row.secretName}
                        onChange={(e) => handleUpdateMapping(row.id, 'secretName', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        placeholder={config.vaultName || 'Default vault'}
                        value={row.vaultName}
                        onChange={(e) => handleUpdateMapping(row.id, 'vaultName', e.target.value)}
                      />
                    </td>
                    <td>
                      {syncStatus ? (
                        syncStatus.status === 'ok' ? (
                          <span className="kv-status-pill ok">
                            <IconCheck size={12} />
                            <span>Synced</span>
                          </span>
                        ) : (
                          <span className="kv-status-pill warn" title={syncStatus.error}>
                            <IconAlertTriangle size={12} />
                            <span>Error</span>
                          </span>
                        )
                      ) : (
                        <span className="kv-hint">Mapped</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="kv-icon-btn"
                        title="Remove mapping"
                        onClick={() => handleRemoveMapping(row.id)}
                      >
                        <IconTrash size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        <div className="kv-hint">
          <strong>Tip:</strong> Clicking <strong>Sync Secrets to Environment</strong> pulls the secret values from Azure Key Vault and stores them encrypted in the <strong>Secrets</strong> tab while saving only the secret names (`externalSecrets`) in your environment file for Git. You can also reference secrets dynamically using <code>{'{{$keyvault.secret-name}}'}</code> or <code>{'{{$keyvault.vault-name.secret-name}}'}</code>.
        </div>
      </div>
    </StyledWrapper>
  );
};

export default EnvironmentKeyVault;
