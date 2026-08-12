import { WebContainer, type FileSystemTree, type WebContainerProcess } from '@webcontainer/api';
import { useStore } from '@nanostores/react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { CodeMirrorEditor } from '~/components/editor/codemirror/CodeMirrorEditor';
import { restorePlazaSnapshot, writeBackPlazaSnapshot } from '~/lib/runtime/snapshot-cache';
import { themeStore } from '~/lib/stores/theme';

/*
 * A2 project-plaza (design D4/D5, tasks 4.3 + 4.4): lightweight, self-contained
 * visitor experience. It boots its own WebContainer (NOT the workbench
 * singleton, which is coupled to chat/workbench stores), mounts the stored
 * file snapshot, installs dependencies and runs the dev script, then renders
 * the live preview next to a read-only file tree + CodeMirror viewer.
 *
 * This module is a `.client.tsx` so `@webcontainer/api` never reaches the SSR
 * bundle; the route renders it inside <ClientOnly>.
 */

/** Flat `{ relativePath: content }` map, as returned by the snapshot route. */
type Snapshot = Record<string, string>;

/*
 * WebContainer allows exactly one booted instance per document, and
 * teardown() does NOT free the slot — booting a second time throws
 * "Only a single WebContainer instance can be booted" (React StrictMode
 * double-effects, SPA re-navigation, revisits). So the plaza keeps one
 * module-level instance for the whole page lifetime and re-mounts it per
 * visit instead of booting again.
 */
let plazaBootPromise: Promise<WebContainer> | undefined;

function getPlazaWebContainer(): Promise<WebContainer> {
  if (!plazaBootPromise) {
    plazaBootPromise = WebContainer.boot();
    // If boot fails, allow a retry on the next visit instead of caching
    // the rejection forever.
    plazaBootPromise.catch(() => {
      plazaBootPromise = undefined;
    });
  }

  return plazaBootPromise;
}

/** Dev process started by the current visit; killed on cleanup (the container itself survives). */
let activeDevProcess: WebContainerProcess | undefined;

type Phase = 'loading' | 'installing' | 'starting' | 'ready' | 'error';

interface PlazaVisitorProps {
  urlId: string;
  showFiles: boolean;
}

interface TreeNode {
  name: string;
  path: string;
  isFile: boolean;
  children: TreeNode[];
}

/** Builds a nested display tree from the flat snapshot paths (folders first). */
function buildDisplayTree(snapshot: Snapshot): TreeNode[] {
  const root: TreeNode = { name: '', path: '', isFile: false, children: [] };

  for (const filePath of Object.keys(snapshot)) {
    const segments = filePath.split('/').filter(Boolean);
    let node = root;
    let acc = '';

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];

      acc = acc ? `${acc}/${seg}` : seg;

      const isLast = i === segments.length - 1;
      let child = node.children.find((c) => c.name === seg);

      if (!child) {
        child = { name: seg, path: acc, isFile: isLast, children: [] };
        node.children.push(child);
      }

      node = child;
    }
  }

  sortTree(root);

  return root.children;
}

function sortTree(node: TreeNode) {
  node.children.sort((a, b) => {
    if (a.isFile !== b.isFile) {
      return a.isFile ? 1 : -1;
    }

    return a.name.localeCompare(b.name);
  });

  for (const child of node.children) {
    sortTree(child);
  }
}

/** Converts the flat snapshot into the nested tree `WebContainer.mount` wants. */
function snapshotToTree(snapshot: Snapshot): FileSystemTree {
  const root: Record<string, any> = {};

  for (const [filePath, contents] of Object.entries(snapshot)) {
    const segments = filePath.split('/').filter(Boolean);
    let node = root;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];

      if (i === segments.length - 1) {
        node[seg] = { file: { contents } };
      } else {
        if (!node[seg]) {
          node[seg] = { directory: {} };
        }

        node = node[seg].directory;
      }
    }
  }

  return root as FileSystemTree;
}

