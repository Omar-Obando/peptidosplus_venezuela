// This file is managed by PhantomWP infrastructure. It will be overwritten on update. Do not edit it manually.
// Source of truth lives in PhantomWP infrastructure generators.

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
export const MAX_CONFLICT_FILE_BYTES = 2 * 1024 * 1024;

export function parseConflictText(content) {
  if (typeof content !== 'string') throw new Error('Malformed conflict content');
  const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';
  const finalNewline = content.endsWith('\n');
  const lines = content.split(/\r?\n/);
  if (finalNewline) lines.pop();
  const sections = [];
  let context = [];
  const flushContext = () => {
    if (context.length) sections.push({ kind: 'context', content: context.join(lineEnding) });
    context = [];
  };
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.startsWith('<<<<<<< ')) {
      if (/^(\|\|\|\|\|\|\||=======|>>>>>>>)(?: |$)/.test(line)) {
        throw new Error('Malformed conflict markers');
      }
      context.push(line);
      index += 1;
      continue;
    }
    flushContext();
    index += 1;
    const yours = [];
    const base = [];
    const github = [];
    let target = yours;
    let sawBase = false;
    let sawSeparator = false;
    let closed = false;
    for (; index < lines.length; index += 1) {
      const current = lines[index];
      if (current.startsWith('<<<<<<< ')) throw new Error('Malformed nested conflict markers');
      if (current.startsWith('||||||| ')) {
        if (sawBase || sawSeparator || target !== yours) throw new Error('Malformed conflict markers');
        sawBase = true;
        target = base;
        continue;
      }
      if (current === '=======') {
        if (sawSeparator) throw new Error('Malformed conflict markers');
        sawSeparator = true;
        target = github;
        continue;
      }
      if (current.startsWith('>>>>>>> ')) {
        if (!sawSeparator) throw new Error('Malformed conflict markers');
        closed = true;
        index += 1;
        break;
      }
      if (/^(\|\|\|\|\|\|\||>>>>>>>)(?: |$)/.test(current)) {
        throw new Error('Malformed conflict markers');
      }
      target.push(current);
    }
    if (!closed) throw new Error('Malformed conflict markers');
    const section = {
      kind: 'conflict',
      yours: yours.join(lineEnding),
      github: github.join(lineEnding),
    };
    if (sawBase) section.base = base.join(lineEnding);
    sections.push(section);
  }
  flushContext();
  if (!sections.some((section) => section.kind === 'conflict')) {
    throw new Error('Malformed conflict content: no conflict markers found');
  }
  return { lineEnding, finalNewline, sections };
}

