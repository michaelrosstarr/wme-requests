// Ambient types for browser APIs newer than what TypeScript's bundled lib.dom.d.ts
// ships. Both are part of the Element Capture proposal
// (https://github.com/w3c/mediacapture-region), which only Chrome ships as of
// writing — captureViewportScreenshot() in main.user.ts feature-detects both and
// falls back to cropping a whole-tab capture where they're missing.

declare class RestrictionTarget {
  static fromElement(element: Element): Promise<RestrictionTarget>;
}

interface MediaStreamTrack {
  restrictTo?(target: RestrictionTarget): Promise<void>;
}

// lib.dom.d.ts's ImageCapture is missing grabFrame() (it's in the spec, just not
// yet in TypeScript's bundled types).
interface ImageCapture {
  grabFrame(): Promise<ImageBitmap>;
}

// Non-standard geometry estimateViewportInFrame() in main.user.ts uses where present:
// mozInnerScreenX/Y (Firefox) is the content area's position on screen, and
// screen.left/top (Firefox) / availLeft/availTop (Chrome, Safari) locate the monitor.
interface Window {
  readonly mozInnerScreenX?: number;
  readonly mozInnerScreenY?: number;
}

interface Screen {
  readonly left?: number;
  readonly top?: number;
  readonly availLeft?: number;
  readonly availTop?: number;
}
