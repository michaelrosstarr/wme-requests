// Ambient types for browser APIs newer than what TypeScript's bundled lib.dom.d.ts
// ships. Both are part of the Element Capture proposal
// (https://github.com/w3c/mediacapture-region) and are Chrome-only as of writing —
// see screenshotCaptureSupported() in main.user.ts, which feature-detects both
// before any of this is used.

declare class RestrictionTarget {
  static fromElement(element: Element): Promise<RestrictionTarget>;
}

interface MediaStreamTrack {
  restrictTo(target: RestrictionTarget): Promise<void>;
}

// lib.dom.d.ts's ImageCapture is missing grabFrame() (it's in the spec, just not
// yet in TypeScript's bundled types).
interface ImageCapture {
  grabFrame(): Promise<ImageBitmap>;
}
