// The pointer handlers that make a part of a device window act as a drag handle.
export interface DragProps {
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onLostPointerCapture: () => void;
  /** Stops the browser starting a text selection or a native drag from the press (which would cancel our drag). */
  onMouseDown: (e: MouseEvent) => void;
  onDragStart: (e: DragEvent) => void;
}
