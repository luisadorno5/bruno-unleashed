import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  IconBrandGit,
  IconGitBranch,
  IconRefresh,
  IconChevronDown,
  IconPlus,
  IconMinus,
  IconCheck,
  IconArrowBackUp,
  IconLoader2,
  IconTrash,
  IconCode,
  IconEye,
  IconArrowUp,
  IconArrowDown,
  IconLink
} from '@tabler/icons';
import toast from 'react-hot-toast';
import useCollectionGit from 'hooks/useCollectionGit';
import GitVisualDiff from 'components/Git/VisualDiffViewer/GitVisualDiff';
import RawDiffViewer from 'components/Git/RawDiffViewer';
import StyledWrapper from './StyledWrapper';

const getFileStatusInfo = (file) => {
  if (file.type === 'conflicted' || file.fileIndex === 'U' || file.working_dir === 'U') {
    return { code: 'C', statusClass: 'conflicted', label: 'Conflicted' };
  }
  if (file.type === 'renamed' || file.fileIndex === 'R') {
    return { code: 'R', statusClass: 'renamed', label: 'Renamed' };
  }
  if (file.type === 'staged') {
    if (file.fileIndex === 'A') return { code: 'A', statusClass: 'added', label: 'Added' };
    if (file.fileIndex === 'D') return { code: 'D', statusClass: 'deleted', label: 'Deleted' };
    return { code: 'M', statusClass: 'modified', label: 'Modified' };
  }
  if (file.working_dir === '?' || file.fileIndex === '?') {
    return { code: 'U', statusClass: 'untracked', label: 'Untracked' };
  }
  if (file.working_dir === 'D') {
    return { code: 'D', statusClass: 'deleted', label: 'Deleted' };
  }
  return { code: 'M', statusClass: 'modified', label: 'Modified' };
};

const getCommitFileStatusInfo = (status) => {
  switch (status) {
    case 'added':
      return { code: 'A', statusClass: 'added', label: 'Added' };
    case 'deleted':
      return { code: 'D', statusClass: 'deleted', label: 'Deleted' };
    case 'renamed':
      return { code: 'R', statusClass: 'renamed', label: 'Renamed' };
    default:
      return { code: 'M', statusClass: 'modified', label: 'Modified' };
  }
};

const isVisualDiffSupportedFile = (filePath) => {
  if (!filePath || typeof filePath !== 'string') return false;
  const baseName = filePath.split('/').pop();
  const excluded = ['folder.yml', 'folder.bru', 'opencollection.yml', 'collection.bru', 'bruno.json'];
  if (excluded.includes(baseName)) return false;
  return filePath.endsWith('.bru') || filePath.endsWith('.yml');
};