export const PlazaVisitor = memo(({ urlId, showFiles }: PlazaVisitorProps) => {
  const theme = useStore(themeStore);

  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | undefined>();
  const [snapshot, setSnapshot] = useState<Snapshot | undefined>();
  const [selectedPath, setSelectedPath] = useState<string | undefined>();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['src', 'app']));

  const webcontainerRef = useRef<WebContainer | undefined>();

  const tree = useMemo(() => (snapshot ? buildDisplayTree(snapshot) : []), [snapshot]);

  const toggleFolder = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);

      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }

      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;

    const fail = (message: string) => {
      if (!cancelled) {
        setErrorMsg(message);
        setPhase('error');
      }
    };

    (async () => {
      try {
        // 1) Pull the snapshot through the public resource route (task 4.1).
        const response = await fetch(`/api/a2/plaza/${encodeURIComponent(urlId)}/snapshot`);

        if (!response.ok) {
          fail('无法加载项目快照，请稍后再试');
          return;
        }

        const data = (await response.json()) as { snapshot?: Snapshot };
        const snap: Snapshot = data?.snapshot ?? {};

        if (cancelled) {
          return;
        }

        if (!snap || Object.keys(snap).length === 0) {
          fail('项目快照为空');
          return;
        }

        setSnapshot(snap);
        setSelectedPath(snap['package.json'] ? 'package.json' : Object.keys(snap)[0]);

        // 2) Reuse the page-level WebContainer singleton and mount the snapshot.
        const webcontainer = await getPlazaWebContainer();

        if (cancelled) {
          return;
        }

        webcontainerRef.current = webcontainer;
        await webcontainer.mount(snapshotToTree(snap));

        // 3) Install dependencies (PL-02: failures surface a friendly message).
        // replay-snapshot-cache: on a cache hit (package.json-hash keyed, shared
        // with the workbench) mount the cached workspace and skip npm install.
        setPhase('installing');

        let restored = false;
        const restoreResult = await restorePlazaSnapshot(webcontainer, snap['package.json'] ?? '');

        if (restoreResult.restored) {
          // Overlay the source snapshot on top of the cached workspace (source
          // files are authoritative; node_modules comes from the cache).
          await webcontainer.mount(snapshotToTree(snap));
          restored = true;
        } else {
          const install = await webcontainer.spawn('npm', ['install']);
          let installLog = '';

          // WebContainer process output streams strings (not bytes).
          install.output
            .pipeTo(
              new WritableStream<string>({
                write(chunk) {
                  installLog += chunk;
                },
              }),
            )
            .catch(() => undefined);

          const installExit = await install.exit;

          if (cancelled) {
            return;
          }

          if (installExit !== 0) {
            const tail = installLog.trim().split('\n').slice(-3).join('\n');
            fail(`依赖安装失败（退出码 ${installExit}）${tail ? `：\n${tail}` : ''}`);

            return;
          }
        }

        // 4) Run the dev/start script and wait for the server to be ready.
        setPhase('starting');

        let scripts: Record<string, string> = {};

        try {
          scripts = JSON.parse(snap['package.json'] ?? '{}').scripts ?? {};
        } catch {
          scripts = {};
        }

        const script = scripts.dev ? 'dev' : scripts.start ? 'start' : undefined;

        if (!script) {
          fail('该项目没有可用的启动脚本（dev / start）');
          return;
        }

        let ready = false;

        // Kill a dev process left over from a previous visit (same container
        // instance) so ports don't clash when switching projects.
        if (activeDevProcess) {
          try {
            activeDevProcess.kill();
          } catch {
            // already gone
          }

          activeDevProcess = undefined;
        }

        let devProcess = await webcontainer.spawn('npm', ['run', script]);
        activeDevProcess = devProcess;

        const onServerReady = (_port: number, url: string) => {
          if (!cancelled && !ready) {
            ready = true;
            setPreviewUrl(url);
            setPhase('ready');

            // cold install only: cache the installed workspace for later visits
            if (!restored) {
              void writeBackPlazaSnapshot(webcontainer, snap['package.json'] ?? '');
            }
          }
        };

        webcontainer.on('server-ready', onServerReady);

        /*
         * Restored-workspace recovery (workbench design D5 step 6, adapted):
         * if a cache-restored dev server never comes up, fall back to a cold
         * install and restart the script instead of hanging the visitor.
         */
        if (restored) {
          window.setTimeout(
            () => {
              if (cancelled || ready) {
                return;
              }

              void (async () => {
                try {
                  devProcess.kill();

                  const reinstall = await webcontainer.spawn('npm', ['install']);
                  const reinstallExit = await reinstall.exit;

                  if (cancelled) {
                    return;
                  }

                  if (reinstallExit !== 0) {
                    fail('依赖安装失败（缓存还原后回退安装）');
                    return;
                  }

                  devProcess = await webcontainer.spawn('npm', ['run', script]);
                  activeDevProcess = devProcess;
                } catch (error: any) {
                  fail(`预览启动失败：${error?.message || '未知错误'}`);
                }
              })();
            },
            45_000,
          );
        }
      } catch (error: any) {
        fail(`预览启动失败：${error?.message || '未知错误'}`);
      }
    })();

    return () => {
      cancelled = true;
      webcontainerRef.current = undefined;

      // Stop the dev server but keep the container alive: the boot slot is
      // one-time per document, so it must be reused across visits.
      if (activeDevProcess) {
        try {
          activeDevProcess.kill();
        } catch {
          // already gone
        }

        activeDevProcess = undefined;
      }
    };
  }, [urlId]);

  if (phase === 'error') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-bolt-elements-textSecondary">
        <div className="i-ph:warning-circle-duotone text-5xl text-bolt-elements-icon-error" />
        <p className="text-base font-medium text-bolt-elements-textPrimary">预览暂时不可用</p>
        <p className="whitespace-pre-line text-xs text-bolt-elements-textTertiary">{errorMsg}</p>
        <p className="text-xs text-bolt-elements-textTertiary">你仍然可以在左侧查看该项目的代码</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left: collapsible read-only file tree + code viewer (task 4.4). */}
      {showFiles && (
        <div className="flex w-1/2 min-w-0 border-r border-bolt-elements-borderColor">
          <div className="w-56 shrink-0 overflow-auto border-r border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 py-2">
            <div className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-bolt-elements-textTertiary">
              文件
            </div>
            <FileTree
              nodes={tree}
              depth={0}
              selectedPath={selectedPath}
              expanded={expanded}
              onSelect={setSelectedPath}
              onToggle={toggleFolder}
            />
          </div>
          <div className="min-w-0 flex-1">
            {selectedPath && snapshot ? (
              <CodeMirrorEditor
                id={selectedPath}
                theme={theme}
                editable={false}
                doc={{ value: snapshot[selectedPath] ?? '', isBinary: false, filePath: selectedPath }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-bolt-elements-textTertiary">
                选择文件查看代码
              </div>
            )}
          </div>
        </div>
      )}

      {/* Right: live preview booted from the snapshot (task 4.3). */}
      <div className={`flex min-w-0 flex-col ${showFiles ? 'w-1/2' : 'flex-1'}`}>
        {phase !== 'ready' || !previewUrl ? (
          <PreviewLoading phase={phase} />
        ) : (
          <iframe title="preview" src={previewUrl} className="h-full w-full border-none bg-white" />
        )}
      </div>
    </div>
  );
});