export function renderConflictText(parsed, choices) {
  let conflictIndex = 0;
  const pieces = parsed.sections.map((section) => {
    if (section.kind === 'context') return section.content;
    const choice = choices[conflictIndex++];
    if (!['yours', 'github', 'both'].includes(choice)) {
      throw new Error('Every conflict needs a valid choice');
    }
    if (choice === 'yours') return section.yours;
    if (choice === 'github') return section.github;
    if (!section.yours) return section.github;
    if (!section.github) return section.yours;
    return section.yours + parsed.lineEnding + section.github;
  });
  let output = pieces.join(parsed.lineEnding);
  if (parsed.finalNewline) output += parsed.lineEnding;
  return output;
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function opaqueId() {
  return crypto.randomBytes(18).toString('base64url');
}

function classifyGitError(error) {
  const message = String(error?.stderr || error?.stdout || error?.message || error || 'Git failed');
  if (/authentication failed|could not read username|invalid username or password|bad credentials|permission denied \(publickey\)/i.test(message)) {
    return { code: 'authentication-failure', message };
  }
  if (/could not resolve host|failed to connect|connection timed out|network is unreachable|connection reset/i.test(message)) {
    return { code: 'network-failure', message };
  }
  if (/permission to .* denied|write access.*not granted|protected branch|remote:.*permission/i.test(message)) {
    return { code: 'permission-failure', message };
  }
  if (/non-fast-forward|fetch first|rejected.*behind/i.test(message)) {
    return { code: 'non-fast-forward', message };
  }
  return { code: 'git-failure', message };
}

export function createGitConflictRuntime({ workspaceDir, gitExec: injectedGitExec, refreshGitCredentials = async () => {} }) {
  const gitDir = path.join(workspaceDir, '.git');
  const stateDir = path.join(gitDir, 'phantomwp');
  const sessionPath = path.join(stateDir, 'conflict-session.json');
  const recoveryPath = path.join(stateDir, 'recoveries.json');
  const draftsDir = path.join(stateDir, 'conflict-drafts');
  const git = injectedGitExec || (async (args, options = {}) => {
    const result = await execFileAsync('git', args, {
      cwd: workspaceDir,
      timeout: options.timeout || 60_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    return { stdout: result.stdout || '', stderr: result.stderr || '' };
  });

  const readJson = async (file, fallback = null) => {
    try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
  };
  const writeJson = async (file, value) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temp = file + '.tmp-' + process.pid;
    await fs.writeFile(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
    await fs.rename(temp, file);
  };
  const currentSession = () => readJson(sessionPath, null);
  const saveSession = (session) => writeJson(sessionPath, session);
  const clearSession = async () => {
    await fs.rm(sessionPath, { force: true });
    await fs.rm(draftsDir, { recursive: true, force: true });
  };
  const markerExists = async (name) => {
    try { await fs.access(path.join(gitDir, name)); return true; } catch { return false; }
  };
  const rebaseActive = async () => (await markerExists('rebase-merge')) || (await markerExists('rebase-apply'));
  const mergeActive = () => markerExists('MERGE_HEAD');
  const head = async () => (await git(['rev-parse', 'HEAD'])).stdout.trim();
  const branch = async () => (await git(['symbolic-ref', '--quiet', '--short', 'HEAD'])).stdout.trim();
  const remoteTip = async (name) => (await git(['rev-parse', 'refs/remotes/origin/' + name])).stdout.trim();
  const response = (session, extra = {}) => ({
    state: session?.phase || 'none',
    sessionId: session?.sessionId,
    branch: session?.branch,
    recoveryRef: session?.recoveryRef,
    round: session?.round,
    files: session?.files?.map(({ fileId, path: filePath, resolved }) => ({ fileId, path: filePath, resolved })),
    unsupportedFiles: session?.unsupportedFiles,
    ...extra,
  });
  const fail = (code, message, extra = {}) => ({ success: false, code, error: message, ...extra });
  const requireSession = async (sessionId) => {
    const session = await currentSession();
    if (!session || !sessionId || session.sessionId !== sessionId) {
      throw Object.assign(new Error('This conflict-resolution session is no longer active.'), { code: 'invalid-session' });
    }
    return session;
  };
  const indexSignature = async () => {
    const result = await git(['ls-files', '-u', '-z']);
    return hash(result.stdout);
  };

  async function inspectConflicts(session) {
    const unmerged = await git(['ls-files', '-u', '-z']);
    const records = unmerged.stdout.split('\0').filter(Boolean).map((record) => {
      const tab = record.indexOf('\t');
      const meta = record.slice(0, tab).split(/\s+/);
      return { mode: meta[0], oid: meta[1], stage: meta[2], path: record.slice(tab + 1) };
    });
    const grouped = new Map();
    for (const record of records) {
      if (!grouped.has(record.path)) grouped.set(record.path, []);
      grouped.get(record.path).push(record);
    }
    const files = [];
    const unsupportedFiles = [];
    for (const [filePath, stages] of grouped) {
      const byStage = new Map(stages.map((entry) => [entry.stage, entry]));
      let reason = '';
      if (!byStage.has('2') || !byStage.has('3')) reason = 'Both versions do not exist (delete/modify conflicts are not supported).';
      const modes = new Set(stages.map((entry) => entry.mode));
      if (!reason && [...modes].some((mode) => mode === '120000')) reason = 'Symbolic links are not supported.';
      if (!reason && [...modes].some((mode) => mode === '160000')) reason = 'Submodules are not supported.';
      if (!reason && modes.size > 1) reason = 'File type changes are not supported.';
      const absolute = path.resolve(workspaceDir, filePath);
      if (!reason && (path.relative(workspaceDir, absolute).startsWith('..') || path.isAbsolute(path.relative(workspaceDir, absolute)))) reason = 'Invalid file path.';
      let content = '';
      if (!reason) {
        const stat = await fs.stat(absolute);
        if (stat.size > MAX_CONFLICT_FILE_BYTES) reason = 'File is larger than 2 MiB.';
        else {
          const bytes = await fs.readFile(absolute);
          if (bytes.includes(0)) reason = 'Binary files are not supported.';
          else {
            content = bytes.toString('utf8');
            if (Buffer.from(content, 'utf8').compare(bytes) !== 0) reason = 'Only UTF-8 text files are supported.';
          }
        }
      }
      let parsed;
      if (!reason) {
        try { parsed = parseConflictText(content); } catch { reason = 'Conflict markers are malformed.'; }
      }
      if (reason) unsupportedFiles.push({ path: filePath, reason });
      else files.push({ fileId: opaqueId(), path: filePath, resolved: false, sourceHash: hash(content), parsed });
    }
    session.files = files;
    session.unsupportedFiles = unsupportedFiles;
    session.indexSignature = await indexSignature();
    return session;
  }

  async function restoreOriginal(session) {
    if (await mergeActive()) await git(['merge', '--abort']);
    if (await rebaseActive()) await git(['rebase', '--abort']);
    const recovery = (await git(['rev-parse', session.recoveryRef])).stdout.trim();
    const current = await head();
    if (recovery !== session.originalCommit) throw Object.assign(new Error('Recovery copy no longer matches the saved commit.'), { code: 'unexpected-repository-state' });
    if (current !== session.originalCommit) {
      const published = await git(['merge-base', '--is-ancestor', session.originalCommit, 'refs/remotes/origin/' + session.branch]).then(() => true, () => false);
      if (published) throw Object.assign(new Error('Saved work may already be on GitHub; automatic reset was refused.'), { code: 'manual-intervention' });
      await git(['reset', '--hard', session.recoveryRef]);
    }
  }

  async function beginMergeRound(session, remoteCommit) {
    session.remoteCommit = remoteCommit;
    session.expectedHead = await head();
    session.phase = 'preparing';
    await saveSession(session);
    try {
      await git(['-c', 'merge.conflictstyle=diff3', 'merge', '--no-ff', '--no-commit', remoteCommit], { timeout: 120_000 });
    } catch (error) {
      if (!(await mergeActive())) throw error;
    }
    if (!(await mergeActive())) {
      session.phase = 'committed';
      session.files = [];
      session.indexSignature = await indexSignature();
      await saveSession(session);
      return session;
    }
    await inspectConflicts(session);
    if (session.unsupportedFiles.length) {
      await restoreOriginal(session);
      session.phase = 'unsupported';
      await saveSession(session);
      return session;
    }
    session.phase = 'resolving';
    if (session.files.length === 0) session.phase = 'committed';
    await saveSession(session);
    return session;
  }

  async function reconcile(session) {
    const currentBranch = await branch().catch(() => '');
    const currentHead = await head().catch(() => '');
    if (currentBranch !== session.branch) {
      session.phase = 'manual-intervention';
      await saveSession(session);
      return response(session, { success: false, code: 'unexpected-repository-state' });
    }
    if (session.phase === 'manual-intervention' && !(await mergeActive())) {
      await git(['fetch', 'origin'], { timeout: 60_000 }).catch(() => null);
      const tip = await remoteTip(session.branch).catch(() => '');
      if (currentHead === session.originalCommit) {
        session.phase = 'aborted';
        await clearSession();
        return response(session, { success: true, code: 'resolution-stopped' });
      }
      if (tip && currentHead === tip) {
        session.phase = 'published';
        await clearSession();
        return response(session, { success: true });
      }
    }
    if (session.phase === 'resolving' && await mergeActive()) {
      const indexChanged = await indexSignature() !== session.indexSignature;
      let fileChanged = false;
      for (const file of session.files) {
        const content = await fs.readFile(path.join(workspaceDir, file.path), 'utf8').catch(() => null);
        if (content === null || hash(content) !== file.sourceHash) {
          fileChanged = true;
          break;
        }
      }
      if (indexChanged || fileChanged) {
        session.phase = 'manual-intervention';
        await saveSession(session);
        return response(session, { success: false, code: 'unexpected-repository-state' });
      }
    }
    if (session.phase === 'resolving' && !(await mergeActive())) {
      await git(['fetch', 'origin'], { timeout: 60_000 }).catch(() => null);
      const tip = await remoteTip(session.branch).catch(() => '');
      if (currentHead === session.originalCommit) {
        session.phase = 'aborted';
        await clearSession();
        return response(session, { success: true, code: 'resolution-stopped' });
      }
      if (tip && currentHead === tip) {
        session.phase = 'published';
        await clearSession();
        return response(session, { success: true });
      }
      session.phase = 'manual-intervention';
      await saveSession(session);
      return response(session, { success: false, code: 'unexpected-repository-state' });
    }
    if ((session.phase === 'committed' || session.phase === 'remote-advanced') && !(await mergeActive())) {
      await git(['fetch', 'origin'], { timeout: 60_000 }).catch(() => null);
      const tip = await remoteTip(session.branch).catch(() => '');
      if (tip && currentHead === tip) {
        session.phase = 'published';
        await clearSession();
        return response(session, { success: true });
      }
      if (currentHead === session.originalCommit) {
        session.phase = 'aborted';
        await clearSession();
        return response(session, { success: true, code: 'resolution-stopped' });
      }
      if (currentHead !== session.expectedHead) {
        session.phase = 'manual-intervention';
        await saveSession(session);
        return response(session, { success: false, code: 'unexpected-repository-state' });
      }
    }
    return response(session, { success: true });
  }

  return {
    isActive: async () => Boolean(await currentSession()),
    async start() {
      if (await currentSession()) return fail('invalid-session', 'A conflict-resolution session is already active.');
      if (!(await rebaseActive())) return fail('unexpected-repository-state', 'The failed publish conflict is no longer present.');
      const rebaseDirectory = await markerExists('rebase-merge') ? path.join(gitDir, 'rebase-merge') : path.join(gitDir, 'rebase-apply');
      const originalCommit = (await fs.readFile(path.join(rebaseDirectory, 'orig-head'), 'utf8').catch(async () => (await git(['rev-parse', 'ORIG_HEAD'])).stdout)).trim();
      const rebaseRemoteCommit = (await fs.readFile(path.join(rebaseDirectory, 'onto'), 'utf8').catch(async () => await head())).trim();
      const headName = (await fs.readFile(path.join(rebaseDirectory, 'head-name'), 'utf8').catch(() => '')).trim();
      const branchName = headName.startsWith('refs/heads/') ? headName.slice('refs/heads/'.length) : await branch().catch(() => '');
      if (!branchName) return fail('unexpected-repository-state', 'The original branch could not be verified.');
      const sessionId = opaqueId();
      const recoveryRef = 'refs/phantomwp/backups/' + Date.now() + '-' + sessionId.slice(0, 8);
      const session = { sessionId, originalCommit, expectedHead: originalCommit, branch: branchName, recoveryRef, remoteCommit: rebaseRemoteCommit, round: 1, phase: 'preparing', files: [], unsupportedFiles: [] };
      await fs.mkdir(stateDir, { recursive: true });
      await saveSession(session);
      await git(['update-ref', recoveryRef, originalCommit]);
      const recoveries = await readJson(recoveryPath, []);
      recoveries.unshift({ ref: recoveryRef, commit: originalCommit, branch: branchName, createdAt: new Date().toISOString() });
      await writeJson(recoveryPath, recoveries);
      try {
        await git(['rebase', '--abort']);
        if (await head() !== originalCommit || await branch() !== branchName) throw new Error('Rebase did not return to the saved branch and commit.');
        await refreshGitCredentials();
        await git(['fetch', 'origin'], { timeout: 60_000 });
        const started = await beginMergeRound(session, await remoteTip(branchName));
        if (started.phase === 'unsupported') {
          return response(started, fail('unsupported-conflict', 'These conflicts cannot be safely resolved in the wizard. Your saved work was restored.'));
        }
        return response(started, { success: true });
      } catch (error) {
        const classified = classifyGitError(error);
        session.phase = 'manual-intervention';
        await saveSession(session);
        return response(session, fail(classified.code, classified.message));
      }
    },
    async status({ sessionId } = {}) {
      const session = await currentSession();
      if (!session) return { success: true, state: 'none' };
      if (sessionId && sessionId !== session.sessionId) return fail('invalid-session', 'This conflict-resolution session is no longer active.');
      return reconcile(session);
    },
    async read({ sessionId, fileId }) {
      try {
        const session = await requireSession(sessionId);
        if (session.phase !== 'resolving') return fail('unexpected-repository-state', 'The session is not accepting conflict decisions.');
        const file = session.files.find((entry) => entry.fileId === fileId);
        if (!file) return fail('invalid-file', 'That conflict file is not part of this session.');
        const content = await fs.readFile(path.join(workspaceDir, file.path), 'utf8');
        if (hash(content) !== file.sourceHash) return fail('stale-content', 'The file changed after it was opened. Refresh before continuing.');
        const draft = await readJson(path.join(draftsDir, file.fileId + '.json'), null);
        return { success: true, sessionId, fileId, path: file.path, sourceHash: file.sourceHash, document: file.parsed, draft: draft?.content ?? null };
      } catch (error) { return fail(error.code || 'unexpected-repository-state', error.message); }
    },
    async save({ sessionId, fileId, sourceHash, content }) {
      try {
        const session = await requireSession(sessionId);
        if (session.phase !== 'resolving') return fail('unexpected-repository-state', 'The session is not accepting conflict decisions.');
        const file = session.files.find((entry) => entry.fileId === fileId);
        if (!file) return fail('invalid-file', 'That conflict file is not part of this session.');
        if (sourceHash !== file.sourceHash) return fail('stale-content', 'The source changed. Reload this file before saving.');
        if (typeof content !== 'string' || Buffer.byteLength(content) > MAX_CONFLICT_FILE_BYTES) return fail('invalid-draft', 'Resolved content must be UTF-8 text no larger than 2 MiB.');
        if (/^(<<<<<<< |=======|>>>>>>> |\|\|\|\|\|\|\| )/m.test(content)) return fail('unresolved-conflict', 'The result still contains conflict markers.');
        await writeJson(path.join(draftsDir, file.fileId + '.json'), { sourceHash, content });
        file.resolved = true;
        await saveSession(session);
        return response(session, { success: true, fileId });
      } catch (error) { return fail(error.code || 'unexpected-repository-state', error.message); }
    },
    async finish({ sessionId }) {
      try {
        let session = await requireSession(sessionId);
        if (session.phase !== 'resolving' && session.phase !== 'committed' && session.phase !== 'remote-advanced') return fail('unexpected-repository-state', 'The session cannot be published from its current state.');
        if (session.phase === 'resolving') {
          if (!(await mergeActive()) || await branch() !== session.branch || await head() !== session.expectedHead || await indexSignature() !== session.indexSignature) return fail('unexpected-repository-state', 'The merge, branch, or index changed. Automatic publishing was stopped.');
          if (session.files.some((file) => !file.resolved)) return fail('unresolved-conflict', 'Resolve every file before publishing.');
          for (const file of session.files) {
            const draft = await readJson(path.join(draftsDir, file.fileId + '.json'), null);
            const current = await fs.readFile(path.join(workspaceDir, file.path), 'utf8');
            if (!draft || draft.sourceHash !== file.sourceHash || hash(current) !== file.sourceHash) return fail('stale-content', 'A conflicted file changed. Reload it before publishing.');
            await fs.writeFile(path.join(workspaceDir, file.path), draft.content, 'utf8');
            await git(['add', '--', file.path]);
          }
          const remaining = (await git(['ls-files', '-u'])).stdout.trim();
          if (remaining) return fail('unresolved-conflict', 'Git still reports unresolved files.');
          await git(['commit', '-m', 'Merge GitHub changes (resolved with PhantomWP)']);
          session.expectedHead = await head();
          session.phase = 'committed';
          await saveSession(session);
        }
        if (session.phase === 'committed' && await mergeActive()) {
          await git(['commit', '-m', 'Merge GitHub changes']);
          session.expectedHead = await head();
          await saveSession(session);
        }
        if ((session.phase === 'committed' || session.phase === 'remote-advanced') && await head() !== session.expectedHead) {
          session.phase = 'manual-intervention';
          await saveSession(session);
          return response(session, fail('unexpected-repository-state', 'The repository changed outside the wizard. Automatic publishing was stopped.'));
        }
        await refreshGitCredentials();
        for (let cleanRounds = 0; cleanRounds <= 3; cleanRounds += 1) {
          await git(['fetch', 'origin'], { timeout: 60_000 });
          const tip = await remoteTip(session.branch);
          if (tip !== session.remoteCommit) {
            if (cleanRounds === 3) {
              session.phase = 'remote-advanced';
              await saveSession(session);
              return response(session, fail('remote-advanced', 'GitHub changed again. Try publishing once more.'));
            }
            session.round += 1;
            session = await beginMergeRound(session, tip);
            if (session.phase === 'resolving') return response(session, fail('remote-advanced', 'GitHub changed again while you were reviewing. There are new overlapping changes to check.'));
            if (session.phase === 'unsupported') return response(session, fail('unsupported-conflict', 'The new GitHub changes contain unsupported conflicts.'));
            if (await mergeActive()) await git(['commit', '-m', 'Merge newer GitHub changes']);
            session.expectedHead = await head();
            session.phase = 'committed';
            await saveSession(session);
            continue;
          }
          try {
            await git(['push', 'origin', 'HEAD:' + session.branch], { timeout: 60_000 });
            session.phase = 'published';
            await clearSession();
            return response(session, { success: true });
          } catch (error) {
            const classified = classifyGitError(error);
            if (classified.code === 'non-fast-forward') continue;
            session.phase = 'committed';
            await saveSession(session);
            return response(session, fail(classified.code, classified.message));
          }
        }
        return fail('remote-advanced', 'GitHub changed again. Try publishing once more.');
      } catch (error) { return fail(error.code || classifyGitError(error).code, error.message); }
    },
    async abort({ sessionId }) {
      try {
        const session = await requireSession(sessionId);
        if (session.phase === 'manual-intervention') return response(session, fail('unexpected-repository-state', 'Terminal changes are authoritative. Restore or publish them in the terminal before returning to the wizard.'));
        await restoreOriginal(session);
        session.phase = 'aborted';
        await clearSession();
        return response(session, { success: true });
      } catch (error) { return fail(error.code || 'unexpected-repository-state', error.message); }
    },
    async recoveries() {
      return { success: true, recoveries: await readJson(recoveryPath, []) };
    },
  };
}
