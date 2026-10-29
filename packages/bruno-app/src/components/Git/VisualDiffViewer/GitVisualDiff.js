import React, { useMemo } from 'react';
import isEqual from 'lodash/isEqual';
import get from 'lodash/get';
import VisualDiffUrlBar from './VisualDiffUrlBar';
import VisualDiffParams from './VisualDiffParams';
import VisualDiffHeaders from './VisualDiffHeaders';
import VisualDiffAuth from './VisualDiffAuth';
import VisualDiffBody from './VisualDiffBody';
import VisualDiffContent from './VisualDiffContent/index';
import { computeLineDiffForOld, computeLineDiffForNew } from './utils/diffUtils';

const VisualDiffScriptsAndDocs = ({ oldData, newData, showSide }) => {
  const fields = [
    { label: 'Pre-Request Script', path: 'request.script.req' },
    { label: 'Post-Response Script', path: 'request.script.res' },
    { label: 'Tests', path: 'request.tests' },
    { label: 'Documentation', path: 'request.docs' }
  ];

  const activeFields = useMemo(() => {
    return fields.filter(({ path }) => {
      const oldVal = get(oldData, path, '');
      const newVal = get(newData, path, '');
      return Boolean(oldVal || newVal);
    });
  }, [oldData, newData]);

  if (activeFields.length === 0) return null;

  return (
    <>
      {activeFields.map(({ label, path }) => {
        const oldVal = String(get(oldData, path, '') || '');
        const newVal = String(get(newData, path, '') || '');
        const currentVal = showSide === 'old' ? oldVal : newVal;
        if (!currentVal && !oldVal && !newVal) return null;

        const segments = showSide === 'old'
          ? computeLineDiffForOld(oldVal, newVal)
          : computeLineDiffForNew(oldVal, newVal);

        const hasChange = oldVal !== newVal;
        const badgeStatus = !oldVal ? 'added' : !newVal ? 'deleted' : 'modified';

        return (
          <div key={path} className="diff-section">
            <div className="diff-section-header">
              <span>{label}</span>
              {hasChange && (
                <span className={`status-badge ${badgeStatus}`}>
                  {badgeStatus === 'added' ? 'A' : badgeStatus === 'deleted' ? 'D' : 'M'}
                </span>
              )}
            </div>
            <div className="code-diff-content">
              {segments.length === 0 ? (
                <div className="diff-line unchanged">&nbsp;</div>
              ) : (
                segments.map((seg, idx) => (
                  <div key={idx} className={`diff-line ${seg.status}`}>
                    {seg.text || '\u00A0'}
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </>
  );
};

const normalizeEnvVariables = (vars = []) =>
  (Array.isArray(vars) ? vars : []).map((v) => ({
    name: v?.name || '',
    value: v?.secret ? '•••••••• (secret)' : String(v?.value ?? ''),
    enabled: v?.enabled !== false,
    secret: Boolean(v?.secret)
  }));

const VisualDiffEnvironmentVars = ({ oldData, newData, showSide }) => {
  const oldVars = normalizeEnvVariables(get(oldData, 'variables', []));
  const newVars = normalizeEnvVariables(get(newData, 'variables', []));

  const currentVars = showSide === 'old' ? oldVars : newVars;
  const otherVars = showSide === 'old' ? newVars : oldVars;

  const varsWithStatus = useMemo(() => {
    const otherMap = new Map();
    otherVars.forEach((v) => otherMap.set(v.name, v));

    return currentVars.map((item) => {
      const other = otherMap.get(item.name);
      let status = 'unchanged';
      if (!other) {
        status = showSide === 'old' ? 'deleted' : 'added';
      } else if (
        item.value !== other.value
        || item.enabled !== other.enabled
        || item.secret !== other.secret
      ) {
        status = 'modified';
      }
      return { ...item, status };
    });
  }, [currentVars, otherVars, showSide]);

  if (varsWithStatus.length === 0) return null;

  return (
    <div className="diff-section">
      <div className="diff-section-header">
        Environment: {(showSide === 'old' ? oldData?.name : newData?.name) || 'Variables'}
      </div>
      <table className="diff-table">
        <thead>
          <tr>
            <th style={{ width: '30px' }}></th>
            <th className="checkbox-cell"></th>
            <th style={{ width: '40%' }}>Variable</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {varsWithStatus.map((v, index) => (
            <tr key={`${v.name}-${index}`} className={v.status}>
              <td>
                {v.status !== 'unchanged' && (
                  <span className={`status-badge ${v.status}`}>
                    {v.status === 'added' ? 'A' : v.status === 'deleted' ? 'D' : 'M'}
                  </span>
                )}
              </td>
              <td className="checkbox-cell">
                <input
                  type="checkbox"
                  checked={v.enabled !== false}
                  readOnly
                  disabled
                />
              </td>
              <td className="key-cell">{v.name}</td>
              <td className="value-cell">{v.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const gitDiffHasContent = {
  url: (data) => Boolean(data?.request?.url || data?.request?.method),
  params: (data) => Array.isArray(data?.request?.params) && data.request.params.length > 0,
  headers: (data) => Array.isArray(data?.request?.headers) && data.request.headers.length > 0,
  auth: (data) => Boolean(data?.request?.auth && data.request.auth.mode && data.request.auth.mode !== 'none'),
  body: (data) => {
    if (!data?.request?.body) return false;
    const mode = data.request.body.mode;
    if (!mode || mode === 'none') return false;
    return Boolean(
      data.request.body.json
      || data.request.body.text
      || data.request.body.xml
      || data.request.body.sparql
      || data.request.body.graphql
      || data.request.body.formUrlEncoded?.length > 0
      || data.request.body.multipartForm?.length > 0
      || data.request.body.file?.length > 0
      || data.request.body.grpc?.length > 0
      || data.request.body.ws?.length > 0
    );
  },
  scripts: (data) => Boolean(
    data?.request?.script?.req
    || data?.request?.script?.res
    || data?.request?.tests
    || data?.request?.docs
  ),
  envVars: (data) => Boolean(data?.__kind === 'environment' || (Array.isArray(data?.variables) && data.variables.length > 0))
};

const gitSectionHasChanges = (sectionKey, oldData, newData) => {
  if (sectionKey === 'url') {
    return (
      get(oldData, 'request.url') !== get(newData, 'request.url')
      || get(oldData, 'request.method') !== get(newData, 'request.method')
    );
  }
  if (sectionKey === 'params') {
    return !isEqual(get(oldData, 'request.params', []), get(newData, 'request.params', []));
  }
  if (sectionKey === 'headers') {
    return !isEqual(get(oldData, 'request.headers', []), get(newData, 'request.headers', []));
  }
  if (sectionKey === 'auth') {
    return !isEqual(get(oldData, 'request.auth', {}), get(newData, 'request.auth', {}));
  }
  if (sectionKey === 'body') {
    const oldBody = get(oldData, 'request.body', {});
    const newBody = get(newData, 'request.body', {});
    if (oldBody.mode !== newBody.mode) return true;
    const mode = oldBody.mode || newBody.mode;
    if (!mode || mode === 'none') return false;
    return !isEqual(oldBody[mode], newBody[mode]);
  }
  if (sectionKey === 'scripts') {
    return (
      get(oldData, 'request.script.req', '') !== get(newData, 'request.script.req', '')
      || get(oldData, 'request.script.res', '') !== get(newData, 'request.script.res', '')
      || get(oldData, 'request.tests', '') !== get(newData, 'request.tests', '')
      || get(oldData, 'request.docs', '') !== get(newData, 'request.docs', '')
    );
  }
  if (sectionKey === 'envVars') {
    return !isEqual(
      normalizeEnvVariables(get(oldData, 'variables', [])),
      normalizeEnvVariables(get(newData, 'variables', []))
    );
  }
  return false;
};

const gitDiffSections = [
  { key: 'url', title: 'URL & Method', Component: VisualDiffUrlBar, hasContent: gitDiffHasContent.url },
  { key: 'params', title: 'Parameters', Component: VisualDiffParams, hasContent: gitDiffHasContent.params },
  { key: 'headers', title: 'Headers', Component: VisualDiffHeaders, hasContent: gitDiffHasContent.headers },
  { key: 'auth', title: 'Authentication', Component: VisualDiffAuth, hasContent: gitDiffHasContent.auth },
  { key: 'body', title: 'Body', Component: VisualDiffBody, hasContent: gitDiffHasContent.body },
  { key: 'scripts', title: 'Scripts, Tests & Docs', Component: VisualDiffScriptsAndDocs, hasContent: gitDiffHasContent.scripts },
  { key: 'envVars', title: 'Environment Variables', Component: VisualDiffEnvironmentVars, hasContent: gitDiffHasContent.envVars }
];

const GitVisualDiff = ({
  oldData,
  newData,
  oldLabel = 'Before (HEAD / Index)',
  newLabel = 'After (Working / Staged)',
  hideUnchanged = false
}) => {
  return (
    <VisualDiffContent
      oldData={oldData}
      newData={newData}
      sections={gitDiffSections}
      sectionHasChanges={gitSectionHasChanges}
      oldLabel={oldLabel}
      newLabel={newLabel}
      hideUnchanged={hideUnchanged}
    />
  );
};

export default GitVisualDiff;
