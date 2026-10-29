import { useCallback, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { updateCollectionGitData } from 'providers/ReduxStore/slices/collections';
import { uuid } from 'utils/common';

export const useCollectionGit = (collection, { autoFetch = true } = {}) => {
  const dispatch = useDispatch();
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const collectionUid = collection?.uid;
  const collectionPath = collection?.pathname;
  const gitState = collection?.git || { isGitRepo: false, gitRootPath: null };
  const gitRootPath = gitState.gitRootPath || collectionPath;

  const refreshGitStatus = useCallback(async () => {
    const { ipcRenderer } = window;
    if (!ipcRenderer || !collectionUid || !collectionPath) {
      return null;
    }

    setIsLoading(true);
    try {
      const info = await ipcRenderer.invoke('renderer:git-get-repository-info', {
        collectionPath
      });
      if (info) {
        dispatch(updateCollectionGitData({ collectionUid, git: info }));
      }
      return info;
    } catch (error) {
      console.error('Failed to fetch git repository info:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [collectionUid, collectionPath, dispatch]);

  useEffect(() => {
    if (autoFetch && collectionUid && collectionPath) {
      refreshGitStatus();
    }
  }, [autoFetch, collectionUid, collectionPath, collection?.items, refreshGitStatus]);

  const initRepository = useCallback(async () => {
    const { ipcRenderer } = window;
    if (!ipcRenderer || !collectionPath) return null;
    setIsLoading(true);
    try {
      const info = await ipcRenderer.invoke('renderer:git-init', { collectionPath });
      if (info && collectionUid) {
        dispatch(updateCollectionGitData({ collectionUid, git: info }));
      }
      return info;
    } finally {
      setIsLoading(false);
    }
  }, [collectionPath, collectionUid, dispatch]);

  const stageFiles = useCallback(async (files) => {
    const { ipcRenderer } = window;
    if (!ipcRenderer || !gitRootPath) return null;
    const changedFiles = await ipcRenderer.invoke('renderer:git-stage-changes', {
      gitRootPath,
      files
    });
    if (changedFiles && collectionUid) {
      dispatch(updateCollectionGitData({
        collectionUid,
        git: { changedFiles }
      }));
    }
    return changedFiles;
  }, [gitRootPath, collectionUid, dispatch]);

  const unstageFiles = useCallback(async (files) => {
    const { ipcRenderer } = window;
    if (!ipcRenderer || !gitRootPath) return null;
    const changedFiles = await ipcRenderer.invoke('renderer:git-unstage-changes', {
      gitRootPath,
      files
    });
    if (changedFiles && collectionUid) {
      dispatch(updateCollectionGitData({
        collectionUid,
        git: { changedFiles }
      }));
    }
    return changedFiles;
  }, [gitRootPath, collectionUid, dispatch]);

  const discardFiles = useCallback(async (files) => {
    const { ipcRenderer } = window;
    if (!ipcRenderer || !gitRootPath) return null;
    const changedFiles = await ipcRenderer.invoke('renderer:git-discard-changes', {
      gitRootPath,
      files
    });
    if (changedFiles && collectionUid) {
      dispatch(updateCollectionGitData({
        collectionUid,
        git: { changedFiles }
      }));
    }
    return changedFiles;
  }, [gitRootPath, collectionUid, dispatch]);

  const commit = useCallback(async (message) => {
    const { ipcRenderer } = window;
    if (!ipcRenderer || !gitRootPath) return null;
    const info = await ipcRenderer.invoke('renderer:git-commit-changes', {
      gitRootPath,
      message
    });
    if (info && collectionUid) {
      dispatch(updateCollectionGitData({ collectionUid, git: info }));
    }
    return info;
  }, [gitRootPath, collectionUid, dispatch]);

  const checkoutBranch = useCallback(async ({ branchName, shouldCreate = false, isRemote = false, remoteName = 'origin' }) => {
    const { ipcRenderer } = window;
    if (!ipcRenderer || !gitRootPath) return null;
    setIsSyncing(true);
    try {
      const info = await ipcRenderer.invoke('renderer:git-checkout-branch', {
        gitRootPath,
        branchName,
        shouldCreate,
        isRemote,
        remoteName,
        processUid: uuid()
      });
      if (info && collectionUid) {
        dispatch(updateCollectionGitData({ collectionUid, git: info }));
      }
      return info;
    } finally {
      setIsSyncing(false);
    }
  }, [gitRootPath, collectionUid, dispatch]);

  const fetchRemote = useCallback(async (remote = 'origin') => {
    const { ipcRenderer } = window;
    if (!ipcRenderer || !gitRootPath) return null;
    setIsSyncing(true);
    try {
      const info = await ipcRenderer.invoke('renderer:git-fetch', {
        gitRootPath,
        remote
      });
      if (info && collectionUid) {
        dispatch(updateCollectionGitData({ collectionUid, git: info }));
      }
      return info;
    } finally {
      setIsSyncing(false);
    }
  }, [gitRootPath, collectionUid, dispatch]);

  const pullRemote = useCallback(async ({ remote = 'origin', remoteBranch, strategy = '--no-rebase' } = {}) => {
    const { ipcRenderer } = window;
    if (!ipcRenderer || !gitRootPath) return null;
    setIsSyncing(true);
    try {
      const branch = remoteBranch || gitState.currentGitBranch || 'main';
      const info = await ipcRenderer.invoke('renderer:git-pull', {
        gitRootPath,
        remote,
        remoteBranch: branch,
        strategy,
        processUid: uuid()
      });
      if (info && collectionUid) {
        dispatch(updateCollectionGitData({ collectionUid, git: info }));
      }
      return info;
    } finally {
      setIsSyncing(false);
    }
  }, [gitRootPath, gitState.currentGitBranch, collectionUid, dispatch]);

  const pushRemote = useCallback(async ({ remote = 'origin', remoteBranch } = {}) => {
    const { ipcRenderer } = window;
    if (!ipcRenderer || !gitRootPath) return null;
    setIsSyncing(true);
    try {
      const branch = remoteBranch || gitState.currentGitBranch || 'main';
      const info = await ipcRenderer.invoke('renderer:git-push', {
        gitRootPath,
        remote,
        remoteBranch: branch,
        processUid: uuid()
      });
      if (info && collectionUid) {
        dispatch(updateCollectionGitData({ collectionUid, git: info }));
      }
      return info;
    } finally {
      setIsSyncing(false);
    }
  }, [gitRootPath, gitState.currentGitBranch, collectionUid, dispatch]);

  const addGitRemote = useCallback(async ({ remoteName, remoteUrl }) => {
    const { ipcRenderer } = window;
    if (!ipcRenderer || !gitRootPath) return null;
    const remotes = await ipcRenderer.invoke('renderer:git-add-remote', {
      gitRootPath,
      remoteName,
      remoteUrl
    });
    await refreshGitStatus();
    return remotes;
  }, [gitRootPath, refreshGitStatus]);

  const removeGitRemote = useCallback(async ({ remoteName }) => {
    const { ipcRenderer } = window;
    if (!ipcRenderer || !gitRootPath) return null;
    const remotes = await ipcRenderer.invoke('renderer:git-remove-remote', {
      gitRootPath,
      remoteName
    });
    await refreshGitStatus();
    return remotes;
  }, [gitRootPath, refreshGitStatus]);

  return {
    gitState,
    isLoading,
    isSyncing,
    refreshGitStatus,
    initRepository,
    stageFiles,
    unstageFiles,
    discardFiles,
    commit,
    checkoutBranch,
    fetchRemote,
    pullRemote,
    pushRemote,
    addGitRemote,
    removeGitRemote
  };
};

export default useCollectionGit;