PlazaVisitor.displayName = 'PlazaVisitor';

interface FileTreeProps {
  nodes: TreeNode[];
  depth: number;
  selectedPath?: string;
  expanded: Set<string>;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
}

function FileTree({ nodes, depth, selectedPath, expanded, onSelect, onToggle }: FileTreeProps) {
  return (
    <>
      {nodes.map((node) =>
        node.isFile ? (
          <button
            key={node.path}
            type="button"
            onClick={() => onSelect(node.path)}
            className={`flex w-full items-center gap-1.5 px-3 py-1 text-left text-xs transition-colors ${
              selectedPath === node.path
                ? 'bg-bolt-elements-background-depth-3 text-bolt-elements-item-contentAccent'
                : 'text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3'
            }`}
            style={{ paddingLeft: `${depth * 12 + 12}px` }}
          >
            <span className="i-ph:file-text shrink-0" />
            <span className="truncate">{node.name}</span>
          </button>
        ) : (
          <div key={node.path}>
            <button
              type="button"
              onClick={() => onToggle(node.path)}
              className="flex w-full items-center gap-1.5 px-3 py-1 text-left text-xs text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
              style={{ paddingLeft: `${depth * 12 + 12}px` }}
            >
              <span className={`shrink-0 ${expanded.has(node.path) ? 'i-ph:caret-down' : 'i-ph:caret-right'}`} />
              <span className="truncate">{node.name}</span>
            </button>
            {expanded.has(node.path) && (
              <FileTree
                nodes={node.children}
                depth={depth + 1}
                selectedPath={selectedPath}
                expanded={expanded}
                onSelect={onSelect}
                onToggle={onToggle}
              />
            )}
          </div>
        ),
      )}
    </>
  );
}

function PreviewLoading({ phase }: { phase: Phase }) {
  const [elapsed, setElapsed] = useState(0);

  // Elapsed-time counter (1s tick) so visitors can tell a slow install from a hang.
  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((s) => s + 1), 1000);

    return () => window.clearInterval(timer);
  }, []);

  const label =
    phase === 'installing' ? '正在安装依赖…' : phase === 'starting' ? '正在启动开发服务器…' : '正在加载项目…';

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-white text-bolt-elements-textSecondary">
      <div className="i-ph:spinner-bold animate-spin text-4xl text-bolt-elements-item-contentAccent" />
      <p className="text-sm">{label}</p>
      <p className="text-xs text-bolt-elements-textTertiary">
        需要安装依赖，可能需要一点时间（已耗时 {elapsed} 秒）
      </p>
    </div>
  );
}
