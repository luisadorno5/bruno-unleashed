const path = require('path');
const { ipcMain } = require('electron');
const {
  cloneGitRepository,
  getCollectionGitRepoUrl,
  listBranchesForRemoteUrl,
  getCollectionGitRootPath,
  getCollectionGitData,
  getChangedFilesInCollectionGit,
  getAheadBehindCount,
  fetchRemotes,
  addRemote,
  removeRemote,
  initGit,
  stageChanges,
  unstageChanges,
  discardChanges,
  commitChanges,
  getStagedFileDiff,
  getUnstagedFileDiff,
  getRenamedFileDiff,
  getWorkingFileContentForVisualDiff,
  checkoutGitBranch,
  checkoutRemoteGitBranch,
  fetchRemoteBranches,
  fetchChanges,
  pullGitChanges,
  pushGitChanges,
  getCollectionGitLogs,
  getCommitFiles,
  getCommitFileDiff,
  getFileContentForVisualDiff,
  createStash,
  listStashes,
  applyStash,
  dropStash
} = require('../utils/git');
const { createDirectory, removeDirectory } = require('../utils/filesystem');

const resolveGitRoot = (collectionOrGitPath) => {
  if (!collectionOrGitPath || typeof collectionOrGitPath !== 'string') {
    return null;
  }
  if (typeof getCollectionGitRootPath === 'function') {
    return getCollectionGitRootPath(collectionOrGitPath) || null;
  }
  return collectionOrGitPath;
};

const toAbsoluteFilePaths = (gitRootPath, files = []) =>
  (Array.isArray(files) ? files : []).map((filePath) =>
    path.isAbsolute(filePath) ? filePath : path.join(gitRootPath, filePath)
  );

const toRelativeFilePath = (gitRootPath, filePath = '') =>
  (path.isAbsolute(filePath) ? path.relative(gitRootPath, filePath) : filePath).replace(/\\/g, '/');

const getCollectionGitRemoteUrl = async (collectionPath) => {
  try {
    const url = await getCollectionGitRepoUrl(collectionPath);
    return url || null;
  } catch (error) {
    return null;
  }
};

const handleListRemoteBranches = async (event, { url }) => {
  const repositoryUrl = typeof url === 'string' ? url.trim() : '';
  if (!repositoryUrl) {
    throw new Error('Repository URL is required');
  }
  // git reads a dash-leading url as a command option, not a repository
  if (repositoryUrl.startsWith('-')) {
    throw new Error('Repository URL is not valid');
  }

  return listBranchesForRemoteUrl({ url: repositoryUrl });
};

const handleGetRepositoryInfo = async (event, { collectionPath }) => {
  if (!collectionPath) {
    return { isGitRepo: false, gitRootPath: null };
  }

  const gitRootPath = resolveGitRoot(collectionPath);
  if (!gitRootPath) {
    return { isGitRepo: false, gitRootPath: null };
  }

  const [gitData, changedFiles, aheadBehind, remotes] = await Promise.all([
    getCollectionGitData(gitRootPath, collectionPath).catch(() => ({})),
    getChangedFilesInCollectionGit(gitRootPath, collectionPath).catch(() => ({
      staged: [],
      unstaged: [],
      conflicted: [],
      totalFiles: 0,
      tooManyFiles: false
    })),
    getAheadBehindCount(gitRootPath).catch(() => ({
      ahead: 0,
      behind: 0,
      aheadCommits: [],
      behindCommits: []
    })),
    fetchRemotes(gitRootPath).catch(() => [])
  ]);

  return {
    isGitRepo: true,
    ...gitData,
    gitRootPath,
    changedFiles,
    aheadBehind,
    remotes
  };
};

const handleGetWorkingFileDiff = async (event, { gitRootPath: rawGitRoot, filePath, type = 'unstaged', fromPath }) => {
  const gitRootPath = resolveGitRoot(rawGitRoot) || rawGitRoot;
  if (!gitRootPath || !filePath) {
    throw new Error('gitRootPath and filePath are required');
  }

  const relPath = toRelativeFilePath(gitRootPath, filePath);
  const absPath = path.join(gitRootPath, relPath);

  let rawDiff = '';
  if (type === 'renamed' && fromPath) {
    rawDiff = await getRenamedFileDiff(gitRootPath, {
      from: toRelativeFilePath(gitRootPath, fromPath),
      to: relPath
    });
  } else if (type === 'staged') {
    rawDiff = await getStagedFileDiff(gitRootPath, absPath);
  } else {
    rawDiff = await getUnstagedFileDiff(gitRootPath, absPath);
  }

  let visualDiff = null;
  try {
    visualDiff = await getWorkingFileContentForVisualDiff(gitRootPath, relPath, type === 'renamed' ? 'staged' : type);
  } catch (err) {
    visualDiff = null;
  }

  return {
    filePath: relPath,
    type,
    rawDiff: rawDiff || '',
    visualDiff
  };
};

