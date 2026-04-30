import { imageToExclusion } from "./image-to-exclusion.js";
import {
  renderPiece,
  renderPieceChrome
} from "./pieces-to-html.js";
import { extractDanceFramesFromVideoFile } from "./video-to-dance-frames.js";

// Simple helper namespace for demos and copy-paste users.
// Methods keep their action names, matching the leaf module exports.
// The leaf modules remain importable directly when an app only needs one tool.

export const helpers = {
  imageToExclusion,
  renderPiece,
  renderPieceChrome,
  extractDanceFramesFromVideoFile
};
