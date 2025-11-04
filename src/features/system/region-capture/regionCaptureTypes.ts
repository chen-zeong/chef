export type CaptureSuccessPayload = {
  path: string;
  base64: string;
  width: number;
  height: number;
  logical_width: number;
  logical_height: number;
  created_at: number;
};

export type OverlayMetadata = {
  originX: number;
  originY: number;
  width: number;
  height: number;
  scaleFactor: number;
  logicalOriginX: number;
  logicalOriginY: number;
  logicalWidth: number;
  logicalHeight: number;
};
