export interface LayoutmasterPiece {
  [key: string]: unknown;
  x: number;
  y: number;
  width: number;
  height: number;
  baselineY?: number;
  lineIndex: number;
  pieceIndex: number;
  kind: "text" | "inline-box" | "inline-image";
  text: string;
  visualText?: string;
  direction?: "ltr" | "rtl" | string;
  lineDirection?: "ltr" | "rtl" | string;
  logicalSegmentIndex?: number;
  visualSegmentIndex?: number;
  fontFamily?: string;
  fontSize?: number;
  letterSpacing?: number;
  fontWeight?: string;
  fontStyle?: string;
  ascent?: number;
  descent?: number;
  color?: string;
  _sourceId?: string;
  _sourceStart?: number;
  _sourceEnd?: number;
}

export interface LayoutmasterLineGuide {
  x: number;
  y: number;
  width: number;
  height: number;
  baselineY: number;
  lineIndex: number;
  direction?: "ltr" | "rtl" | string;
}

export interface LayoutmasterStructuredTextProperties {
  sourceId?: string;
  style?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface LayoutmasterStructuredTextElement {
  type: string;
  content?: string;
  children?: LayoutmasterStructuredTextElement[];
  properties?: LayoutmasterStructuredTextProperties;
  [key: string]: unknown;
}

export interface LayoutmasterStructuredTextContent {
  elements: LayoutmasterStructuredTextElement[];
}

export interface LayoutmasterPerformance {
  layoutMs: number;
  materializeMs: number;
  resolveLinesMs: number;
  buildTokensMs: number;
  wrapStreamMs: number;
  bidiMs: number;
  scriptSplitMs: number;
  wordSegmentMs: number;
  actorMeasurementMs: number;
  actorPlacementMs: number;
  actorOverflowMs: number;
  textMeasurementCacheHits: number;
  textMeasurementCacheMisses: number;
  colliderFieldQueryCalls: number;
  colliderFieldNarrowphaseCalls: number;
}

export interface LayoutmasterMargins {
  top?: number | string;
  right?: number | string;
  bottom?: number | string;
  left?: number | string;
}

export type LayoutmasterExclusionKind = "circle" | "rect" | "ellipse" | "polygon" | "assembly";

export interface LayoutmasterExclusion {
  readonly kind: LayoutmasterExclusionKind;
  readonly input: Readonly<Record<string, unknown>>;
}

export interface LayoutmasterExclusionAssembly extends LayoutmasterExclusion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly parts: {
    readonly count: number;
  };
  toJSON(): object;
  preview(options?: { scale?: number }): HTMLCanvasElement;
}

export interface LayoutmasterCircleExclusionOptions {
  x?: number;
  y?: number;
  radius: number;
  gap?: number;
}

export interface LayoutmasterRectExclusionOptions {
  x?: number;
  y?: number;
  width: number;
  height: number;
  gap?: number;
}

export interface LayoutmasterEllipseExclusionOptions {
  x?: number;
  y?: number;
  width: number;
  height: number;
  gap?: number;
}

export interface LayoutmasterPolygonPoint {
  x: number;
  y: number;
}

export interface LayoutmasterPolygonExclusionOptions {
  x?: number;
  y?: number;
  points: Array<LayoutmasterPolygonPoint | [number, number]>;
  gap?: number;
}

export interface LayoutmasterFromAlphaChannelOptions {
  x?: number;
  y?: number;
  bandHeight?: number;
  tiers?: 1 | 2 | 3 | 4;
  gap?: number;
}

export interface LayoutmasterFromJSONOptions {
  x?: number;
  y?: number;
  gap?: number;
}

export type LayoutmasterAssemblyPartKind = "rect" | "circle" | "ellipse" | "polygon";
export type LayoutmasterAssemblyAuthorPartKind = LayoutmasterAssemblyPartKind | "line" | "capsule";

export interface LayoutmasterAssemblyBasePart {
  kind?: LayoutmasterAssemblyAuthorPartKind;
  shape?: LayoutmasterAssemblyAuthorPartKind;
  x?: number;
  y?: number;
  resistance?: number;
  r?: number;
}

export interface LayoutmasterAssemblyRectPart extends LayoutmasterAssemblyBasePart {
  kind?: "rect";
  shape?: "rect";
  width?: number;
  height?: number;
  w?: number;
  h?: number;
}

export interface LayoutmasterAssemblyCirclePart extends LayoutmasterAssemblyBasePart {
  kind: "circle";
  shape?: "circle";
  radius?: number;
  width?: number;
  height?: number;
  w?: number;
  h?: number;
}

