import type { TextDelegate, TextDelegateState } from './text-types';

export interface EngineRuntime {
    textDelegate: TextDelegate;
    textDelegateState: TextDelegateState;
    fontCache: Record<string, unknown>;
    bufferCache: Record<string, ArrayBuffer>;
    loadingPromises: Record<string, Promise<unknown>>;
    measurementCache: Map<string, {
        width: number;
        glyphs: { char: string; x: number; y: number }[];
        shapedGlyphs?: import('./types').ShapedGlyph[];
        ascent: number;
        descent: number;
    }>;
}

export type EngineRuntimeOptions =
    {
        textDelegate: TextDelegate;
    };
