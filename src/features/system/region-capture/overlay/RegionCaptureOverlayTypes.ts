export type OverlayPhase =
  | "idle"
  | "drawing"
  | "selected"
  | "capturing"
  | "editing"
  | "finalizing";

export type Point = {
  x: number;
  y: number;
};

export type Rect = Point & {
  width: number;
  height: number;
};

export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export type InteractionState =
  | {
      mode: "move";
      pointerId: number;
      offset: Point;
      initial: Rect;
    }
  | {
      mode: "resize";
      pointerId: number;
      handle: ResizeHandle;
      initial: Rect;
    };
