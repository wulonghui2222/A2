import { useStore } from '@nanostores/react';
import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import useViewport from '~/lib/hooks';
import { chatStore } from '~/lib/stores/chat';
import { workbenchStore } from '~/lib/stores/workbench';
import { chatId } from '~/lib/persistence';
import { saveProjectSnapshot } from '~/a2/persistence/db';
import { classNames } from '~/utils/classNames';

interface HeaderActionButtonsProps {}

export function HeaderActionButtons({}: HeaderActionButtonsProps) {
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const { showChat } = useStore(chatStore);

  const isSmallViewport = useViewport(1024);

  const canHideChat = showWorkbench || !showChat;

  return (
    <div className="flex items-center gap-2">
      <div className="flex border border-bolt-elements-borderColor rounded-md overflow-hidden">
        <Button
          active={showChat}
          disabled={!canHideChat || isSmallViewport} // expand button is disabled on mobile as it's not needed
          onClick={() => {
            if (canHideChat) {
              chatStore.setKey('showChat', !showChat);
            }
          }}
        >
          <div className="i-bolt:chat text-sm" />
        </Button>
        <div className="w-[1px] bg-bolt-elements-borderColor" />
        <Button
          active={showWorkbench}
          onClick={() => {
            if (showWorkbench && !showChat) {
              chatStore.setKey('showChat', true);
            }

            workbenchStore.showWorkbench.set(!showWorkbench);
          }}
        >
          <div className="i-ph:code-bold" />
        </Button>
      </div>
      {/* A2 project-plaza (task 5.3): explicit save — writes the file snapshot. */}
      <SaveProjectButton />
      {/* A2 plaza-card-thumbnails (D7): publish lives next to the preview. */}
      <PublishProjectButton />
    </div>
  );
}

function SaveProjectButton() {
  const [saving, setSaving] = useState(false);

  const onClick = async () => {
    const id = chatId.get();

    if (!id) {
      toast.error('项目还没有完成首次保存，请等待生成结束后重试');
      return;
    }

    setSaving(true);

    try {
      await saveProjectSnapshot(id);
      toast.success('已保存，可公开到项目广场');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      className="flex items-center gap-1 px-2 py-1.5 border border-bolt-elements-borderColor rounded-md text-sm text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive disabled:cursor-not-allowed disabled:opacity-50"
      disabled={saving}
      onClick={onClick}
      title="保存当前项目文件，生成广场展示用的快照"
    >
      <div className="i-ph:floppy-disk text-sm" />
      {saving ? '保存中…' : '保存'}
    </button>
  );
}

/*
 * A2 plaza-card-thumbnails (task 5.1 / revised D7): publish entry in the
 * workbench header. Publishing = force-save snapshot -> visibility toggle ->
 * fire-and-forget thumbnail capture against the running preview; capturing
 * never blocks publishing (PL-04). Hidden when signed out or before the
 * first chat save (the project route answers 401/404 then).
 */
function PublishProjectButton() {
  const currentChatId = useStore(chatId);
  const [visibility, setVisibility] = useState<'unknown' | 'hidden' | 'public' | 'private'>('unknown');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cleanup = () => {
      cancelled = true;
    };

    if (!currentChatId) {
      setVisibility('unknown');
      return cleanup;
    }

    setVisibility('unknown');

    fetch(`/api/projects/${encodeURIComponent(currentChatId)}`)
      .then((response) => (response.ok ? (response.json() as Promise<{ isPublic?: boolean }>) : undefined))
      .then((data) => {
        if (!cancelled) {
          setVisibility(data ? (data.isPublic ? 'public' : 'private') : 'hidden');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setVisibility('hidden');
        }
      });

    return cleanup;
  }, [currentChatId]);

  if (visibility === 'unknown' || visibility === 'hidden') {
    return null;
  }

  const isPublic = visibility === 'public';

  const onClick = async () => {
    const id = chatId.get();

    if (!id) {
      toast.error('项目还没有完成首次保存，请等待生成结束后重试');
      return;
    }

    setBusy(true);

    try {
      const response = await (async () => {
        if (isPublic) {
          return fetch(`/api/a2/projects/${encodeURIComponent(id)}/visibility`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isPublic: false }),
          });
        }

        /*
         * D7: publishing force-saves the snapshot first, so the "save first"
         * 409 never surfaces in the normal flow.
         */
        await saveProjectSnapshot(id);

        return fetch(`/api/a2/projects/${encodeURIComponent(id)}/visibility`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isPublic: true }),
        });
      })();

      if (!response.ok) {
        const detail = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
        throw new Error(detail?.error ?? '操作失败');
      }

      if (isPublic) {
        setVisibility('private');
        toast.success('已取消公开');

        return;
      }

      setVisibility('public');
      toast.info('正在为项目生成缩略图…');

      // Dynamic import keeps @webcontainer/api out of the SSR bundle.
      import('~/a2/plaza/capture-thumbnail')
        .then(({ captureProjectThumbnail }) => captureProjectThumbnail(id))
        .then((result) => {
          if (result.ok) {
            toast.success('缩略图已生成');
          } else {
            /*
             * Diagnostics: capture degrades silently for the plaza card, but
             * the owner should know WHY no screenshot was produced.
             */
            toast.info(`缩略图生成失败：${result.reason ?? '未知原因'}（不影响公开）`);
          }
        })
        .catch((error) => console.warn('[a2-thumbnail] capture skipped:', error));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      className="flex items-center gap-1 px-2 py-1.5 border border-bolt-elements-borderColor rounded-md text-sm text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive disabled:cursor-not-allowed disabled:opacity-50"
      disabled={busy}
      onClick={onClick}
      title={isPublic ? '从项目广场撤回（保留已生成的缩略图）' : '保存快照并公开到项目广场，自动生成缩略图'}
    >
      <div className={`text-sm ${isPublic ? 'i-ph:globe-simple' : 'i-ph:upload-simple'}`} />
      {busy ? '处理中…' : isPublic ? '取消公开' : '公开到广场'}
    </button>
  );
}

interface ButtonProps {
  active?: boolean;
  disabled?: boolean;
  children?: any;
  onClick?: VoidFunction;
}

function Button({ active = false, disabled = false, children, onClick }: ButtonProps) {
  return (
    <button
      className={classNames('flex items-center p-1.5', {
        'bg-bolt-elements-item-backgroundDefault hover:bg-bolt-elements-item-backgroundActive text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary':
          !active,
        'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent': active && !disabled,
        'bg-bolt-elements-item-backgroundDefault text-alpha-gray-20 dark:text-alpha-white-20 cursor-not-allowed':
          disabled,
      })}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
