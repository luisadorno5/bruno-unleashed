import React, { useMemo } from 'react';
import styled from 'styled-components';

const StyledRawDiff = styled.div`
  height: 100%;
  overflow: auto;
  border: 1px solid ${(props) => props.theme.border.border1};
  border-radius: ${(props) => props.theme.border.radius.base};
  background: ${(props) => props.theme.background.base};
  font-family: 'Fira Code', monospace;
  font-size: ${(props) => props.theme.font.size.xs};
  line-height: 1.5;

  .raw-diff-table {
    width: 100%;
    border-collapse: collapse;
  }

  .diff-row-line {
    &.added {
      background: color-mix(in srgb, ${(props) => props.theme.colors.text.green} 14%, transparent);
      color: ${(props) => props.theme.colors.text.green};
    }

    &.deleted {
      background: color-mix(in srgb, ${(props) => props.theme.colors.text.danger} 14%, transparent);
      color: ${(props) => props.theme.colors.text.danger};
    }

    &.hunk {
      background: ${(props) => props.theme.sidebar.bg};
      color: ${(props) => props.theme.colors.text.muted};
      font-weight: 500;
    }

    &.meta {
      background: ${(props) => props.theme.sidebar.bg};
      color: ${(props) => props.theme.colors.text.muted};
      opacity: 0.75;
    }

    &.context {
      color: ${(props) => props.theme.text};
    }
  }

  .line-num {
    width: 44px;
    min-width: 44px;
    padding: 0 8px;
    text-align: right;
    user-select: none;
    color: ${(props) => props.theme.colors.text.muted};
    opacity: 0.65;
    border-right: 1px solid ${(props) => props.theme.border.border1};
    vertical-align: top;
  }

  .line-prefix {
    width: 20px;
    min-width: 20px;
    text-align: center;
    user-select: none;
    vertical-align: top;
  }

  .line-code {
    padding: 0 10px 0 4px;
    white-space: pre-wrap;
    word-break: break-all;
    vertical-align: top;
  }

  .empty-diff {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 160px;
    color: ${(props) => props.theme.colors.text.muted};
    font-family: inherit;
    font-size: ${(props) => props.theme.font.size.sm};
  }
`;

export const parseUnifiedDiff = (rawDiff) => {
  if (!rawDiff || typeof rawDiff !== 'string' || !rawDiff.trim()) {
    return [];
  }

  const lines = rawDiff.replace(/\r\n/g, '\n').split('\n');
  const parsed = [];
  let oldLine = null;
  let newLine = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (
      line.startsWith('diff --git ')
      || line.startsWith('index ')
      || line.startsWith('new file mode ')
      || line.startsWith('deleted file mode ')
      || line.startsWith('--- ')
      || line.startsWith('+++ ')
    ) {
      parsed.push({
        type: 'meta',
        oldNum: '',
        newNum: '',
        prefix: '',
        content: line
      });
      continue;
    }

    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
    if (hunkMatch) {
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[2], 10);
      parsed.push({
        type: 'hunk',
        oldNum: '...',
        newNum: '...',
        prefix: '@@',
        content: line
      });
      continue;
    }

    if (line.startsWith('+')) {
      parsed.push({
        type: 'added',
        oldNum: '',
        newNum: newLine !== null ? newLine++ : '',
        prefix: '+',
        content: line.slice(1)
      });
    } else if (line.startsWith('-')) {
      parsed.push({
        type: 'deleted',
        oldNum: oldLine !== null ? oldLine++ : '',
        newNum: '',
        prefix: '-',
        content: line.slice(1)
      });
    } else if (line.startsWith('\\ No newline at end of file')) {
      parsed.push({
        type: 'meta',
        oldNum: '',
        newNum: '',
        prefix: '',
        content: line
      });
    } else {
      parsed.push({
        type: 'context',
        oldNum: oldLine !== null ? oldLine++ : '',
        newNum: newLine !== null ? newLine++ : '',
        prefix: ' ',
        content: line.startsWith(' ') ? line.slice(1) : line
      });
    }
  }

  return parsed;
};

const RawDiffViewer = ({ rawDiff }) => {
  const rows = useMemo(() => parseUnifiedDiff(rawDiff), [rawDiff]);

  if (!rows.length) {
    return (
      <StyledRawDiff>
        <div className="empty-diff">No textual diff available for this file</div>
      </StyledRawDiff>
    );
  }

  return (
    <StyledRawDiff data-testid="raw-diff-viewer">
      <table className="raw-diff-table">
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className={`diff-row-line ${row.type}`}>
              <td className="line-num">{row.oldNum}</td>
              <td className="line-num">{row.newNum}</td>
              <td className="line-prefix">{row.prefix}</td>
              <td className="line-code">{row.content || '\u00A0'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </StyledRawDiff>
  );
};

export default RawDiffViewer;
