import { useStore } from '@nanostores/react';
import { Form, useLoaderData } from '@remix-run/react';
import { ClientOnly } from 'remix-utils/client-only';
import { chatStore } from '~/lib/stores/chat';
import { classNames } from '~/utils/classNames';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';

export function Header() {
  const chat = useStore(chatStore);

  // A2 (task 4.3): session user comes from the route loader (workbench only).
  const loaderData = useLoaderData<{ username?: string }>();

  return (
    <header
      className={classNames('flex items-center p-5 border-b h-[var(--header-height)]', {
        'border-transparent': !chat.started,
        'border-bolt-elements-borderColor': chat.started,
      })}
    >
      {/* Left: brand */}
      <div className="flex items-center gap-2 z-logo text-bolt-elements-textPrimary cursor-pointer shrink-0">
        <div className="i-ph:sidebar-simple-duotone text-xl" />
        <a href="/" className="text-2xl font-semibold text-accent flex items-center">
          {/* A2: replace the bolt.diy logo image with the platform name. */}
          <span>A2</span>
        </a>
      </div>

      {/* Center-left: navigation links */}
      <nav className="flex-1 flex items-center gap-1 pl-8">
        <a
          href="/my-projects"
          className="px-4 py-1.5 rounded-md text-[15px] text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive transition-colors"
        >
          我的项目
        </a>
        <a
          href="/plaza"
          className="px-4 py-1.5 rounded-md text-[15px] text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive transition-colors"
        >
          项目广场
        </a>
        <a
          href="/island"
          className="px-4 py-1.5 rounded-md text-[15px] text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive transition-colors"
        >
          组件岛
        </a>
      </nav>

      {chat.started && ( // Display ChatDescription and HeaderActionButtons only when the chat has started.
        <div className="flex items-center gap-2 mx-4 shrink-0">
          <span className="truncate max-w-48 text-sm text-bolt-elements-textPrimary">
            <ClientOnly>{() => <ChatDescription />}</ClientOnly>
          </span>
          <ClientOnly>
            {() => (
              <div>
                <HeaderActionButtons />
              </div>
            )}
          </ClientOnly>
        </div>
      )}

      {/* Right: user area */}
      <div className="ml-auto flex items-center shrink-0">
        {loaderData?.username ? (
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-gray-100">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-300 text-xs font-semibold text-gray-700">
              {(loaderData.username || '?').charAt(0).toUpperCase()}
            </span>
            <span className="text-sm text-gray-700">{loaderData.username}</span>
            <Form method="post" action="/logout">
              <button type="submit" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                退出
              </button>
            </Form>
          </div>
        ) : (
          <a href="/login" className="text-sm text-bolt-elements-item-contentAccent hover:underline">
            登录
          </a>
        )}
      </div>
    </header>
  );
}