const handleGetCommitFileDiff = async (event, { gitRootPath: rawGitRoot, commitHash, filePath }) => {
  const gitRootPath = resolveGitRoot(rawGitRoot) || rawGitRoot;
  if (!gitRootPath || !commitHash || !filePath) {
    throw new Error('gitRootPath, commitHash, and filePath are required');
  }

  const relPath = toRelativeFilePath(gitRootPath, filePath);
  const [rawDiff, visualDiff] = await Promise.all([
    getCommitFileDiff(gitRootPath, commitHash, relPath).catch(() => ''),
    getFileContentForVisualDiff(gitRootPath, commitHash, relPath).catch(() => null)
  ]);

  return {
    filePath: relPath,
    commitHash,
    rawDiff: rawDiff || '',
    visualDiff
  };
};

const registerGitIpc = (mainWindow) => {
  ipcMain.handle('renderer:clone-git-repository', async (event, { url, path: targetPath, processUid, branch }) => {
    let directoryCreated = false;
    try {
      await createDirectory(targetPath);
      directoryCreated = true;
      await cloneGitRepository(mainWindow, { url, path: targetPath, processUid, branch });
      return 'Repository cloned successfully';
    } catch (error) {
      if (directoryCreated) {
        await removeDirectory(targetPath);
      }
      return Promise.reject(error);
    }
  });

  ipcMain.handle('renderer:get-collection-git-remote-url', (event, collectionPath) =>
    getCollectionGitRemoteUrl(collectionPath)
  );

  ipcMain.handle('renderer:list-remote-branches-for-url', handleListRemoteBranches);

  ipcMain.handle('renderer:git-get-repository-info', handleGetRepositoryInfo);

  ipcMain.handle('renderer:git-init', async (event, { collectionPath }) => {
    if (!collectionPath) {
      throw new Error('Collection path is required');
    }
    await initGit(collectionPath);
    return handleGetRepositoryInfo(event, { collectionPath });
  });

  ipcMain.handle('renderer:git-stage-changes', async (event, { gitRootPath: rawGitRoot, files }) => {
    const gitRootPath = resolveGitRoot(rawGitRoot) || rawGitRoot;
    if (!gitRootPath) throw new Error('Git repository path is required');
    const absFiles = toAbsoluteFilePaths(gitRootPath, files);
    await stageChanges(gitRootPath, absFiles);
    return getChangedFilesInCollectionGit(gitRootPath, gitRootPath);
  });

  ipcMain.handle('renderer:git-unstage-changes', async (event, { gitRootPath: rawGitRoot, files }) => {
    const gitRootPath = resolveGitRoot(rawGitRoot) || rawGitRoot;
    if (!gitRootPath) throw new Error('Git repository path is required');
    const absFiles = toAbsoluteFilePaths(gitRootPath, files);
    await unstageChanges(gitRootPath, absFiles);
    return getChangedFilesInCollectionGit(gitRootPath, gitRootPath);
  });

  ipcMain.handle('renderer:git-discard-changes', async (event, { gitRootPath: rawGitRoot, files }) => {
    const gitRootPath = resolveGitRoot(rawGitRoot) || rawGitRoot;
    if (!gitRootPath) throw new Error('Git repository path is required');
    const absFiles = toAbsoluteFilePaths(gitRootPath, files);
    await discardChanges(gitRootPath, absFiles);
    return getChangedFilesInCollectionGit(gitRootPath, gitRootPath);
  });

  ipcMain.handle('renderer:git-commit-changes', async (event, { gitRootPath: rawGitRoot, message }) => {
    const gitRootPath = resolveGitRoot(rawGitRoot) || rawGitRoot;
    if (!gitRootPath) throw new Error('Git repository path is required');
    const trimmedMessage = typeof message === 'string' ? message.trim() : '';
    if (!trimmedMessage) throw new Error('Commit message is required');
    await commitChanges(gitRootPath, trimmedMessage);
    return handleGetRepositoryInfo(event, { collectionPath: gitRootPath });
  });

  ipcMain.handle('renderer:git-get-working-file-diff', handleGetWorkingFileDiff);

  ipcMain.handle('renderer:git-checkout-branch', async (event, { gitRootPath: rawGitRoot, branchName, shouldCreate = false, isRemote = false, remoteName = 'origin', processUid }) => {
    const gitRootPath = resolveGitRoot(rawGitRoot) || rawGitRoot;
    if (!gitRootPath || !branchName) {
      throw new Error('Git repository path and branch name are required');
    }
    if (isRemote) {
      await checkoutRemoteGitBranch(mainWindow, { gitRootPath, remoteName, branchName, processUid });
    } else {
      await checkoutGitBranch(mainWindow, { gitRootPath, branchName, processUid, shouldCreate });
    }
    return handleGetRepositoryInfo(event, { collectionPath: gitRootPath });
  });

  ipcMain.handle('renderer:git-fetch', async (event, { gitRootPath: rawGitRoot, remote = 'origin' }) => {
    const gitRootPath = resolveGitRoot(rawGitRoot) || rawGitRoot;
    if (!gitRootPath) throw new Error('Git repository path is required');
    await fetchChanges(gitRootPath, remote);
    return handleGetRepositoryInfo(event, { collectionPath: gitRootPath });
  });

  ipcMain.handle('renderer:git-pull', async (event, { gitRootPath: rawGitRoot, remote = 'origin', remoteBranch, strategy = '--no-rebase', processUid }) => {
    const gitRootPath = resolveGitRoot(rawGitRoot) || rawGitRoot;
    if (!gitRootPath) throw new Error('Git repository path is required');
    await pullGitChanges(mainWindow, {
      gitRootPath,
      processUid,
      remote,
      remoteBranch,
      strategy
    });
    return handleGetRepositoryInfo(event, { collectionPath: gitRootPath });
  });

  ipcMain.handle('renderer:git-push', async (event, { gitRootPath: rawGitRoot, remote = 'origin', remoteBranch, processUid }) => {
    const gitRootPath = resolveGitRoot(rawGitRoot) || rawGitRoot;
    if (!gitRootPath) throw new Error('Git repository path is required');
    await pushGitChanges(mainWindow, {
      gitRootPath,
      processUid,
      remote,
      remoteBranch
    });
    return handleGetRepositoryInfo(event, { collectionPath: gitRootPath });
  });

  ipcMain.handle('renderer:git-get-logs', async (event, { gitRootPath: rawGitRoot }) => {
    const gitRootPath = resolveGitRoot(rawGitRoot) || rawGitRoot;
    if (!gitRootPath) return [];
    return getCollectionGitLogs(gitRootPath);
  });

  ipcMain.handle('renderer:git-get-commit-files', async (event, { gitRootPath: rawGitRoot, commitHash }) => {
    const gitRootPath = resolveGitRoot(rawGitRoot) || rawGitRoot;
    if (!gitRootPath || !commitHash) return [];
    return getCommitFiles(gitRootPath, commitHash);
  });

  ipcMain.handle('renderer:git-get-commit-file-diff', handleGetCommitFileDiff);

  ipcMain.handle('renderer:git-fetch-remote-branches', async (event, { gitRootPath: rawGitRoot, remote = 'origin' }) => {
    const gitRootPath = resolveGitRoot(rawGitRoot) || rawGitRoot;
    if (!gitRootPath) return [];
    return fetchRemoteBranches({ gitRootPath, remote });
  });

  ipcMain.handle('renderer:git-add-remote', async (event, { gitRootPath: rawGitRoot, remoteName, remoteUrl }) => {
    const gitRootPath = resolveGitRoot(rawGitRoot) || rawGitRoot;
    if (!gitRootPath || !remoteName || !remoteUrl) {
      throw new Error('gitRootPath, remoteName, and remoteUrl are required');
    }
    return addRemote({ gitRootPath, remoteName: remoteName.trim(), remoteUrl: remoteUrl.trim() });
  });

  ipcMain.handle('renderer:git-remove-remote', async (event, { gitRootPath: rawGitRoot, remoteName }) => {
    const gitRootPath = resolveGitRoot(rawGitRoot) || rawGitRoot;
    if (!gitRootPath || !remoteName) {
      throw new Error('gitRootPath and remoteName are required');
    }
    return removeRemote({ gitRootPath, remoteName: remoteName.trim() });
  });

  ipcMain.handle('renderer:git-list-stashes', async (event, { gitRootPath: rawGitRoot }) => {
    const gitRootPath = resolveGitRoot(rawGitRoot) || rawGitRoot;
    if (!gitRootPath) return [];
    return listStashes(gitRootPath);
  });

  ipcMain.handle('renderer:git-create-stash', async (event, { gitRootPath: rawGitRoot, message }) => {
    const gitRootPath = resolveGitRoot(rawGitRoot) || rawGitRoot;
    if (!gitRootPath) throw new Error('Git repository path is required');
    await createStash(gitRootPath, message || 'WIP on Bruno collection');
    return handleGetRepositoryInfo(event, { collectionPath: gitRootPath });
  });

  ipcMain.handle('renderer:git-apply-stash', async (event, { gitRootPath: rawGitRoot, stashIndex }) => {
    const gitRootPath = resolveGitRoot(rawGitRoot) || rawGitRoot;
    if (!gitRootPath) throw new Error('Git repository path is required');
    await applyStash(gitRootPath, stashIndex);
    return handleGetRepositoryInfo(event, { collectionPath: gitRootPath });
  });

  ipcMain.handle('renderer:git-drop-stash', async (event, { gitRootPath: rawGitRoot, stashIndex }) => {
    const gitRootPath = resolveGitRoot(rawGitRoot) || rawGitRoot;
    if (!gitRootPath) throw new Error('Git repository path is required');
    await dropStash(gitRootPath, stashIndex);
    return listStashes(gitRootPath);
  });
};

module.exports = registerGitIpc;
module.exports.getCollectionGitRemoteUrl = getCollectionGitRemoteUrl;
module.exports.handleListRemoteBranches = handleListRemoteBranches;
module.exports.handleGetRepositoryInfo = handleGetRepositoryInfo;
module.exports.handleGetWorkingFileDiff = handleGetWorkingFileDiff;
module.exports.handleGetCommitFileDiff = handleGetCommitFileDiff;
