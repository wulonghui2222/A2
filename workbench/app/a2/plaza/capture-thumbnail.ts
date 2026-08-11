import { workbenchStore } from '~/lib/stores/workbench';
import { toast } from 'react-toastify';

/*
 * A2 plaza-card-thumbnails (tasks 4.1-4.3, final design): owner-side thumbnail
 * capture. When the owner publishes a project from the workbench header, the
 * visible preview is screenshotted via getDisplayMedia("share current tab"):
 * one frame is grabbed, the preview iframe region is cropped out, downscaled
 * to the plaza card size (16:9, 640px wide) under the 200KB upload cap, and
 * POSTed to the thumbnail route.
 *
 * Why not inject a capture script into the preview (original design D1)?
 * The preview proxy tunnels the container exclusively for the preview
 * document that connected at boot time; every freshly loaded document on the
 * preview origin receives the proxy's "Unable to connect" bootstrap page, so
 * an injected script can never reach a live page (diagnosed 2026-08, after
 * ruling out disk caching, CSP and entry-HTML mismatches). The container's
 * dev server is also NOT reachable from the host network, so server-side
 * headless capture is out too. Tab capture is the only reliable channel —
 * it costs one confirmation click on the browser's share dialog.
 *
 * Everything here is fire-and-forget by contract: any failure resolves with
 * `ok: false` instead of throwing, so publishing is never blocked (PL-04).
 *
 * Only import this module on the client (dynamic import from the header
 * button).
 */

/** Plaza cards show a 16:9 thumbnail, cropped from the top of the shot. */
const CARD_ASPECT = 9 / 16;

/** Encoded thumbnails are downscaled and must stay under the server's 200KB cap. */
const OUTPUT_WIDTH = 640;
const MAX_BASE64_CHARS = 200 * 1024;

/** How many times to re-prompt when the user shares the desktop instead of the tab. */
const MAX_TAB_PROMPTS = 2;

/** How long the hint toast stays readable before the share dialog opens. */
const HINT_READ_MS = 1_500;

// Module-level lock: at most one capture task at a time (design D5).
let capturing = false;

export interface CaptureResult {
  ok: boolean;

  /** Human-readable reason when ok is false (diagnostics, shown as a toast). */
  reason?: string;
}

/**
 * Runs one capture round for `projectId`: prompts the browser's
 * share-current-tab dialog, crops the visible preview region out of one
 * grabbed frame and uploads it. Never throws; `ok` is true only when the
 * thumbnail was accepted by the server.
 */
