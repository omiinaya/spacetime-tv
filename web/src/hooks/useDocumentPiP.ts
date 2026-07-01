import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";

// Types for the Document Picture-in-Picture API (Chrome 116+)
// Not yet in standard TS DOM types
interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
  window: Window | null;
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture;
  }
}

/** Check if Document Picture-in-Picture API is available. */
export function isDocumentPiPSupported(): boolean {
  return typeof window !== "undefined" && "documentPictureInPicture" in window;
}

/**
 * Manages the Document Picture-in-Picture lifecycle.
 *
 * When activated, moves the video element into a floating PiP window
 * with basic controls and dark styling. When the PiP window is closed,
 * the video element is returned to its original container.
 *
 * Falls back seamlessly to HTMLVideoElement.requestPictureInPicture()
 * when the Document PiP API is not available.
 */
export function useDocumentPiP(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
) {
  const [isPiPActive, setIsPiPActive] = useState(false);
  const pipWindowRef = useRef<Window | null>(null);
  const returnContainerRef = useRef<HTMLElement | null>(null);

  // Sync state with actual PiP window lifecycle
  useEffect(() => {
    // The Document PiP API tracks state via the window reference.
    // Cleanup is handled by the pagehide/unload listeners in enterPiP.
  }, []);

  /** Enter Document Picture-in-Picture mode. */
  const enterPiP = useCallback(async () => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    // Try Document PiP API first
    if (isDocumentPiPSupported()) {
      try {
        const pip = window.documentPictureInPicture!;

        const pipWindow = await pip.requestWindow({
          width: video.videoWidth || 640,
          height: (video.videoHeight || 360) + 40, // Extra height for controls
        });

        pipWindowRef.current = pipWindow;

        // Style the PiP window
        const style = pipWindow.document.createElement("style");
        style.textContent = `
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { background: #000; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
          #pip-video-container { flex: 1; display: flex; align-items: center; justify-content: center; }
          video { width: 100%; height: 100%; object-fit: contain; }
          #pip-controls { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 8px 12px; background: #111; }
          #pip-controls button { background: none; border: none; color: #ccc; cursor: pointer; padding: 4px 8px; font-size: 14px; border-radius: 4px; display: flex; align-items: center; gap: 4px; }
          #pip-controls button:hover { color: #fff; background: rgba(255,255,255,0.1); }
        `;
        pipWindow.document.head.appendChild(style);

        // Create container and controls
        const videoContainer = pipWindow.document.createElement("div");
        videoContainer.id = "pip-video-container";

        const controlsDiv = pipWindow.document.createElement("div");
        controlsDiv.id = "pip-controls";

        // Play/Pause button
        const playPauseBtn = pipWindow.document.createElement("button");
        playPauseBtn.id = "pip-playpause";
        playPauseBtn.textContent = video.paused ? "▶ Play" : "⏸ Pause";
        playPauseBtn.addEventListener("click", () => {
          if (video.paused) {
            video.play();
            playPauseBtn.textContent = "⏸ Pause";
          } else {
            video.pause();
            playPauseBtn.textContent = "▶ Play";
          }
        });

        // Back to tab button (closes PiP)
        const closeBtn = pipWindow.document.createElement("button");
        closeBtn.textContent = "✕ Close";
        closeBtn.addEventListener("click", () => {
          pipWindow.close();
        });

        controlsDiv.appendChild(playPauseBtn);
        controlsDiv.appendChild(closeBtn);
        pipWindow.document.body.appendChild(videoContainer);
        pipWindow.document.body.appendChild(controlsDiv);

        // Save return location and move video to PiP window
        returnContainerRef.current = container;
        videoContainer.appendChild(video);
        setIsPiPActive(true);

        // Handle PiP window close
        pipWindow.addEventListener("pagehide", () => {
          returnVideoToContainer();
        });

        // Also track via unload
        pipWindow.addEventListener("unload", () => {
          returnVideoToContainer();
        });

        return;
      } catch (err) {
        toast.error("Picture-in-Picture failed — falling back to video PiP");
      }
    }

    // Fallback: standard video element PiP
    try {
      await video.requestPictureInPicture();
      setIsPiPActive(true);
    } catch (err) {
      toast.error("Video Picture-in-Picture failed");
    }
  }, [videoRef, containerRef]);

  /** Return video to its original container. */
  const returnVideoToContainer = useCallback(() => {
    const video = videoRef.current;
    if (video && returnContainerRef.current) {
      // Only move back if the video is still in the PiP window
      if (video.parentElement !== returnContainerRef.current) {
        returnContainerRef.current.appendChild(video);
      }
    }
    pipWindowRef.current = null;
    setIsPiPActive(false);
  }, [videoRef]);

  /** Exit Picture-in-Picture mode. */
  const exitPiP = useCallback(async () => {
    if (pipWindowRef.current) {
      pipWindowRef.current.close();
      returnVideoToContainer();
      return;
    }

    // Fallback: standard video PiP exit
    if (document.pictureInPictureElement) {
      try {
        await document.exitPictureInPicture();
        setIsPiPActive(false);
      } catch (err) {
        toast.error("Failed to exit Picture-in-Picture");
      }
    }
  }, [returnVideoToContainer]);

  return {
    isPiPActive,
    isDocumentPiPSupported: isDocumentPiPSupported(),
    enterPiP,
    exitPiP,
  };
}