const GitTab = ({ collection }) => {
  const {
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
  } = useCollectionGit(collection);

  const [activeView, setActiveView] = useState('changes'); // 'changes' | 'history' | 'remotes'
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);

  // Selected working file state
  const [selectedFile, setSelectedFile] = useState(null); // { path, type, from }
  const [diffData, setDiffData] = useState(null); // { rawDiff, visualDiff }
  const [isDiffLoading, setIsDiffLoading] = useState(false);
  const [diffMode, setDiffMode] = useState('visual'); // 'visual' | 'raw'
  const [hideUnchangedSections, setHideUnchangedSections] = useState(false);

  // History view state
  const [selectedCommit, setSelectedCommit] = useState(null);
  const [commitFiles, setCommitFiles] = useState([]);
  const [selectedCommitFile, setSelectedCommitFile] = useState(null);
  const [commitFileDiff, setCommitFileDiff] = useState(null);
  const [isLoadingCommitDiff, setIsLoadingCommitDiff] = useState(false);

  // Remotes view state
  const [remoteNameInput, setRemoteNameInput] = useState('origin');
  const [remoteUrlInput, setRemoteUrlInput] = useState('');

  const branchDropdownRef = useRef(null);

  const stagedFiles = gitState?.changedFiles?.staged || [];
  const unstagedFiles = gitState?.changedFiles?.unstaged || [];
  const conflictedFiles = gitState?.changedFiles?.conflicted || [];
  const totalChangedCount = stagedFiles.length + unstagedFiles.length + conflictedFiles.length;
  const aheadCount = gitState?.aheadBehind?.ahead || 0;
  const behindCount = gitState?.aheadBehind?.behind || 0;
  const currentBranch = gitState?.currentGitBranch || gitState?.defaultGitBranch || 'main';
  const branches = gitState?.branches || [];
  const logs = gitState?.logs || [];
  const remotes = gitState?.remotes || [];

  // Close branch dropdown on outside click
  useEffect(() => {
    if (!branchMenuOpen) return;
    const handleOutsideClick = (event) => {
      if (branchDropdownRef.current && !branchDropdownRef.current.contains(event.target)) {
        setBranchMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [branchMenuOpen]);

  // Auto-select first changed file when none is selected or previously selected file is no longer in list
  useEffect(() => {
    if (activeView !== 'changes') return;
    const allFiles = [...stagedFiles, ...unstagedFiles, ...conflictedFiles];
    if (allFiles.length === 0) {
      setSelectedFile(null);
      setDiffData(null);
      return;
    }

    const stillExists = selectedFile && allFiles.some(
      (f) => f.path === selectedFile.path && f.type === selectedFile.type
    );
    if (!stillExists) {
      const samePathOtherStage = selectedFile && allFiles.find((f) => f.path === selectedFile.path);
      setSelectedFile(samePathOtherStage || allFiles[0]);
    }
  }, [stagedFiles, unstagedFiles, conflictedFiles, activeView]);

  // Load working file diff when selectedFile changes
  const loadWorkingFileDiff = useCallback(async (file) => {
    const { ipcRenderer } = window;
    const gitRootPath = gitState?.gitRootPath || collection?.pathname;
    if (!ipcRenderer || !gitRootPath || !file?.path) {
      setDiffData(null);
      return;
    }

    setIsDiffLoading(true);
    try {
      const result = await ipcRenderer.invoke('renderer:git-get-working-file-diff', {
        gitRootPath,
        filePath: file.path,
        type: file.type,
        fromPath: file.from
      });
      setDiffData(result);
      const hasVisual = Boolean(
        isVisualDiffSupportedFile(file.path)
        && (result?.visualDiff?.oldParsed || result?.visualDiff?.newParsed)
      );
      setDiffMode(hasVisual ? 'visual' : 'raw');
    } catch (error) {
      console.error('Error loading working file diff:', error);
      setDiffData({ rawDiff: '', visualDiff: null });
      setDiffMode('raw');
    } finally {
      setIsDiffLoading(false);
    }
  }, [gitState?.gitRootPath, collection?.pathname]);

  useEffect(() => {
    if (selectedFile && activeView === 'changes') {
      loadWorkingFileDiff(selectedFile);
    }
  }, [selectedFile, activeView, loadWorkingFileDiff]);

  // Load files for selected commit in History view
  useEffect(() => {
    const { ipcRenderer } = window;
    const gitRootPath = gitState?.gitRootPath || collection?.pathname;
    if (activeView !== 'history' || !selectedCommit?.hash || !ipcRenderer || !gitRootPath) {
      return;
    }

    ipcRenderer
      .invoke('renderer:git-get-commit-files', {
        gitRootPath,
        commitHash: selectedCommit.hash
      })
      .then((files) => {
        const list = Array.isArray(files) ? files : [];
        setCommitFiles(list);
        setSelectedCommitFile(list[0] || null);
      })
      .catch(() => {
        setCommitFiles([]);
        setSelectedCommitFile(null);
      });
  }, [activeView, selectedCommit, gitState?.gitRootPath, collection?.pathname]);

  // Load diff for selected file in a commit
  useEffect(() => {
    const { ipcRenderer } = window;
    const gitRootPath = gitState?.gitRootPath || collection?.pathname;
    if (activeView !== 'history' || !selectedCommit?.hash || !selectedCommitFile?.path || !ipcRenderer || !gitRootPath) {
      setCommitFileDiff(null);
      return;
    }

    setIsLoadingCommitDiff(true);
    ipcRenderer
      .invoke('renderer:git-get-commit-file-diff', {
        gitRootPath,
        commitHash: selectedCommit.hash,
        filePath: selectedCommitFile.path
      })
      .then((res) => {
        setCommitFileDiff(res);
        const hasVisual = Boolean(
          isVisualDiffSupportedFile(selectedCommitFile.path)
          && (res?.visualDiff?.oldParsed || res?.visualDiff?.newParsed)
        );
        setDiffMode(hasVisual ? 'visual' : 'raw');
      })
      .catch(() => {
        setCommitFileDiff({ rawDiff: '', visualDiff: null });
        setDiffMode('raw');
      })
      .finally(() => {
        setIsLoadingCommitDiff(false);
      });
  }, [activeView, selectedCommit, selectedCommitFile, gitState?.gitRootPath, collection?.pathname]);

  const handleInitRepo = async () => {
    try {
      await initRepository();
      toast.success('Initialized Git repository');
    } catch (error) {
      toast.error(error?.message || 'Failed to initialize Git repository');
    }
  };

  const handleStageFile = async (e, filePath) => {
    e?.stopPropagation();
    try {
      await stageFiles([filePath]);
    } catch (error) {
      toast.error(error?.message || 'Failed to stage file');
    }
  };

  const handleStageAll = async () => {
    if (!unstagedFiles.length) return;
    try {
      await stageFiles(unstagedFiles.map((f) => f.path));
    } catch (error) {
      toast.error(error?.message || 'Failed to stage all files');
    }
  };

  const handleUnstageFile = async (e, filePath) => {
    e?.stopPropagation();
    try {
      await unstageFiles([filePath]);
    } catch (error) {
      toast.error(error?.message || 'Failed to unstage file');
    }
  };

  const handleUnstageAll = async () => {
    if (!stagedFiles.length) return;
    try {
      await unstageFiles(stagedFiles.map((f) => f.path));
    } catch (error) {
      toast.error(error?.message || 'Failed to unstage all files');
    }
  };

  const handleDiscardFile = async (e, filePath) => {
    e?.stopPropagation();
    try {
      await discardFiles([filePath]);
      toast.success(`Discarded changes in ${filePath.split('/').pop()}`);
    } catch (error) {
      toast.error(error?.message || 'Failed to discard changes');
    }
  };

  const handleDiscardAll = async () => {
    if (!unstagedFiles.length) return;
    try {
      await discardFiles(unstagedFiles.map((f) => f.path));
      toast.success('Discarded all unstaged changes');
    } catch (error) {
      toast.error(error?.message || 'Failed to discard changes');
    }
  };

  const handleCommit = async (andPush = false) => {
    const trimmed = commitMessage.trim();
    if (!trimmed) {
      toast.error('Please enter a commit message');
      return;
    }

    setIsCommitting(true);
    try {
      if (stagedFiles.length === 0 && unstagedFiles.length > 0) {
        await stageFiles(unstagedFiles.map((f) => f.path));
      }
      await commit(trimmed);
      setCommitMessage('');
      toast.success('Committed changes');

      if (andPush) {
        await pushRemote();
        toast.success('Pushed to remote');
      }
    } catch (error) {
      toast.error(error?.message || 'Failed to commit changes');
    } finally {
      setIsCommitting(false);
    }
  };

  const handleSwitchBranch = async (branchName) => {
    setBranchMenuOpen(false);
    if (!branchName || branchName === currentBranch) return;
    try {
      await checkoutBranch({ branchName, shouldCreate: false });
      toast.success(`Switched to branch "${branchName}"`);
    } catch (error) {
      toast.error(error?.message || `Failed to switch to "${branchName}"`);
    }
  };

  const handleCreateBranch = async (e) => {
    e?.preventDefault();
    const trimmed = newBranchName.trim();
    if (!trimmed) return;
    try {
      await checkoutBranch({ branchName: trimmed, shouldCreate: true });
      setNewBranchName('');
      setBranchMenuOpen(false);
      toast.success(`Created and switched to branch "${trimmed}"`);
    } catch (error) {
      toast.error(error?.message || 'Failed to create branch');
    }
  };

  const handleFetch = async () => {
    try {
      await fetchRemote();
      toast.success('Fetched from remote');
    } catch (error) {
      toast.error(error?.message || 'Failed to fetch from remote');
    }
  };

  const handlePull = async () => {
    try {
      await pullRemote();
      toast.success('Pulled latest changes');
    } catch (error) {
      toast.error(error?.message || 'Failed to pull changes');
    }
  };

  const handlePush = async () => {
    try {
      await pushRemote();
      toast.success('Pushed commits to remote');
    } catch (error) {
      toast.error(error?.message || 'Failed to push changes');
    }
  };

  const handleAddRemote = async (e) => {
    e?.preventDefault();
    if (!remoteNameInput.trim() || !remoteUrlInput.trim()) {
      toast.error('Remote name and URL are required');
      return;
    }
    try {
      await addGitRemote({
        remoteName: remoteNameInput.trim(),
        remoteUrl: remoteUrlInput.trim()
      });
      setRemoteUrlInput('');
      toast.success(`Added remote "${remoteNameInput.trim()}"`);
    } catch (error) {
      toast.error(error?.message || 'Failed to add remote');
    }
  };

  const handleRemoveRemote = async (name) => {
    try {
      await removeGitRemote({ remoteName: name });
      toast.success(`Removed remote "${name}"`);
    } catch (error) {
      toast.error(error?.message || 'Failed to remove remote');
    }
  };

  const canRenderVisualDiff = useMemo(() => {
    const activeDiff = activeView === 'changes' ? diffData : commitFileDiff;
    const activePath = activeView === 'changes' ? selectedFile?.path : selectedCommitFile?.path;
    return Boolean(
      isVisualDiffSupportedFile(activePath)
      && (activeDiff?.visualDiff?.oldParsed || activeDiff?.visualDiff?.newParsed)
    );
  }, [activeView, diffData, commitFileDiff, selectedFile?.path, selectedCommitFile?.path]);

  if (!gitState?.isGitRepo) {
    return (
      <StyledWrapper data-testid="git-tab">
        <div className="empty-pane-state">
          <IconBrandGit size={42} strokeWidth={1.5} />
          <div className="text-base font-semibold">This collection is not a Git repository</div>
          <div className="text-xs max-w-md">
            Initialize a Git repository in <code>{collection?.pathname}</code> to track API request changes, inspect visual diffs, manage branches, and push/pull commits directly inside Bruno.
          </div>
          <button
            type="button"
            className="git-action-btn primary mt-2"
            onClick={handleInitRepo}
            disabled={isLoading}
            data-testid="git-init-btn"
          >
            {isLoading ? <IconLoader2 size={14} className="animate-spin" /> : <IconBrandGit size={14} />}
            <span>Initialize Git Repository</span>
          </button>
        </div>
      </StyledWrapper>
    );
  }

  return (
    <StyledWrapper data-testid="git-tab">
      {/* Top Toolbar */}
      <div className="git-toolbar">
        <div className="git-toolbar-left">
          {/* Branch Selector */}
          <div className="branch-selector-wrapper" ref={branchDropdownRef}>
            <button
              type="button"
              className="branch-pill-btn"
              onClick={() => setBranchMenuOpen((prev) => !prev)}
              data-testid="git-branch-selector"
            >
              <IconGitBranch size={14} strokeWidth={1.75} />
              <span>{currentBranch}</span>
              <IconChevronDown size={13} strokeWidth={1.5} />
            </button>

            {branchMenuOpen && (
              <div className="branch-dropdown-menu" data-testid="git-branch-dropdown">
                <form className="new-branch-row" onSubmit={handleCreateBranch}>
                  <input
                    type="text"
                    placeholder="New branch name..."
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    data-testid="git-new-branch-input"
                  />
                  <button
                    type="submit"
                    className="git-action-btn primary"
                    disabled={!newBranchName.trim() || isSyncing}
                    title="Create and checkout branch"
                    data-testid="git-create-branch-btn"
                  >
                    <IconPlus size={13} />
                  </button>
                </form>

                <div className="branch-list">
                  {branches.map((branch) => (
                    <button
                      type="button"
                      key={branch}
                      className={`branch-option ${branch === currentBranch ? 'active' : ''}`}
                      onClick={() => handleSwitchBranch(branch)}
                    >
                      <span className="truncate">{branch}</span>
                      {branch === currentBranch && <IconCheck size={13} strokeWidth={2} />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sub-navigation Tabs */}
          <div className="view-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'changes'}
              className={`view-tab-btn ${activeView === 'changes' ? 'active' : ''}`}
              onClick={() => setActiveView('changes')}
              data-testid="git-view-changes"
            >
              <span>Changes</span>
              {totalChangedCount > 0 && <span className="count-pill">{totalChangedCount}</span>}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'history'}
              className={`view-tab-btn ${activeView === 'history' ? 'active' : ''}`}
              onClick={() => {
                setActiveView('history');
                if (!selectedCommit && logs.length > 0) {
                  setSelectedCommit(logs[0]);
                }
              }}
              data-testid="git-view-history"
            >
              <span>History</span>
              {logs.length > 0 && <span className="count-pill">{logs.length}</span>}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'remotes'}
              className={`view-tab-btn ${activeView === 'remotes' ? 'active' : ''}`}
              onClick={() => setActiveView('remotes')}
              data-testid="git-view-remotes"
            >
              <IconLink size={13} strokeWidth={1.5} />
              <span>Remotes</span>
              {remotes.length > 0 && <span className="count-pill">{remotes.length}</span>}
            </button>
          </div>
        </div>

        {/* Sync Controls */}
        <div className="git-toolbar-right">
          <button
            type="button"
            className="git-action-btn"
            onClick={handleFetch}
            disabled={isSyncing}
            title="Fetch from remote"
            data-testid="git-fetch-btn"
          >
            <IconRefresh size={14} className={isSyncing ? 'animate-spin' : ''} />
            <span>Fetch</span>
          </button>

          <button
            type="button"
            className="git-action-btn"
            onClick={handlePull}
            disabled={isSyncing}
            title="Pull changes from remote"
            data-testid="git-pull-btn"
          >
            <IconArrowDown size={14} />
            <span>Pull</span>
            {behindCount > 0 && <span className="count-pill">{behindCount}</span>}
          </button>

          <button
            type="button"
            className="git-action-btn"
            onClick={handlePush}
            disabled={isSyncing}
            title="Push commits to remote"
            data-testid="git-push-btn"
          >
            <IconArrowUp size={14} />
            <span>Push</span>
            {aheadCount > 0 && <span className="count-pill">{aheadCount}</span>}
          </button>

          <button
            type="button"
            className="git-action-btn"
            onClick={refreshGitStatus}
            disabled={isLoading}
            title="Refresh Git status"
            aria-label="Refresh Git status"
            data-testid="git-refresh-btn"
          >
            <IconRefresh size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {activeView === 'changes' && (
        <div className="git-main-split">
          {/* Left Pane: Commit Box + Staged + Unstaged */}
          <div className="git-left-pane">
            <div className="commit-box">
              <textarea
                placeholder={`Commit message (Cmd/Ctrl+Enter to commit to ${currentBranch})...`}
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleCommit(false);
                  }
                }}
                data-testid="git-commit-message-input"
              />
              <div className="commit-actions">
                <button
                  type="button"
                  className="git-action-btn primary flex-1 justify-center"
                  disabled={
                    isCommitting
                    || !commitMessage.trim()
                    || (stagedFiles.length === 0 && unstagedFiles.length === 0)
                  }
                  onClick={() => handleCommit(false)}
                  data-testid="git-commit-btn"
                >
                  {isCommitting ? <IconLoader2 size={14} className="animate-spin" /> : <IconCheck size={14} />}
                  <span>
                    {stagedFiles.length > 0
                      ? `Commit (${stagedFiles.length} staged)`
                      : unstagedFiles.length > 0
                        ? `Stage All & Commit (${unstagedFiles.length})`
                        : 'Commit'}
                  </span>
                </button>
                <button
                  type="button"
                  className="git-action-btn"
                  disabled={
                    isCommitting
                    || isSyncing
                    || !commitMessage.trim()
                    || (stagedFiles.length === 0 && unstagedFiles.length === 0)
                  }
                  onClick={() => handleCommit(true)}
                  title="Commit and immediately push to remote"
                  data-testid="git-commit-and-push-btn"
                >
                  <IconArrowUp size={14} />
                  <span>&amp; Push</span>
                </button>
              </div>
            </div>

            <div className="changes-lists-container">
              {/* Staged Changes Section */}
              <div className="changes-section" data-testid="git-staged-section">
                <div className="changes-section-header">
                  <span>Staged Changes ({stagedFiles.length})</span>
                  {stagedFiles.length > 0 && (
                    <div className="section-actions">
                      <button
                        type="button"
                        className="icon-action-btn"
                        onClick={handleUnstageAll}
                        title="Unstage All"
                        data-testid="git-unstage-all-btn"
                      >
                        <IconMinus size={13} />
                        <span className="ml-1">Unstage All</span>
                      </button>
                    </div>
                  )}
                </div>

                {stagedFiles.map((file) => {
                  const statusInfo = getFileStatusInfo(file);
                  const isSelected = selectedFile?.path === file.path && selectedFile?.type === file.type;
                  return (
                    <div
                      key={`staged-${file.path}`}
                      className={`file-row ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedFile(file)}
                      data-testid={`git-staged-file-${file.path}`}
                    >
                      <div className="file-info">
                        <span className={`git-status-badge ${statusInfo.statusClass}`} title={statusInfo.label}>
                          {statusInfo.code}
                        </span>
                        <span className="file-path-text" title={file.path}>
                          {file.path}
                        </span>
                      </div>
                      <div className="file-row-actions">
                        <button
                          type="button"
                          className="icon-action-btn"
                          onClick={(e) => handleUnstageFile(e, file.path)}
                          title="Unstage file"
                          aria-label={`Unstage ${file.path}`}
                        >
                          <IconMinus size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Unstaged Changes Section */}
              <div className="changes-section" data-testid="git-unstaged-section">
                <div className="changes-section-header">
                  <span>Changes ({unstagedFiles.length})</span>
                  {unstagedFiles.length > 0 && (
                    <div className="section-actions">
                      <button
                        type="button"
                        className="icon-action-btn"
                        onClick={handleDiscardAll}
                        title="Discard All Unstaged Changes"
                        data-testid="git-discard-all-btn"
                      >
                        <IconArrowBackUp size={13} />
                      </button>
                      <button
                        type="button"
                        className="icon-action-btn"
                        onClick={handleStageAll}
                        title="Stage All"
                        data-testid="git-stage-all-btn"
                      >
                        <IconPlus size={13} />
                        <span className="ml-1">Stage All</span>
                      </button>
                    </div>
                  )}
                </div>

                {unstagedFiles.map((file) => {
                  const statusInfo = getFileStatusInfo(file);
                  const isSelected = selectedFile?.path === file.path && selectedFile?.type === file.type;
                  return (
                    <div
                      key={`unstaged-${file.path}`}
                      className={`file-row ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedFile(file)}
                      data-testid={`git-unstaged-file-${file.path}`}
                    >
                      <div className="file-info">
                        <span className={`git-status-badge ${statusInfo.statusClass}`} title={statusInfo.label}>
                          {statusInfo.code}
                        </span>
                        <span className="file-path-text" title={file.path}>
                          {file.path}
                        </span>
                      </div>
                      <div className="file-row-actions">
                        <button
                          type="button"
                          className="icon-action-btn"
                          onClick={(e) => handleDiscardFile(e, file.path)}
                          title="Discard changes in file"
                          aria-label={`Discard ${file.path}`}
                        >
                          <IconArrowBackUp size={13} />
                        </button>
                        <button
                          type="button"
                          className="icon-action-btn"
                          onClick={(e) => handleStageFile(e, file.path)}
                          title="Stage file"
                          aria-label={`Stage ${file.path}`}
                        >
                          <IconPlus size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {totalChangedCount === 0 && (
                  <div className="empty-pane-state py-10">
                    <IconCheck size={24} strokeWidth={1.5} />
                    <div className="text-xs">Working tree clean — no uncommitted changes</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Pane: Visual & Raw Diff Inspector */}
          <div className="git-right-pane">
            {selectedFile ? (
              <>
                <div className="diff-inspector-header">
                  <div className="diff-file-title">
                    <span className={`git-status-badge ${getFileStatusInfo(selectedFile).statusClass}`}>
                      {getFileStatusInfo(selectedFile).code}
                    </span>
                    <span title={selectedFile.path}>{selectedFile.path}</span>
                    <span className="count-pill">
                      {selectedFile.type === 'staged' ? 'Staged' : 'Working Tree'}
                    </span>
                  </div>

                  <div className="diff-inspector-controls">
                    {diffMode === 'visual' && canRenderVisualDiff && (
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={hideUnchangedSections}
                          onChange={(e) => setHideUnchangedSections(e.target.checked)}
                        />
                        <span>Hide unchanged</span>
                      </label>
                    )}

                    <div className="view-tabs">
                      {canRenderVisualDiff && (
                        <button
                          type="button"
                          className={`view-tab-btn ${diffMode === 'visual' ? 'active' : ''}`}
                          onClick={() => setDiffMode('visual')}
                          data-testid="git-diff-mode-visual"
                        >
                          <IconEye size={13} />
                          <span>Visual Diff</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className={`view-tab-btn ${diffMode === 'raw' || !canRenderVisualDiff ? 'active' : ''}`}
                        onClick={() => setDiffMode('raw')}
                        data-testid="git-diff-mode-raw"
                      >
                        <IconCode size={13} />
                        <span>Code Diff</span>
                      </button>
                    </div>

                    {selectedFile.type === 'staged' ? (
                      <button
                        type="button"
                        className="git-action-btn"
                        onClick={(e) => handleUnstageFile(e, selectedFile.path)}
                      >
                        <IconMinus size={13} />
                        <span>Unstage</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="git-action-btn primary"
                        onClick={(e) => handleStageFile(e, selectedFile.path)}
                      >
                        <IconPlus size={13} />
                        <span>Stage</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="diff-inspector-body">
                  {isDiffLoading ? (
                    <div className="empty-pane-state">
                      <IconLoader2 size={24} className="animate-spin" />
                      <span className="text-xs">Loading diff...</span>
                    </div>
                  ) : diffMode === 'visual' && canRenderVisualDiff ? (
                    <GitVisualDiff
                      oldData={diffData?.visualDiff?.oldParsed}
                      newData={diffData?.visualDiff?.newParsed}
                      oldLabel={selectedFile.type === 'staged' ? 'HEAD' : 'Index / HEAD'}
                      newLabel={selectedFile.type === 'staged' ? 'Staged (Index)' : 'Working Tree'}
                      hideUnchanged={hideUnchangedSections}
                    />
                  ) : (
                    <RawDiffViewer rawDiff={diffData?.rawDiff || ''} />
                  )}
                </div>
              </>
            ) : (
              <div className="empty-pane-state">
                <IconBrandGit size={32} strokeWidth={1.5} />
                <div className="text-xs">
                  {totalChangedCount > 0
                    ? 'Select a file on the left to inspect its Visual or Code diff'
                    : 'No modified files to display'}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeView === 'history' && (
        <div className="git-main-split">
          {/* Left Pane: Commit List & Files in Commit */}
          <div className="git-left-pane">
            <div className="changes-section-header">
              <span>Commits ({logs.length})</span>
            </div>
            <div className="changes-lists-container" style={{ maxHeight: selectedCommit ? '55%' : '100%' }}>
              {logs.length === 0 ? (
                <div className="empty-pane-state py-8">
                  <span className="text-xs">No commits yet</span>
                </div>
              ) : (
                logs.map((commitItem) => {
                  const isSelected = selectedCommit?.hash === commitItem.hash;
                  return (
                    <div
                      key={commitItem.hash}
                      className={`commit-item-row ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedCommit(commitItem)}
                    >
                      <div className="commit-msg" title={commitItem.message}>
                        {commitItem.message}
                      </div>
                      <div className="commit-meta">
                        <span>{commitItem.author_name}</span>
                        <span className="commit-hash">{commitItem.hash?.slice(0, 7)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {selectedCommit && (
              <div className="changes-section flex-1 overflow-y-auto border-t">
                <div className="changes-section-header">
                  <span>Changed in {selectedCommit.hash?.slice(0, 7)} ({commitFiles.length})</span>
                </div>
                {commitFiles.map((file) => {
                  const statusInfo = getCommitFileStatusInfo(file.status);
                  const isSelected = selectedCommitFile?.path === file.path;
                  return (
                    <div
                      key={file.path}
                      className={`file-row ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedCommitFile(file)}
                    >
                      <div className="file-info">
                        <span className={`git-status-badge ${statusInfo.statusClass}`} title={statusInfo.label}>
                          {statusInfo.code}
                        </span>
                        <span className="file-path-text" title={file.path}>
                          {file.path}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Pane: Commit File Diff */}
          <div className="git-right-pane">
            {selectedCommit && selectedCommitFile ? (
              <>
                <div className="diff-inspector-header">
                  <div className="diff-file-title">
                    <span className={`git-status-badge ${getCommitFileStatusInfo(selectedCommitFile.status).statusClass}`}>
                      {getCommitFileStatusInfo(selectedCommitFile.status).code}
                    </span>
                    <span>{selectedCommitFile.path}</span>
                    <span className="count-pill">{selectedCommit.hash?.slice(0, 7)}</span>
                  </div>

                  <div className="diff-inspector-controls">
                    <div className="view-tabs">
                      {canRenderVisualDiff && (
                        <button
                          type="button"
                          className={`view-tab-btn ${diffMode === 'visual' ? 'active' : ''}`}
                          onClick={() => setDiffMode('visual')}
                        >
                          <IconEye size={13} />
                          <span>Visual Diff</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className={`view-tab-btn ${diffMode === 'raw' || !canRenderVisualDiff ? 'active' : ''}`}
                        onClick={() => setDiffMode('raw')}
                      >
                        <IconCode size={13} />
                        <span>Code Diff</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="diff-inspector-body">
                  {isLoadingCommitDiff ? (
                    <div className="empty-pane-state">
                      <IconLoader2 size={24} className="animate-spin" />
                      <span className="text-xs">Loading commit diff...</span>
                    </div>
                  ) : diffMode === 'visual' && canRenderVisualDiff ? (
                    <GitVisualDiff
                      oldData={commitFileDiff?.visualDiff?.oldParsed}
                      newData={commitFileDiff?.visualDiff?.newParsed}
                      oldLabel={`${selectedCommit.hash?.slice(0, 7)}^ (Parent)`}
                      newLabel={`${selectedCommit.hash?.slice(0, 7)}`}
                      hideUnchanged={hideUnchangedSections}
                    />
                  ) : (
                    <RawDiffViewer rawDiff={commitFileDiff?.rawDiff || ''} />
                  )}
                </div>
              </>
            ) : (
              <div className="empty-pane-state">
                <IconBrandGit size={32} strokeWidth={1.5} />
                <div className="text-xs">Select a commit and file to inspect its changes</div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeView === 'remotes' && (
        <div className="remotes-container">
          <div className="text-sm font-semibold">Git Remotes</div>
          <form className="flex gap-2 items-center" onSubmit={handleAddRemote}>
            <input
              type="text"
              placeholder="Remote name (e.g. origin)"
              value={remoteNameInput}
              onChange={(e) => setRemoteNameInput(e.target.value)}
              className="px-2.5 py-1.5 text-xs border rounded bg-transparent"
              style={{ width: '140px' }}
              data-testid="git-remote-name-input"
            />
            <input
              type="text"
              placeholder="https://github.com/owner/repo.git"
              value={remoteUrlInput}
              onChange={(e) => setRemoteUrlInput(e.target.value)}
              className="px-2.5 py-1.5 text-xs border rounded bg-transparent flex-1"
              data-testid="git-remote-url-input"
            />
            <button type="submit" className="git-action-btn primary" data-testid="git-add-remote-btn">
              <IconPlus size={14} />
              <span>Add Remote</span>
            </button>
          </form>

          {remotes.length === 0 ? (
            <div className="text-xs opacity-70 py-4">No remotes configured for this repository.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {remotes.map((remote) => (
                <div key={remote.name} className="remote-card">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-xs font-semibold">{remote.name}</span>
                    <span className="text-xs opacity-75 truncate font-mono">
                      {remote.refs?.fetch || remote.refs?.push || ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="git-action-btn"
                    onClick={() => handleRemoveRemote(remote.name)}
                    title={`Remove remote ${remote.name}`}
                  >
                    <IconTrash size={13} />
                    <span>Remove</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </StyledWrapper>
  );
};

export default GitTab;