export async function captureProjectThumbnail(projectId: string): Promise<CaptureResult> {
  console.info('[a2-thumbnail] capture flow v3 (overlays hidden before prompt)');

  if (capturing) {
    // A capture is already in flight; skip silently (design D5).
    return { ok: false, reason: '已有截图任务在进行中' };
  }

  capturing = true;

  try {
    const dataUrl = await capturePreviewFromTab();

    return await uploadThumbnail(projectId, dataUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.warn('[a2-thumbnail] capture failed:', error);

    const reason = message.includes('NotAllowedError')
      ? '已取消共享标签页，未生成缩略图'
      : `标签页截图失败：${message}`;

    return { ok: false, reason };
  } finally {
    capturing = false;
  }
}

async function uploadThumbnail(projectId: string, dataUrl: string): Promise<CaptureResult> {
  const upload = await fetch(`/api/a2/projects/${encodeURIComponent(projectId)}/thumbnail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ thumbnail: dataUrl }),
  });

  if (!upload.ok) {
    console.warn(`[a2-thumbnail] upload rejected (${upload.status}), payload ${dataUrl.length} chars`);
    return { ok: false, reason: `缩略图上传被拒绝（HTTP ${upload.status}）` };
  }

  console.info('[a2-thumbnail] capture ok');

  return { ok: true };
}

/*
 * Resolves once `video` has presented two fresh frames (or after the
 * fallback delay), so the drawn frame reflects the page state at draw
 * time rather than a stale buffer from before the overlays were hidden.
 */
async function waitForFreshFrames(video: HTMLVideoElement): Promise<void> {
  const withCallback = video as HTMLVideoElement & {
    requestVideoFrameCallback?: (callback: () => void) => number;
  };

  if (typeof withCallback.requestVideoFrameCallback !== 'function') {
    await new Promise((resolve) => setTimeout(resolve, 400));

    return;
  }

  await new Promise<void>((resolve) => {
    const fallback = setTimeout(resolve, 800);

    withCallback.requestVideoFrameCallback?.(() => {
      withCallback.requestVideoFrameCallback?.(() => {
        clearTimeout(fallback);
        resolve();
      });
    });
  });
}

/*
 * Captures the CURRENT TAB via getDisplayMedia (the same capability the
 * built-in ScreenshotSelector uses) and crops the visible preview iframe
 * region out of the frame. Throws when the user declines the share prompt
 * (NotAllowedError) or the API is unavailable.
 */
async function capturePreviewFromTab(): Promise<string> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('当前浏览器不支持标签页捕获');
  }

  /*
   * Heads-up before the browser prompt. selfBrowserSurface MUST be
   * 'include': its default is 'exclude', which removes the CALLING tab from
   * the picker's tab list (observed on Chrome: only the other tabs were
   * selectable). preferCurrentTab is kept so supporting browsers show the
   * simplified single-choice dialog instead. Wrong surfaces (desktop /
   * window) are still detected afterwards via the track's displaySurface and
   * re-prompted (up to MAX_TAB_PROMPTS).
   */
  toast.info('请在共享弹窗中选择当前页面标签，然后点共享');

  let stream: MediaStream | undefined;

  /*
   * Toasts are fixed-position overlays that would be baked into the
   * captured frame. Give the hint above a moment to be read, then clear
   * all toasts BEFORE the share dialog opens so the stream starts on an
   * already-clean page; a stylesheet stays injected for the whole capture
   * so toasts fired mid-capture (e.g. by the publish flow) also stay out
   * of the frame. The stylesheet is removed in the final `finally`, so
   * result toasts render normally again.
   */
  const hideStyle = document.createElement('style');

  hideStyle.textContent = '.Toastify,.Toastify__toast-container{display:none!important}';

  const hideToasts = () => {
    toast.dismiss();
    document.head.appendChild(hideStyle);
  };

  const showToasts = () => {
    hideStyle.remove();
  };

  try {
    for (let promptRound = 0; promptRound < MAX_TAB_PROMPTS; promptRound += 1) {
      // Let the hint toast be read, then clear the page before prompting.
      await new Promise((resolve) => setTimeout(resolve, HINT_READ_MS));
      hideToasts();

      stream = await navigator.mediaDevices.getDisplayMedia({
        audio: false,
        video: true,
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
      } as MediaStreamConstraints);

      const surface = stream.getVideoTracks()[0]?.getSettings().displaySurface;

      console.info(`[a2-thumbnail] tab capture surface: ${surface ?? 'unknown'}`);

      if (surface === undefined || surface === 'browser') {
        // Confirmed tab surface (or an engine that doesn't report one).
        break;
      }

      // Screen/window shared instead of the tab: stop and ask again.
      stream.getTracks().forEach((track) => track.stop());
      stream = undefined;

      if (promptRound === MAX_TAB_PROMPTS - 1) {
        throw new Error(`共享源不正确（${surface}），需要共享本标签页`);
      }

      showToasts();
      toast.info('刚才共享的不是本标签页，请在弹窗的「标签页」分类中选择当前页面');
    }

    if (!stream) {
      throw new Error('未能获取标签页共享流');
    }

    const video = document.createElement('video');

    video.style.cssText = 'position:fixed;opacity:0;pointer-events:none;z-index:-1;';
    video.muted = true;
    video.srcObject = stream;
    document.body.appendChild(video);

    try {
      await video.play();
      await new Promise<void>((resolve, reject) => {
        if (video.videoWidth > 0) {
          resolve();
          return;
        }

        video.onloadedmetadata = () => resolve();
        setTimeout(() => reject(new Error('标签页画面获取超时')), 5_000);
      });

      // Draw only from frames presented after the overlays were hidden.
      await waitForFreshFrames(video);

      /*
       * Locate the visible preview iframe and map its viewport rect into the
       * captured frame: Chrome captures the tab at devicePixelRatio scale.
       */
      const previews = workbenchStore.previews.get();
      const preview = [...previews].reverse().find((info) => info.ready && info.baseUrl);
      const iframe = preview
        ? Array.from(document.querySelectorAll('iframe')).find((candidate) => candidate.src.startsWith(preview.baseUrl))
        : undefined;

      const ratio = window.devicePixelRatio || 1;
      const frameWidth = video.videoWidth;
      const frameHeight = video.videoHeight;

      let sx = 0;
      let sy = 0;
      let sw = frameWidth;
      let sh = frameHeight;

      if (iframe) {
        const rect = iframe.getBoundingClientRect();

        sx = Math.max(0, Math.round(rect.left * ratio));
        sy = Math.max(0, Math.round(rect.top * ratio));
        sw = Math.min(frameWidth - sx, Math.round(rect.width * ratio));
        sh = Math.min(frameHeight - sy, Math.round(rect.height * ratio));
      }

      if (sw <= 0 || sh <= 0) {
        throw new Error('预览区域不可见');
      }

      /*
       * Crop the top 16:9 band of the preview region and encode straight at
       * card size with progressive quality, so the payload always fits the
       * 200KB upload cap.
       */
      const sourceHeight = Math.min(sh, Math.max(1, Math.round(sw * CARD_ASPECT)));
      const canvas = document.createElement('canvas');

      canvas.width = OUTPUT_WIDTH;
      canvas.height = Math.max(1, Math.round(OUTPUT_WIDTH * CARD_ASPECT));

      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('画布不可用');
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, sx, sy, sw, sourceHeight, 0, 0, canvas.width, canvas.height);

      let encoded = canvas.toDataURL('image/jpeg', 0.7);

      for (const quality of [0.55, 0.4, 0.3, 0.2, 0.1]) {
        if (encoded.length <= MAX_BASE64_CHARS) {
          break;
        }

        encoded = canvas.toDataURL('image/jpeg', quality);
      }

      return encoded.replace(/^data:image\/jpeg;base64,/, '');
    } finally {
      video.srcObject = null;
      video.remove();
    }
  } finally {
    showToasts();

    // Always stop sharing the moment we are done with the frame.
    stream?.getTracks().forEach((track) => track.stop());
  }
}