export interface LayoutmasterAssemblyEllipsePart extends LayoutmasterAssemblyBasePart {
  kind: "ellipse";
  shape?: "ellipse";
  width?: number;
  height?: number;
  w?: number;
  h?: number;
}

export interface LayoutmasterAssemblyPolygonPart extends LayoutmasterAssemblyBasePart {
  kind: "polygon";
  shape?: "polygon";
  points: Array<LayoutmasterPolygonPoint | [number, number]>;
}

export interface LayoutmasterAssemblyLinePart extends LayoutmasterAssemblyBasePart {
  kind: "line" | "capsule";
  shape?: "line" | "capsule";
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  length?: number;
  angle?: number;
  degrees?: number;
  thickness?: number;
  strokeWidth?: number;
  width?: number;
  w?: number;
}

export type LayoutmasterAssemblyPart =
  | LayoutmasterAssemblyRectPart
  | LayoutmasterAssemblyCirclePart
  | LayoutmasterAssemblyEllipsePart
  | LayoutmasterAssemblyPolygonPart
  | LayoutmasterAssemblyLinePart;

export interface LayoutmasterAssemblyMember {
  shape?: LayoutmasterAssemblyPartKind;
  kind?: LayoutmasterAssemblyPartKind;
  x: number;
  y: number;
  w?: number;
  h?: number;
  width?: number;
  height?: number;
  path?: string;
  resistance?: number;
  r?: number;
}

export interface LayoutmasterAssemblyLayer {
  r?: number;
  rects: Array<[number, number, number, number]>;
}

export interface LayoutmasterAssemblyOptions {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  gap?: number;
  parts?: LayoutmasterAssemblyPart[];
  members?: LayoutmasterAssemblyMember[];
  layers?: LayoutmasterAssemblyLayer[];
}

export interface LayoutmasterExclusionNamespace {
  circle(options: LayoutmasterCircleExclusionOptions): LayoutmasterExclusion;
  rect(options: LayoutmasterRectExclusionOptions): LayoutmasterExclusion;
  ellipse(options: LayoutmasterEllipseExclusionOptions): LayoutmasterExclusion;
  polygon(options: LayoutmasterPolygonExclusionOptions): LayoutmasterExclusion;
  assembly(options: LayoutmasterAssemblyOptions): LayoutmasterExclusionAssembly;
  fromAlphaChannel(
    alpha: Uint8Array,
    width: number,
    height: number,
    options?: LayoutmasterFromAlphaChannelOptions
  ): LayoutmasterExclusionAssembly;
  fromJSON(data: unknown, options?: LayoutmasterFromJSONOptions): LayoutmasterExclusionAssembly;
}

export interface LayoutmasterRequest {
  width?: number | string;
  height?: number | string;
  format?: "plain";
  fontFamily?: string;
  fontSize?: number | string;
  lineHeight?: number | string;
  lineHeightMode?: "print" | "css" | "browser";
  lineHeightAdjustment?: number | string;
  lang?: string;
  direction?: "auto" | "ltr" | "rtl";
  hyphenation?: "off" | "auto" | "soft";
  margins?: LayoutmasterMargins;
  styles?: Record<string, Record<string, unknown>>;
  exclusions?: LayoutmasterExclusion[];
}

export type LayoutmasterTargetInput = LayoutmasterRequest;
export type LayoutmasterContentInput = string;

export interface LayoutmasterContentSlice {
  text: string;
  length: number;
}

export interface LayoutmasterContentReport {
  consumed: LayoutmasterContentSlice;
  remaining: LayoutmasterContentSlice;
  complete: boolean;
  hyphenated: boolean;
  sourceLength: number;
}

export interface FormResult {
  pieces: LayoutmasterPiece[];
  lines: LayoutmasterLineGuide[];
  height: number;
  performance: LayoutmasterPerformance;
}

export interface FitResult {
  pieces: LayoutmasterPiece[];
  lines: LayoutmasterLineGuide[];
  height: number;
  content: LayoutmasterContentReport;
  performance: LayoutmasterPerformance;
}

export interface FlowPlacement {
  index: number;
  pieces: LayoutmasterPiece[];
  lines: LayoutmasterLineGuide[];
  height: number;
  content: LayoutmasterContentReport;
}

export interface FlowResult {
  placements: FlowPlacement[];
  content: LayoutmasterContentReport;
  performance: LayoutmasterPerformance;
}

export interface PourResult {
  pieces: LayoutmasterPiece[];
  lines: LayoutmasterLineGuide[];
  height: number;
  content: LayoutmasterContentReport;
  performance: LayoutmasterPerformance;
}

