"use client";

import { createElement, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { render, type Line, type LineInput, type SvgNode } from "linescape";

// Everything in the core is also available from "linescape/react", including linescapeParentStyle
// (though server components should import that from "linescape"; see src/parent.ts).
export * from "linescape";

export interface LinescapeProps {
  /** One line. */
  line?: LineInput | Line;
  /** Several lines, drawn in order in one <svg>. */
  lines?: readonly (LineInput | Line)[];
  /**
   * "scroll" (default): the layer covers its parent and scrolls with the page.
   * "fixed": the layer is pinned to the viewport.
   */
  attach?: "scroll" | "fixed";
  /** Break out of the parent's width to the full viewport width (the parent's height is kept). */
  fullBleed?: boolean;
  /** Clip lines to the layer (default). false lets them spill past it. */
  clip?: boolean;
  /** Size rendered on the server and before the layer is measured. Default 1440 × 900. */
  initialSize?: { width: number; height: number };
  /**
   * "fade" (default): hidden until measured, then faded in, so lines never jump.
   * "none": shown straight away at `initialSize`, then re-laid out once measured.
   */
  reveal?: "fade" | "none";
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_INITIAL_SIZE = { width: 1440, height: 900 };

interface Size {
  width: number;
  height: number;
}

/**
 * A decorative layer of lines behind its parent's content.
 *
 * Place it inside the element it should sit behind; give that element
 * `linescapeParentStyle` (position: relative; isolation: isolate).
 */
export function Linescape({
  line,
  lines,
  attach = "scroll",
  fullBleed = false,
  clip = true,
  initialSize = DEFAULT_INITIAL_SIZE,
  reveal = "fade",
  className,
  style,
}: LinescapeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const idPrefix = "linescape" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  // Unmeasured until mount, so server and first client render match exactly.
  const [measured, setMeasured] = useState<Size | null>(null);
  const [bleedWidth, setBleedWidth] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);
  const [motion, setMotion] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const next = { width: Math.round(rect.width), height: Math.round(rect.height) };
      if (next.width === 0 || next.height === 0) return;
      setMeasured((prev) => (prev && prev.width === next.width && prev.height === next.height ? prev : next));
      // 100vw includes the vertical scrollbar; the document's client width does not.
      if (fullBleed) setBleedWidth(document.documentElement.clientWidth);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (fullBleed) observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, [fullBleed]);

  useEffect(() => {
    if (typeof matchMedia === "undefined") return;
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMotion(!query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (isDev() && attach === "scroll") warnAboutParent(ref.current);
  }, [attach]);

  // overflow: clip is dropped where it isn't supported (Safari before 16), leaving nothing clipped.
  // hidden is fine there: those browsers have no scroll timelines for it to get in the way of.
  useEffect(() => {
    const el = ref.current;
    if (el && clip && typeof CSS !== "undefined" && typeof CSS.supports === "function" && !CSS.supports("overflow", "clip")) el.style.overflow = "hidden";
  }, [clip]);

  // Lines are plain data, so a serialized key keeps inline objects from re-rendering every time.
  const list = lines ?? (line ? [line] : []);
  const linesKey = JSON.stringify(list);
  const size = measured ?? initialSize;
  const layer = useMemo(
    () => (list.length > 0 ? render(list, { width: size.width, height: size.height, idPrefix, motion }) : null),
    [linesKey, size.width, size.height, idPrefix, motion], // linesKey stands in for list
  );

  // Scroll-linked drawing is CSS where scroll-driven animations are supported. Elsewhere, scrub the
  // animation from here: progress runs 0 → 1 from the layer's top entering the bottom of its scroll
  // container to its bottom reaching it (or its top reaching the top, if it's shorter), the same range
  // as the CSS version. Set after mount, so server and first client render match.
  const [scrub, setScrub] = useState(false);
  const follows = (layer?.followsScroll ?? false) && motion;
  useEffect(() => {
    const el = ref.current;
    // Checked here too: on mount, `motion` is still its initial true until the effect above re-renders.
    if (!follows || !el || supportsScrollTimeline() || prefersReducedMotion()) {
      setScrub(false);
      return;
    }
    setScrub(true);
    const port = scrollContainer(el);
    let frame = 0;
    let written = "";
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      // The scrollport, without scrollbars: what the CSS view timeline measures against.
      const top = port ? port.getBoundingClientRect().top + port.clientTop : 0;
      const height = port ? port.clientHeight : document.documentElement.clientHeight;
      const span = Math.max(rect.height, height);
      if (!(span > 0)) return;
      const value = Math.min(1, Math.max(0, (height - (rect.top - top)) / span)).toFixed(4);
      if (value === written) return;
      written = value;
      el.style.setProperty("--linescape-progress", value);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    // Capture: scroll events from elements don't bubble, and the layer may be in a scrolling panel.
    document.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    // Layout can move the layer without a scroll: images loading above it, the page growing.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(el);
    observer?.observe(document.body);
    return () => {
      document.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [follows]);

  const waits = layer?.waitsForVisibility ?? false;
  useEffect(() => {
    const el = ref.current;
    if (!waits || !el || visible) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    // 15% of the layer, or for a layer much taller than the window (which can never be 15% on screen),
    // enough of it to fill 15% of the window.
    const tall = el.getBoundingClientRect().height;
    const threshold = tall > 0 ? Math.min(0.15, (0.15 * window.innerHeight) / tall) : 0.15;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { threshold });
    observer.observe(el);
    return () => observer.disconnect();
  }, [waits, visible, size.height]);

  const hidden = reveal === "fade" && measured === null;
  const layerStyle: CSSProperties = {
    position: attach === "fixed" ? "fixed" : "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    // clip, not hidden: hidden makes the layer a scroll container, and the svg's view timeline would
    // track the layer (which never scrolls) instead of the page.
    overflow: clip ? "clip" : "visible",
    zIndex: -1,
    pointerEvents: "none",
    ...(reveal === "fade" ? { opacity: hidden ? 0 : 1, transition: "opacity 150ms ease-out" } : {}),
    ...(fullBleed && attach === "scroll"
      ? { left: "50%", right: "auto", width: bleedWidth ?? "100vw", transform: "translateX(-50%)" }
      : {}),
    ...style,
  };

  return (
    <div ref={ref} aria-hidden="true" className={className} style={layerStyle} data-linescape="">
      {layer && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={layer.width}
          height={layer.height}
          viewBox={`0 0 ${layer.width} ${layer.height}`}
          className={layer.className}
          focusable="false"
          data-paused={waits && !visible ? "" : undefined}
          data-scrub={scrub ? "" : undefined}
          style={{ position: "absolute", top: 0, left: 0, display: "block", overflow: "visible" }}
        >
          {layer.children.map(toElement)}
        </svg>
      )}
    </div>
  );
}

function supportsScrollTimeline(): boolean {
  return typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("animation-timeline: view()");
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The nearest scroll container around the layer `el`, or null for the viewport. Not the layer itself: its
 * overflow is ours, and it's hidden only where there are no scroll timelines (so nothing to match).
 */
function scrollContainer(el: HTMLElement): HTMLElement | null {
  for (let n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    if (/^(auto|scroll|hidden|overlay)$/.test(getComputedStyle(n).overflowY)) return n;
  }
  return null;
}

/** "stroke-width" → "strokeWidth": React's names for SVG attributes and style properties. */
const camel = (name: string) => name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

function styleObject(css: string): CSSProperties {
  const out: Record<string, string> = {};
  for (const decl of css.split(";")) {
    const i = decl.indexOf(":");
    if (i > 0) out[camel(decl.slice(0, i).trim())] = decl.slice(i + 1).trim();
  }
  return out as CSSProperties;
}

function toElement(n: SvgNode | string, key: number): ReactNode {
  if (typeof n === "string") return n;
  const props: Record<string, unknown> = { key };
  for (const [name, value] of Object.entries(n.attrs)) {
    if (name === "class") props.className = value;
    else if (name === "style") props.style = styleObject(value);
    else props[camel(name)] = value;
  }
  // <style> holds one text child; everything else maps child by child.
  if (n.tag === "style") return createElement("style", props, n.children.join(""));
  return createElement(n.tag, props, ...n.children.map(toElement));
}

function isDev(): boolean {
  // Bundlers replace process.env.NODE_ENV; guard for environments without `process`.
  return typeof process !== "undefined" && process.env?.NODE_ENV !== "production";
}

const warned = new WeakSet<Element>();

function warnAboutParent(el: HTMLElement | null) {
  const parent = el?.parentElement;
  if (!parent || warned.has(parent)) return;
  const cs = getComputedStyle(parent);
  const problems: string[] = [];
  if (cs.position === "static") problems.push("is not positioned (the layer will cover the wrong element)");
  const stacking = cs.isolation === "isolate" || (cs.position !== "static" && cs.zIndex !== "auto");
  if (!stacking) problems.push("has no stacking context (the layer can disappear behind backgrounds)");
  if (problems.length === 0) return;
  warned.add(parent);
  console.warn(
    `linescape: the parent of <Linescape> ${problems.join(" and ")}. Give it linescapeParentStyle ` +
      `({ position: "relative", isolation: "isolate" }).`,
    parent,
  );
}
