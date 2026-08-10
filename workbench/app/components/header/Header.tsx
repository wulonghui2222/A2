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
      <div className="flex items-center gap-2 z-logo text-bolt-elements-textPrimary cursor-pointer">
        <div className="i-ph:sidebar-simple-duotone text-xl" />
        <a href="/" className="text-2xl font-semibold text-accent flex items-center">
          {/* A2: replace the bolt.diy logo image with the platform name. */}
          <span>A2</span>
        </a>
      </div>
      {chat.started && ( // Display ChatDescription and HeaderActionButtons only when the chat has started.
        <>
          <span className="flex-1 px-4 truncate text-center text-bolt-elements-textPrimary">
            <ClientOnly>{() => <ChatDescription />}</ClientOnly>
          </span>
          <ClientOnly>
            {() => (
              <div className="mr-1">
                <HeaderActionButtons />
              </div>
            )}
          </ClientOnly>
        </>
      )}
      {loaderData?.username && (
        <div className="ml-auto flex items-center gap-3 text-sm text-bolt-elements-textSecondary">
          {/* A2 (task 5.x): entry point to "我的项目" (WB-07). */}
          <a href="/my-projects" className="hover:text-bolt-elements-textPrimary">
            我的项目
          </a>
          <span>{loaderData.username}</span>
          <Form method="post" action="/logout">
            <button
              type="submit"
              className="text-bolt-elements-item-contentAccent hover:underline"
            >
              退出
            </button>
          </Form>
        </div>
      )}
    </header>
  );
}
