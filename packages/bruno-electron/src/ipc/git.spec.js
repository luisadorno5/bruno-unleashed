jest.mock('electron', () => ({ ipcMain: { handle: jest.fn() } }));
jest.mock('../utils/git', () => ({
  cloneGitRepository: jest.fn(),
  getCollectionGitRepoUrl: jest.fn(),
  listBranchesForRemoteUrl: jest.fn(),
  getCollectionGitRootPath: jest.fn(),
  getCollectionGitData: jest.fn(),
  getChangedFilesInCollectionGit: jest.fn(),
  getAheadBehindCount: jest.fn(),
  fetchRemotes: jest.fn(),
  getStagedFileDiff: jest.fn(),
  getUnstagedFileDiff: jest.fn(),
  getRenamedFileDiff: jest.fn(),
  getWorkingFileContentForVisualDiff: jest.fn(),
  getCommitFileDiff: jest.fn(),
  getFileContentForVisualDiff: jest.fn(),
  stageChanges: jest.fn(),
  unstageChanges: jest.fn(),
  discardChanges: jest.fn(),
  commitChanges: jest.fn()
}));
jest.mock('../utils/filesystem', () => ({
  createDirectory: jest.fn(),
  removeDirectory: jest.fn()
}));

const {
  getCollectionGitRepoUrl,
  listBranchesForRemoteUrl,
  getCollectionGitRootPath,
  getCollectionGitData,
  getChangedFilesInCollectionGit,
  getAheadBehindCount,
  fetchRemotes,
  getStagedFileDiff,
  getWorkingFileContentForVisualDiff,
  getCommitFileDiff,
  getFileContentForVisualDiff
} = require('../utils/git');
const {
  getCollectionGitRemoteUrl,
  handleListRemoteBranches,
  handleGetRepositoryInfo,
  handleGetWorkingFileDiff,
  handleGetCommitFileDiff
} = require('./git');

describe('getCollectionGitRemoteUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the origin url for the collection path', async () => {
    getCollectionGitRepoUrl.mockResolvedValue('https://github.com/org/repo.git');

    expect(await getCollectionGitRemoteUrl('/tmp/repo/collection')).toBe('https://github.com/org/repo.git');
    expect(getCollectionGitRepoUrl).toHaveBeenCalledWith('/tmp/repo/collection');
  });

  it('maps an empty remote url to null', async () => {
    getCollectionGitRepoUrl.mockResolvedValue('');

    expect(await getCollectionGitRemoteUrl('/tmp/repo')).toBeNull();
  });

  it('returns null when the collection is not a git repo (lookup throws)', async () => {
    getCollectionGitRepoUrl.mockRejectedValue(new Error('not a git repository'));

    expect(await getCollectionGitRemoteUrl('/tmp/not-a-repo')).toBeNull();
  });
});

describe('handleListRemoteBranches', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the branch listing for the url', async () => {
    listBranchesForRemoteUrl.mockResolvedValue({ branches: ['main', 'develop'], defaultBranch: 'main' });

    expect(await handleListRemoteBranches({}, { url: '  https://github.com/org/repo.git  ' })).toEqual({
      branches: ['main', 'develop'],
      defaultBranch: 'main'
    });
    expect(listBranchesForRemoteUrl).toHaveBeenCalledWith({ url: 'https://github.com/org/repo.git' });
  });

  it('rejects a missing url', async () => {
    await expect(handleListRemoteBranches({}, { url: '   ' })).rejects.toThrow('Repository URL is required');
    expect(listBranchesForRemoteUrl).not.toHaveBeenCalled();
  });

  it('rejects a url that git would read as a command option', async () => {
    await expect(handleListRemoteBranches({}, { url: '--upload-pack=touch /tmp/pwned' }))
      .rejects.toThrow('Repository URL is not valid');
    expect(listBranchesForRemoteUrl).not.toHaveBeenCalled();
  });
});

