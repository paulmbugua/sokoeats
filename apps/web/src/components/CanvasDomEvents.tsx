// CanvasDomEvents.tsx
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';

type CanvasDomEventsProps = {
  onPointerDown?: (e: PointerEvent) => void;
  onPointerUp?: (e: PointerEvent) => void;
  onPointerMove?: (e: PointerEvent) => void;
  onWheel?: (e: WheelEvent) => void;
  onContextLost?: (e: Event) => void;
  onContextRestored?: (e: Event) => void;
};

/**
 * Attaches DOM listeners to the underlying R3F WebGL canvas (gl.domElement).
 * Use this instead of <Canvas onCreated={...}> for DOM events.
 */
export default function CanvasDomEvents({
  onPointerDown,
  onPointerUp,
  onPointerMove,
  onWheel,
  onContextLost,
  onContextRestored,
}: CanvasDomEventsProps) {
  const { gl } = useThree();

  useEffect(() => {
    const canvas = gl?.domElement as HTMLCanvasElement | undefined;
    if (!canvas) return;

    // Default handlers (optional)
    const handleContextLost =
      onContextLost ??
      ((e: Event) => {
        // Prevent default so the browser doesn't clear the context permanently
        e.preventDefault();
        // eslint-disable-next-line no-console
        console.warn('[three] WebGL context lost');
      });

    const handleContextRestored =
      onContextRestored ??
      (() => {
        // eslint-disable-next-line no-console
        console.info('[three] WebGL context restored');
      });

    // Attach listeners
    if (onPointerDown) canvas.addEventListener('pointerdown', onPointerDown);
    if (onPointerUp) canvas.addEventListener('pointerup', onPointerUp);
    if (onPointerMove) canvas.addEventListener('pointermove', onPointerMove);
    if (onWheel) canvas.addEventListener('wheel', onWheel, { passive: true });

    // WebGL context lifecycle (must be able to call preventDefault on lost)
    canvas.addEventListener('webglcontextlost', handleContextLost as EventListener, {
      passive: false,
    });
    canvas.addEventListener('webglcontextrestored', handleContextRestored as EventListener);

    // Cleanup
    return () => {
      if (onPointerDown) canvas.removeEventListener('pointerdown', onPointerDown);
      if (onPointerUp) canvas.removeEventListener('pointerup', onPointerUp);
      if (onPointerMove) canvas.removeEventListener('pointermove', onPointerMove);
      if (onWheel) canvas.removeEventListener('wheel', onWheel as EventListener);
      canvas.removeEventListener('webglcontextlost', handleContextLost as EventListener);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored as EventListener);
    };
  }, [gl, onPointerDown, onPointerUp, onPointerMove, onWheel, onContextLost, onContextRestored]);

  return null;
}
