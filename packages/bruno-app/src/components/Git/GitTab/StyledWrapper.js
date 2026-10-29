import styled from 'styled-components';

const StyledWrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: ${(props) => props.theme.background.base};
  color: ${(props) => props.theme.text};
  overflow: hidden;

  .git-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.625rem 1rem;
    border-bottom: 1px solid ${(props) => props.theme.border.border1};
    background: ${(props) => props.theme.sidebar.bg};
    flex-shrink: 0;
  }

  .git-toolbar-left,
  .git-toolbar-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .branch-selector-wrapper {
    position: relative;
  }

  .branch-pill-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.3rem 0.625rem;
    border-radius: ${(props) => props.theme.border.radius.base};
    border: 1px solid ${(props) => props.theme.border.border1};
    background: ${(props) => props.theme.background.base};
    color: ${(props) => props.theme.text};
    font-size: ${(props) => props.theme.font.size.xs};
    font-weight: 500;
    cursor: pointer;
    transition: border-color 0.15s ease;

    &:hover {
      border-color: ${(props) => props.theme.brand};
    }
  }

  .branch-dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 60;
    width: 260px;
    background: ${(props) => props.theme.background.base};
    border: 1px solid ${(props) => props.theme.border.border1};
    border-radius: ${(props) => props.theme.border.radius.base};
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .new-branch-row {
    display: flex;
    gap: 0.25rem;
    padding-bottom: 0.375rem;
    border-bottom: 1px solid ${(props) => props.theme.border.border1};

    input {
      flex: 1;
      min-width: 0;
      padding: 0.25rem 0.5rem;
      font-size: ${(props) => props.theme.font.size.xs};
      border: 1px solid ${(props) => props.theme.border.border1};
      border-radius: ${(props) => props.theme.border.radius.sm};
      background: ${(props) => props.theme.sidebar.bg};
      color: ${(props) => props.theme.text};
    }
  }

  .branch-list {
    max-height: 200px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .branch-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.35rem 0.5rem;
    font-size: ${(props) => props.theme.font.size.xs};
    border-radius: ${(props) => props.theme.border.radius.sm};
    cursor: pointer;
    color: ${(props) => props.theme.text};
    background: transparent;
    border: none;
    text-align: left;

    &:hover {
      background: ${(props) => props.theme.sidebar.collection.item.hoverBg};
    }

    &.active {
      font-weight: 600;
      color: ${(props) => props.theme.brand};
      background: ${(props) => props.theme.brand}12;
    }
  }

  .view-tabs {
    display: inline-flex;
    align-items: center;
    background: ${(props) => props.theme.background.base};
    border: 1px solid ${(props) => props.theme.border.border1};
    border-radius: ${(props) => props.theme.border.radius.base};
    padding: 2px;
    gap: 2px;
  }

  .view-tab-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.25rem 0.625rem;
    font-size: ${(props) => props.theme.font.size.xs};
    border-radius: ${(props) => props.theme.border.radius.sm};
    border: none;
    background: transparent;
    color: ${(props) => props.theme.colors.text.muted};
    cursor: pointer;
    font-weight: 500;

    &:hover {
      color: ${(props) => props.theme.text};
    }

    &.active {
      background: ${(props) => props.theme.sidebar.bg};
      color: ${(props) => props.theme.text};
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
    }
  }

  .git-action-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.625rem;
    font-size: ${(props) => props.theme.font.size.xs};
    font-weight: 500;
    border-radius: ${(props) => props.theme.border.radius.base};
    border: 1px solid ${(props) => props.theme.border.border1};
    background: ${(props) => props.theme.background.base};
    color: ${(props) => props.theme.text};
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover:not(:disabled) {
      border-color: ${(props) => props.theme.brand};
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    &.primary {
      background: ${(props) => props.theme.brand};
      border-color: ${(props) => props.theme.brand};
      color: #fff;

      &:hover:not(:disabled) {
        opacity: 0.92;
      }
    }
  }

  .count-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 600;
    background: ${(props) => props.theme.brand}22;
    color: ${(props) => props.theme.brand};
  }

  .git-main-split {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .git-left-pane {
    width: 340px;
    min-width: 280px;
    max-width: 420px;
    border-right: 1px solid ${(props) => props.theme.border.border1};
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: ${(props) => props.theme.sidebar.bg};
  }

  .commit-box {
    padding: 0.75rem;
    border-bottom: 1px solid ${(props) => props.theme.border.border1};
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    background: ${(props) => props.theme.background.base};

    textarea {
      width: 100%;
      min-height: 68px;
      resize: vertical;
      padding: 0.5rem;
      font-size: ${(props) => props.theme.font.size.xs};
      border: 1px solid ${(props) => props.theme.border.border1};
      border-radius: ${(props) => props.theme.border.radius.base};
      background: ${(props) => props.theme.sidebar.bg};
      color: ${(props) => props.theme.text};
      outline: none;

      &:focus {
        border-color: ${(props) => props.theme.brand};
      }
    }

    .commit-actions {
      display: flex;
      gap: 0.375rem;
    }
  }

  .changes-lists-container {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .changes-section {
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid ${(props) => props.theme.border.border1};
  }

  .changes-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.45rem 0.75rem;
    font-size: ${(props) => props.theme.font.size.xs};
    font-weight: 600;
    color: ${(props) => props.theme.colors.text.muted};
    text-transform: uppercase;
    letter-spacing: 0.03em;
    background: ${(props) => props.theme.sidebar.bg};
    border-bottom: 1px solid ${(props) => props.theme.border.border1};
  }

  .section-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .icon-action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.2rem 0.35rem;
    font-size: 11px;
    border-radius: ${(props) => props.theme.border.radius.sm};
    border: 1px solid transparent;
    background: transparent;
    color: ${(props) => props.theme.colors.text.muted};
    cursor: pointer;

    &:hover {
      color: ${(props) => props.theme.text};
      background: ${(props) => props.theme.sidebar.collection.item.hoverBg};
      border-color: ${(props) => props.theme.border.border1};
    }
  }

  .file-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.4rem 0.75rem;
    font-size: ${(props) => props.theme.font.size.xs};
    cursor: pointer;
    border-bottom: 1px solid ${(props) => props.theme.border.border1}40;

    &:hover {
      background: ${(props) => props.theme.sidebar.collection.item.hoverBg};
    }

    &.selected {
      background: ${(props) => props.theme.brand}16;
      border-left: 2px solid ${(props) => props.theme.brand};
    }

    .file-info {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      min-width: 0;
      flex: 1;
    }

    .file-path-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: 'Fira Code', monospace;
      font-size: 11.5px;
    }

    .file-row-actions {
      display: flex;
      align-items: center;
      gap: 2px;
      flex-shrink: 0;
    }
  }

  .git-status-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 700;
    flex-shrink: 0;

    &.added,
    &.untracked {
      background: color-mix(in srgb, ${(props) => props.theme.colors.text.green} 18%, transparent);
      color: ${(props) => props.theme.colors.text.green};
    }

    &.modified,
    &.renamed {
      background: color-mix(in srgb, ${(props) => props.theme.colors.text.warning} 18%, transparent);
      color: ${(props) => props.theme.colors.text.warning};
    }

    &.deleted,
    &.conflicted {
      background: color-mix(in srgb, ${(props) => props.theme.colors.text.danger} 18%, transparent);
      color: ${(props) => props.theme.colors.text.danger};
    }
  }

  .git-right-pane {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: ${(props) => props.theme.background.base};
  }

  .diff-inspector-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid ${(props) => props.theme.border.border1};
    background: ${(props) => props.theme.sidebar.bg};
    flex-shrink: 0;

    .diff-file-title {
      font-family: 'Fira Code', monospace;
      font-size: ${(props) => props.theme.font.size.xs};
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .diff-inspector-controls {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-shrink: 0;
    }
  }

  .diff-inspector-body {
    flex: 1;
    min-height: 0;
    padding: 0.75rem 1rem;
    overflow: auto;
  }

  .empty-pane-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 0.75rem;
    color: ${(props) => props.theme.colors.text.muted};
    text-align: center;
    padding: 2rem;
  }

  .commit-item-row {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.55rem 0.75rem;
    border-bottom: 1px solid ${(props) => props.theme.border.border1};
    cursor: pointer;

    &:hover {
      background: ${(props) => props.theme.sidebar.collection.item.hoverBg};
    }

    &.selected {
      background: ${(props) => props.theme.brand}16;
      border-left: 2px solid ${(props) => props.theme.brand};
    }

    .commit-msg {
      font-size: ${(props) => props.theme.font.size.xs};
      font-weight: 500;
      color: ${(props) => props.theme.text};
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .commit-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      color: ${(props) => props.theme.colors.text.muted};
    }

    .commit-hash {
      font-family: 'Fira Code', monospace;
    }
  }

  .remotes-container {
    padding: 1.25rem;
    max-width: 680px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .remote-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border: 1px solid ${(props) => props.theme.border.border1};
    border-radius: ${(props) => props.theme.border.radius.base};
    background: ${(props) => props.theme.sidebar.bg};
  }
`;

export default StyledWrapper;
