import { clamp } from './flight.js';

// Each control owns its pointer independently so concurrent fingers never
// overwrite each other. Pointer capture keeps drags working outside the rail.
export function bindPointerControl(element, handlers) {
  let pointerId = null;
  const end = (event) => {
    if (pointerId === null || (event && event.pointerId !== pointerId)) return;
    const oldId = pointerId;
    pointerId = null;
    if (element.hasPointerCapture?.(oldId)) element.releasePointerCapture(oldId);
    handlers.end?.(event);
  };
  element.addEventListener('pointerdown', event => {
    if (pointerId !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (handlers.canStart && !handlers.canStart(event)) return;
    event.preventDefault();
    pointerId = event.pointerId;
    element.setPointerCapture?.(pointerId);
    handlers.start?.(event);
  });
  element.addEventListener('pointermove', event => {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();
    handlers.move?.(event);
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    element.addEventListener(name, end);
  }
  return { cancel: () => end(null), active: () => pointerId !== null };
}

// Full power at the top, idle at the bottom. End padding matches the visual rail.
export function leverValue(clientY, rect, padding=13) {
  const top=rect.top+padding, bottom=rect.bottom-padding;
  const fraction=clamp((bottom-clientY)/Math.max(1,bottom-top),0,1);
  return Math.round(25+75*fraction);
}