export interface ProducePage {
  index: number;
  width: number;
  height: number;
  occupiedHeight: number;
  pieces: LayoutmasterPiece[];
  lines: LayoutmasterLineGuide[];
}

export interface ProduceOptions extends LayoutmasterRequest {}

export interface ProduceResult {
  pages: ProducePage[];
  performance: LayoutmasterPerformance;
}

export interface LayoutmasterFontPreparationEntry {
  cssFont?: string;
  fontFamily?: string;
  family?: string;
  fontSize?: number | string;
  size?: number | string;
  fontWeight?: number | string;
  weight?: number | string;
  fontStyle?: string;
  style?: string;
  text?: string;
}

export interface LayoutmasterFontPreparationResult {
  status: "ready" | "partial" | "failed" | "unsupported";
  requested: Array<{ cssFont: string; text: string }>;
  loaded: Array<{ cssFont: string; text: string }>;
  failed: Array<{ cssFont: string; text: string; error: string }>;
}

export type FormResultHandler = (result: FormResult) => void;
export type FitResultHandler = (result: FitResult) => void;
export type FlowResultHandler = (result: FlowResult) => void;
export type PourResultHandler = (result: PourResult) => void;
export type ProduceResultHandler = (result: ProduceResult) => void;
export type PlannedFormAllResultHandler = (result: FormResult[]) => void;
export type PlannedFitAllResultHandler = (result: FitResult[]) => void;

export interface PlannedLayout {
  readonly size: number;
  form(options?: LayoutmasterTargetInput, handler?: FormResultHandler): FormResult;
  form(handler?: FormResultHandler): FormResult;
  fit(options?: LayoutmasterTargetInput, handler?: FitResultHandler): FitResult;
  fit(handler?: FitResultHandler): FitResult;
  flow(targets?: LayoutmasterTargetInput[], handler?: FlowResultHandler): FlowResult;
  clear(): void;
}

export interface PlannedLayoutCollection {
  readonly items: PlannedLayout[];
  readonly size: number;
  formAll(options?: LayoutmasterTargetInput, handler?: PlannedFormAllResultHandler): FormResult[];
  formAll(handler?: PlannedFormAllResultHandler): FormResult[];
  fitAll(options?: LayoutmasterTargetInput, handler?: PlannedFitAllResultHandler): FitResult[];
  fitAll(handler?: PlannedFitAllResultHandler): FitResult[];
  clear(): void;
}

export declare function form(content?: LayoutmasterContentInput, options?: LayoutmasterTargetInput, handler?: FormResultHandler): FormResult;
export declare function form(content?: LayoutmasterContentInput, handler?: FormResultHandler): FormResult;
export declare function fit(content?: LayoutmasterContentInput, options?: LayoutmasterTargetInput, handler?: FitResultHandler): FitResult;
export declare function fit(content?: LayoutmasterContentInput, handler?: FitResultHandler): FitResult;
export declare function flow(content?: LayoutmasterContentInput, targets?: LayoutmasterTargetInput[], handler?: FlowResultHandler): FlowResult;
export declare function pour(content?: LayoutmasterContentInput, shape?: LayoutmasterExclusion, options?: LayoutmasterTargetInput, handler?: PourResultHandler): PourResult;
export declare function pour(content?: LayoutmasterContentInput, shape?: LayoutmasterExclusion, handler?: PourResultHandler): PourResult;
export declare function plan(content?: LayoutmasterContentInput, options?: LayoutmasterTargetInput): PlannedLayout;
export declare function plan(content: LayoutmasterContentInput[], options?: LayoutmasterTargetInput): PlannedLayoutCollection;
export declare function produce(source: unknown, options?: ProduceOptions, handler?: ProduceResultHandler): ProduceResult;
export declare function produce(source: unknown, handler?: ProduceResultHandler): ProduceResult;
export declare function prepareFonts(
  fonts: string | LayoutmasterFontPreparationEntry | Array<string | LayoutmasterFontPreparationEntry>,
  options?: { text?: string }
): Promise<LayoutmasterFontPreparationResult>;
export declare function prepareLayoutFonts(
  content?: LayoutmasterContentInput,
  options?: LayoutmasterRequest
): Promise<LayoutmasterFontPreparationResult>;
export declare const exclusion: LayoutmasterExclusionNamespace;
export declare function debugBuildHiddenDocument(content?: LayoutmasterContentInput, options?: LayoutmasterRequest, mode?: "form" | "fit"): unknown;
