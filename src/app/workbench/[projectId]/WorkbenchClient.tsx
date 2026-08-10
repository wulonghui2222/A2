"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * Workbench embed client (WE-01 / WE-02 / WE-04).
 *
 * Issues a one-time seam token, sends the handshake into the bolt fork
 * iframe, tracks readiness, and persists artifacts via the A2 session API
 * (the postMessage channel itself carries no write trust — design D3).
 */

type Phase = "connecting" | "ready" | "timeout";
type SaveState = "idle" | "saving" | "saved" | "error";

const HANDSHAKE_TIMEOUT_MS = 30_000;
const HANDSHAKE_RETRY_MS = 1_000;
const HANDSHAKE_MAX_RETRIES = 10;

const A2_SOURCE = "a2-workbench";
const A2_ACK_SOURCE = "a2-workbench-ack";

interface Props {
  projectId: string;
  src: string;
  isNew: boolean;
  prompt?: string;
  workbenchOrigin: string;
}

export function WorkbenchClient({ projectId, src, isNew, prompt, workbenchOrigin }: Props) {
  const [phase, setPhase] = useState<Phase>("connecting");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const tokenRef = useRef<string | null>(null);
  const phaseRef = useRef<Phase>("connecting");
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  phaseRef.current = phase;

  const issueToken = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch("/api/workbench/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) return null;
      const body = await res.json();
      tokenRef.current = body.token;
      return body.token;
    } catch {
      return null;
    }
  }, [projectId]);

  const sendHandshake = useCallback(
    (token: string) => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      win.postMessage(
        {
          source: A2_SOURCE,
          type: "handshake",
          token,
          project: { id: projectId, prompt, isNew },
        },
        { targetOrigin: workbenchOrigin }
      );
    },
    [projectId, prompt, isNew, workbenchOrigin]
  );

  // Handshake is driven by iframe (re)loads rather than mount: every load of
  // the iframe document (first load, dev HMR, internal navigation) loses its
  // seam state, so each load issues a fresh token and handshakes again, with
  // bounded retries while bolt finishes booting.
  const handleIframeLoad = useCallback(async () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    setPhase("connecting");

    const token = await issueToken();
    if (!token) return;

    let attempts = 0;
    const send = () => {
      sendHandshake(token);
      attempts += 1;
      if (phaseRef.current === "connecting" && attempts < HANDSHAKE_MAX_RETRIES) {
        retryTimerRef.current = setTimeout(send, HANDSHAKE_RETRY_MS);
      }
    };
    send();
  }, [issueToken, sendHandshake]);

  // Global handshake timeout (workbench service down / bolt never acks).
  useEffect(() => {
    timeoutTimerRef.current = setTimeout(() => {
      setPhase((p) => (p === "connecting" ? "timeout" : p));
    }, HANDSHAKE_TIMEOUT_MS);

    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
    };
  }, []);

  // Seam message listener
  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== workbenchOrigin) return;
      const data = event.data as {
        source?: string;
        type?: string;
        token?: string;
        ok?: boolean;
        files?: unknown;
      };
      if (data?.source !== A2_ACK_SOURCE) return;

      if (data.type === "handshake-ack" && data.token === tokenRef.current) {
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
        setPhase("ready");
        return;
      }

      if (data.type === "artifact") {
        setSaveState("saving");
        const iframeWin = iframeRef.current?.contentWindow;
        const ack = (ok: boolean) => {
          iframeWin?.postMessage(
            { source: A2_SOURCE, type: "artifact-ack", token: data.token, ok },
            { targetOrigin: workbenchOrigin }
          );
        };

        try {
          // Re-issue a fresh token: the handshake token (5 min TTL) usually
          // expires before the first save in a real session.
          const freshToken = await issueToken();
          if (!freshToken) throw new Error("token issue failed");

          const res = await fetch("/api/workbench/artifact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId, token: freshToken, files: data.files }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body?.error ?? `save failed (${res.status})`);
          }
          ack(true);
          setSaveState("saved");
        } catch (error) {
          console.error("Workbench save failed:", error);
          ack(false);
          setSaveState("error");
        }
        return;
      }

      if (data.type === "artifact-error") {
        setSaveState("error");
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [projectId, workbenchOrigin, issueToken]);

  return (
    <div className="relative flex-1 min-h-0">
      <iframe
        ref={iframeRef}
        src={src}
        onLoad={() => void handleIframeLoad()}
        className="w-full h-full border-0"
        allow="cross-origin-isolated"
        title="生成工作台"
        data-testid="workbench-iframe"
      />

      {phase === "connecting" && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 text-xs px-3 py-1.5 rounded-full bg-white/90 border border-gray-200 text-gray-600 shadow-sm">
          正在连接工作台…
        </div>
      )}

      {saveState !== "idle" && phase === "ready" && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm px-4 py-2 rounded-lg border shadow-sm bg-white"
          data-testid="workbench-save-state"
        >
          {saveState === "saving" && <span className="text-gray-600">保存中…</span>}
          {saveState === "saved" && (
            <span className="text-emerald-700">
              已保存 ·{" "}
              <Link href={`/projects/${projectId}`} className="underline font-medium">
                查看项目
              </Link>
            </span>
          )}
          {saveState === "error" && <span className="text-red-600">保存失败，请重试</span>}
        </div>
      )}

      {phase === "timeout" && (
        <div className="absolute inset-0 bg-gray-50 flex items-center justify-center">
          <div className="max-w-md text-center px-6">
            <p className="text-lg font-semibold text-gray-900 mb-2">工作台服务不可用</p>
            <p className="text-sm text-gray-500 mb-4">
              未能与生成工作台建立连接。请确认工作台服务正在运行
              （开发环境：workbench/ 目录下执行 pnpm dev），并检查网络可达性后重试。
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors"
            >
              重新加载
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
