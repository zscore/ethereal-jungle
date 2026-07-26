/**
 * knob.js — a rotary dial for the perform rail (D21).
 *
 * Progressive enhancement over an `<input type="range">`: the input stays in
 * the DOM and remains the source of truth, and the knob writes to it and
 * dispatches the same `input` event a drag would. So every existing binding
 * keeps working untouched — ui.js's listeners, the MIDI learn buttons that
 * anchor themselves to the label, the `value` attribute that documents the
 * default. The knob is an affordance, not a second control path.
 *
 * The gesture is a vertical drag, not a circular one: a filter sweep wants a
 * decisive throw, and tracing an arc is a wrist gesture you run out of. Shift
 * drags fine, the wheel nudges, double-click snaps home, arrows work once
 * focused — the input's own keyboard behaviour, kept rather than reinvented.
 */

const NS = 'http://www.w3.org/2000/svg';
const START = -135;      // degrees; 0 is straight up
const SWEEP = 270;       // a knob's worth of travel
const TRAVEL_PX = 170;   // pixels of drag for the full range

const el = (name, attrs) => {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

const polar = (c, r, deg) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [c + r * Math.cos(a), c + r * Math.sin(a)];
};

const arcPath = (c, r, a0, a1) => {
  const [x0, y0] = polar(c, r, a0);
  const [x1, y1] = polar(c, r, a1);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

/**
 * Grow a rotary dial in front of `input`, which it hides and drives.
 * @param onDraw optional callback(value) for a live readout next to the dial
 */
export function makeKnob(input, { size = 46, onDraw } = {}) {
  const min = parseFloat(input.min || 0);
  const max = parseFloat(input.max || 1);
  const step = parseFloat(input.step || 0.01);
  const home = parseFloat(input.defaultValue); // the HTML `value` attribute
  const c = size / 2;
  const r = c - 5;

  const svg = el('svg', {
    width: size, height: size, viewBox: `0 0 ${size} ${size}`,
    class: 'knob', tabindex: '0', role: 'presentation',
  });
  svg.append(
    el('path', { d: arcPath(c, r, START, START + SWEEP), class: 'knob-track' }),
    el('path', { class: 'knob-val' }),
    el('line', { class: 'knob-pin' }),
  );
  const val = svg.querySelector('.knob-val');
  const pin = svg.querySelector('.knob-pin');
  input.parentElement.insertBefore(svg, input);
  input.classList.add('knob-input');

  const draw = () => {
    const v = parseFloat(input.value);
    const angle = START + SWEEP * ((v - min) / (max - min));
    // the filled arc runs from home, so a dial that lives at full travel
    // (the lpf) reads as "backed off by this much", not "filled up to here"
    const homeAngle = START + SWEEP * ((home - min) / (max - min));
    const [a0, a1] = angle < homeAngle ? [angle, homeAngle] : [homeAngle, angle];
    val.setAttribute('d', Math.abs(a1 - a0) < 0.4 ? '' : arcPath(c, r, a0, a1));
    const [px0, py0] = polar(c, r * 0.34, angle);
    const [px1, py1] = polar(c, r * 0.94, angle);
    pin.setAttribute('x1', px0.toFixed(2)); pin.setAttribute('y1', py0.toFixed(2));
    pin.setAttribute('x2', px1.toFixed(2)); pin.setAttribute('y2', py1.toFixed(2));
    onDraw?.(v);
  };

  const set = (next) => {
    const clamped = Math.min(max, Math.max(min, next));
    const snapped = parseFloat((Math.round(clamped / step) * step).toFixed(6));
    if (String(snapped) === input.value) return;
    input.value = String(snapped);
    input.dispatchEvent(new Event('input', { bubbles: true })); // ui.js listens here
  };

  let grabbedAt = 0;
  let grabbedValue = 0;
  svg.addEventListener('pointerdown', (e) => {
    grabbedAt = e.clientY;
    grabbedValue = parseFloat(input.value);
    svg.setPointerCapture(e.pointerId);
    svg.classList.add('turning');
    e.preventDefault();
  });
  svg.addEventListener('pointermove', (e) => {
    if (!svg.hasPointerCapture(e.pointerId)) return;
    const fine = e.shiftKey ? 0.25 : 1;
    set(grabbedValue - ((e.clientY - grabbedAt) / TRAVEL_PX) * (max - min) * fine);
  });
  const release = (e) => {
    if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
    svg.classList.remove('turning');
  };
  svg.addEventListener('pointerup', release);
  svg.addEventListener('pointercancel', release);
  svg.addEventListener('dblclick', () => set(home));
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    set(parseFloat(input.value) - Math.sign(e.deltaY) * step * 4);
  }, { passive: false });
  svg.addEventListener('keydown', (e) => {
    const dir = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
    if (dir === undefined) return;
    e.preventDefault();
    set(parseFloat(input.value) + dir * step * (e.shiftKey ? 1 : 10));
  });

  // redraw for writes from anywhere — a drag, a dblclick, or code
  input.addEventListener('input', draw);
  draw();
  return { draw };
}
