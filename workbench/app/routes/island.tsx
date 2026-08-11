import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { requireUser } from '~/a2/session.server';
import { Header } from '~/components/header/Header';

/*
 * Component Island (组件岛): AI-powered desktop widget image generator.
 * UI adapted from the prototype HTML section#ai block.
 * Calls DashScope Wan3 (wanx2.1-t2i-turbo) via /api/island/generate
 * and polls /api/island/task/:taskId for results.
 */

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as unknown as Record<string, string | undefined>;
  const user = await requireUser(request, env);

  return json({ username: user.username });
}

type GenerateState = 'idle' | 'loading' | 'success' | 'error';

export default function Island() {
  useLoaderData<{ username: string }>();

  const [input, setInput] = useState('下雨天 治愈 猫咪');
  const [state, setState] = useState<GenerateState>('idle');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (taskId: string) => {
      stopPolling();

      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/island/task/${taskId}`);
          const data = (await res.json()) as { status: string; imageUrl?: string; message?: string };

          if (data.status === 'SUCCEEDED') {
            stopPolling();
            setState('success');
            setImageUrl(data.imageUrl || null);
          } else if (data.status === 'FAILED') {
            stopPolling();
            setState('error');
            setErrorMsg(data.message || '图片生成失败，请重试。');
          }

          // PENDING / RUNNING → keep polling
        } catch {
          // Network error during poll — keep trying
        }
      }, 3000);
    },
    [stopPolling],
  );

  const handleGenerate = useCallback(async () => {
    const prompt = input.trim();

    if (!prompt) {
      return;
    }

    setState('loading');
    setImageUrl(null);
    setErrorMsg('');

    try {
      const res = await fetch('/api/island/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({ error: '请求失败' }))) as { error?: string };
        setState('error');
        setErrorMsg(data.error || '请求失败，请稍后重试。');

        return;
      }

      const { taskId } = (await res.json()) as { taskId: string };

      if (!taskId) {
        setState('error');
        setErrorMsg('服务未返回任务ID，请重试。');

        return;
      }

      startPolling(taskId);
    } catch {
      setState('error');
      setErrorMsg('网络错误，请检查连接后重试。');
    }
  }, [input, startPolling]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-bolt-elements-background-depth-1">
      <Header />
      <div className="flex-1 overflow-auto">
        {/* AI Generator section — adapted from prototype section#ai */}
        <section className="py-16 px-6">
          <div className="max-w-[1140px] mx-auto">
            <div
              className="relative overflow-hidden rounded-3xl p-10 md:p-14 text-white"
              style={{
                background: 'linear-gradient(135deg, #171628, #332a5e 55%, #6d3f92)',
                boxShadow: '0 24px 60px rgba(30,32,60,.14)',
              }}
            >
              {/* Decorative sparkle */}
              <span
                className="absolute pointer-events-none select-none"
                style={{ fontSize: 200, opacity: 0.07, right: -20, top: -30 }}
              >
                ✨
              </span>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-14 items-center relative z-1">
                {/* Left: input area */}
                <div>
                  <span
                    className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[13px] font-semibold mb-4"
                    style={{ background: 'rgba(255,255,255,.14)', color: '#ffd9ec' }}
                  >
                    AI 主题生成器
                  </span>
                  <h2 className="text-3xl font-bold leading-snug">
                    一句话，生成
                    <br />
                    一整个桌面。
                  </h2>
                  <p className="mt-4 text-sm leading-relaxed" style={{ color: '#c8c3e8' }}>
                    描述你想要的氛围，AI 自动生成壁纸、配色与组件皮肤的整套方案。在右侧输入框试试 →
                  </p>
                  <div className="flex gap-2.5 mt-6">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="例如：下雨天 治愈 猫咪"
                      className="flex-1 border-none outline-none rounded-[14px] px-4 py-3.5 text-sm text-gray-900"
                    />
                    <button
                      type="button"
                      onClick={handleGenerate}
                      disabled={state === 'loading' || !input.trim()}
                      className="rounded-[14px] px-6 font-semibold text-sm text-white cursor-pointer transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                      style={{
                        background: 'linear-gradient(90deg, #ff6b9d, #ff8f6b)',
                        border: 'none',
                      }}
                    >
                      {state === 'loading' ? '生成中…' : '生成'}
                    </button>
                  </div>
                </div>

                {/* Right: output area */}
                <div
                  className="rounded-[20px] p-6 min-h-[270px] flex flex-col"
                  style={{
                    background: 'rgba(255,255,255,.08)',
                    border: '1px solid rgba(255,255,255,.16)',
                  }}
                >
                  {state === 'idle' && (
                    <div className="flex-1 flex items-center justify-center text-[13px]" style={{ color: '#8f89b8' }}>
                      ✨ 等待你的第一个灵感…
                    </div>
                  )}

                  {state === 'loading' && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4">
                      <div className="w-10 h-10 rounded-full border-3 border-white/20 border-t-white animate-spin" />
                      <p className="text-sm" style={{ color: '#c8c3e8' }}>
                        ✨ AI 正在生成「{input.trim()}」主题…
                      </p>
                      <p className="text-xs" style={{ color: '#8f89b8' }}>
                        通常需要 10~30 秒，请稍候
                      </p>
                    </div>
                  )}

                  {state === 'success' && imageUrl && (
                    <div className="flex-1 flex flex-col">
                      <h4 className="text-[13px] font-normal mb-3" style={{ color: '#b9b3e0' }}>
                        生成结果 · 「{input.trim()}」
                      </h4>
                      <img
                        src={`/api/island/image?url=${encodeURIComponent(imageUrl)}`}
                        alt="AI 生成的桌面组件主题"
                        referrerPolicy="no-referrer"
                        className="w-full rounded-xl object-cover"
                        style={{ maxHeight: 360 }}
                      />
                      <a
                        href={imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 text-xs underline"
                        style={{ color: '#b9b3e0' }}
                      >
                        在新标签页打开图片
                      </a>
                    </div>
                  )}

                  {state === 'success' && !imageUrl && (
                    <div className="flex-1 flex items-center justify-center text-[13px]" style={{ color: '#8f89b8' }}>
                      生成完成但未返回图片，请重试。
                    </div>
                  )}

                  {state === 'error' && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3">
                      <div className="text-2xl">😥</div>
                      <p className="text-sm" style={{ color: '#ff6b9d' }}>
                        {errorMsg || '生成失败，请重试'}
                      </p>
                      <button
                        type="button"
                        onClick={handleGenerate}
                        className="mt-2 px-4 py-2 rounded-lg text-xs font-medium text-white/80 hover:text-white transition-colors"
                        style={{ background: 'rgba(255,255,255,.12)' }}
                      >
                        重新生成
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