describe('handleGetRepositoryInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns isGitRepo: false when collection is not in a git repository', async () => {
    getCollectionGitRootPath.mockReturnValue(null);
    const result = await handleGetRepositoryInfo({}, { collectionPath: '/tmp/not-git' });
    expect(result).toEqual({ isGitRepo: false, gitRootPath: null });
  });

  it('aggregates gitData, changedFiles, aheadBehind, and remotes for a valid git repo', async () => {
    getCollectionGitRootPath.mockReturnValue('/tmp/repo');
    getCollectionGitData.mockResolvedValue({ currentBranch: 'main', branches: ['main', 'feat/ui'] });
    getChangedFilesInCollectionGit.mockResolvedValue({
      staged: [{ path: 'users.bru', status: 'modified' }],
      unstaged: [],
      conflicted: [],
      totalFiles: 1,
      tooManyFiles: false
    });
    getAheadBehindCount.mockResolvedValue({ ahead: 2, behind: 0, aheadCommits: [], behindCommits: [] });
    fetchRemotes.mockResolvedValue([{ name: 'origin', refs: { fetch: 'https://github.com/user/repo.git' } }]);

    const result = await handleGetRepositoryInfo({}, { collectionPath: '/tmp/repo/sub' });
    expect(result).toEqual({
      isGitRepo: true,
      gitRootPath: '/tmp/repo',
      currentBranch: 'main',
      branches: ['main', 'feat/ui'],
      changedFiles: {
        staged: [{ path: 'users.bru', status: 'modified' }],
        unstaged: [],
        conflicted: [],
        totalFiles: 1,
        tooManyFiles: false
      },
      aheadBehind: { ahead: 2, behind: 0, aheadCommits: [], behindCommits: [] },
      remotes: [{ name: 'origin', refs: { fetch: 'https://github.com/user/repo.git' } }]
    });
  });
});

describe('handleGetWorkingFileDiff & handleGetCommitFileDiff', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getCollectionGitRootPath.mockImplementation((p) => p);
  });

  it('normalizes relative and absolute paths for working tree diffs and visual diffs', async () => {
    getStagedFileDiff.mockResolvedValue('@@ -1,2 +1,2 @@\n-old\n+new');
    getWorkingFileContentForVisualDiff.mockResolvedValue({
      oldData: { request: { method: 'GET' } },
      newData: { request: { method: 'POST' } }
    });

    const res = await handleGetWorkingFileDiff({}, {
      gitRootPath: '/tmp/repo',
      filePath: 'requests/login.bru',
      type: 'staged'
    });

    expect(getStagedFileDiff).toHaveBeenCalledWith('/tmp/repo', '/tmp/repo/requests/login.bru');
    expect(getWorkingFileContentForVisualDiff).toHaveBeenCalledWith('/tmp/repo', 'requests/login.bru', 'staged');
    expect(res).toEqual({
      filePath: 'requests/login.bru',
      type: 'staged',
      rawDiff: '@@ -1,2 +1,2 @@\n-old\n+new',
      visualDiff: {
        oldData: { request: { method: 'GET' } },
        newData: { request: { method: 'POST' } }
      }
    });
  });

  it('fetches commit file raw and visual diffs', async () => {
    getCommitFileDiff.mockResolvedValue('@@ -1 +1 @@\n-a\n+b');
    getFileContentForVisualDiff.mockResolvedValue(null);

    const res = await handleGetCommitFileDiff({}, {
      gitRootPath: '/tmp/repo',
      commitHash: 'abc1234',
      filePath: '/tmp/repo/bruno.json'
    });

    expect(getCommitFileDiff).toHaveBeenCalledWith('/tmp/repo', 'abc1234', 'bruno.json');
    expect(getFileContentForVisualDiff).toHaveBeenCalledWith('/tmp/repo', 'abc1234', 'bruno.json');
    expect(res).toEqual({
      filePath: 'bruno.json',
      commitHash: 'abc1234',
      rawDiff: '@@ -1 +1 @@\n-a\n+b',
      visualDiff: null
    });
  });
});
