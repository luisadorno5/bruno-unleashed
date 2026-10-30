import styled from 'styled-components';

const StyledWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
  overflow-y: auto;
  padding-right: 4px;

  .kv-card {
    border: 1px solid ${(props) => props.theme.border.border1};
    border-radius: ${(props) => props.theme.border.radius.md};
    background: ${(props) => props.theme.background.surface0};
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .kv-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;

    .kv-title-group {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 600;
      color: ${(props) => props.theme.text};
    }

    .kv-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
  }

  .kv-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
  }

  .kv-field {
    display: flex;
    flex-direction: column;
    gap: 5px;

    label {
      font-size: 11px;
      font-weight: 600;
      color: ${(props) => props.theme.colors.text.subtext1};
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    input,
    select {
      padding: 6px 10px;
      font-size: 12px;
      border: 1px solid ${(props) => props.theme.input.border};
      border-radius: ${(props) => props.theme.border.radius.sm};
      background: ${(props) => props.theme.input.bg};
      color: ${(props) => props.theme.text};
      outline: none;

      &:focus {
        border-color: ${(props) => props.theme.input.focusBorder};
      }
    }
  }

  .kv-status-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    padding-top: 6px;
    border-top: 1px solid ${(props) => props.theme.border.border1};
    font-size: 12px;
  }

  .kv-status-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 500;

    &.ok {
      background: rgba(34, 197, 94, 0.14);
      color: ${(props) => props.theme.colors.text.green};
    }

    &.warn {
      background: rgba(245, 158, 11, 0.15);
      color: ${(props) => props.theme.colors.text.yellow};
    }
  }

  .kv-checkbox-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: ${(props) => props.theme.colors.text.subtext1};
    cursor: pointer;
    user-select: none;
  }

  .kv-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 11px;
    font-size: 12px;
    font-weight: 500;
    border-radius: ${(props) => props.theme.border.radius.sm};
    border: 1px solid ${(props) => props.theme.border.border2};
    background: ${(props) => props.theme.background.surface1};
    color: ${(props) => props.theme.text};
    cursor: pointer;
    transition: all 0.12s ease;

    &:hover:not(:disabled) {
      background: ${(props) => props.theme.background.surface2};
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

  .kv-browser-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    max-height: 140px;
    overflow-y: auto;
    padding: 4px 0;
  }

  .kv-secret-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 9px;
    font-size: 11px;
    font-family: var(--font-mono, monospace);
    border-radius: ${(props) => props.theme.border.radius.sm};
    border: 1px solid ${(props) => props.theme.border.border2};
    background: ${(props) => props.theme.background.surface1};
    color: ${(props) => props.theme.text};
    cursor: pointer;

    &:hover:not(:disabled) {
      border-color: ${(props) => props.theme.brand};
    }

    &.mapped {
      opacity: 0.6;
      cursor: default;
    }
  }

  .kv-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;

    th,
    td {
      text-align: left;
      padding: 7px 8px;
      border-bottom: 1px solid ${(props) => props.theme.border.border1};
    }

    th {
      font-size: 11px;
      font-weight: 600;
      color: ${(props) => props.theme.colors.text.subtext1};
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    input {
      width: 100%;
      padding: 5px 8px;
      font-size: 12px;
      border: 1px solid ${(props) => props.theme.input.border};
      border-radius: ${(props) => props.theme.border.radius.sm};
      background: ${(props) => props.theme.input.bg};
      color: ${(props) => props.theme.text};
      outline: none;

      &:focus {
        border-color: ${(props) => props.theme.input.focusBorder};
      }
    }
  }

  .kv-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 4px;
    border: none;
    background: transparent;
    color: ${(props) => props.theme.colors.text.subtext0};
    cursor: pointer;

    &:hover {
      background: ${(props) => props.theme.background.surface2};
      color: ${(props) => props.theme.colors.text.danger};
    }
  }

  .kv-hint {
    font-size: 11px;
    color: ${(props) => props.theme.colors.text.subtext0};
    line-height: 1.5;

    code {
      font-family: var(--font-mono, monospace);
      padding: 1px 5px;
      border-radius: 3px;
      background: ${(props) => props.theme.background.surface1};
      color: ${(props) => props.theme.text};
    }
  }
`;

export default StyledWrapper;
