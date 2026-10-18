// @vitest-environment jsdom
import { act, createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Linescape, linescapeParentStyle, type LinescapeProps } from "../src/react";
import { designs } from "./designs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no layout, ResizeObserver or IntersectionObserver: stub them so tests control size and visibility.
let layerSize = { width: 1200, height: 700 };
const observers = new Set<() => void>();
class FakeResizeObserver {
  constructor(private readonly cb: () => void) {}
  observe() {
    observers.add(this.cb);
  }
  disconnect() {
    observers.delete(this.cb);
  }
}
const intersections = new Set<(entries: { isIntersecting: boolean }[]) => void>();
class FakeIntersectionObserver {
  constructor(private readonly cb: (entries: { isIntersecting: boolean }[]) => void) {}
  observe() {
    intersections.add(this.cb);
  }
  disconnect() {
    intersections.delete(this.cb);
  }
}

beforeEach(() => {
  layerSize = { width: 1200, height: 700 };
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ width: layerSize.width, height: layerSize.height, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} }) as DOMRect,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  observers.clear();
  intersections.clear();
  document.body.innerHTML = "";
});

function page(props: LinescapeProps) {
  return createElement("main", { style: linescapeParentStyle }, createElement(Linescape, props), createElement("p", null, "content"));
}

async function hydrate(props: LinescapeProps) {
  const container = document.createElement("div");
  container.innerHTML = renderToString(page(props));
  document.body.appendChild(container);
  const errors: unknown[] = [];
  vi.spyOn(console, "error").mockImplementation((...args) => errors.push(args));
  await act(async () => {
    hydrateRoot(container, page(props), { onRecoverableError: (e) => errors.push(e) });
  });
  return { container, errors };
}

const layerOf = (el: Element) => el.querySelector<HTMLElement>("[data-linescape]")!;

describe("<Linescape>", () => {
  it("server-renders at the initial size, hidden until measured", () => {
    const html = renderToString(page({ line: designs.band }));
    expect(html).toContain("<svg");
    expect(html).toContain('width="1440"');
    expect(html).toContain('height="900"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("pointer-events:none");
    expect(html).toContain("opacity:0");
  });

  it("renders nothing inside the layer without lines", () => {
    expect(renderToString(page({}))).not.toContain("<svg");
  });

  it.each(Object.entries(designs))("hydrates %s without warnings", async (_name, line) => {
    const { errors } = await hydrate({ line });
    expect(errors).toEqual([]);
  });

  it.each<LinescapeProps>([
    { lines: [designs.band!, designs.swoosh!], fullBleed: true },
    { line: designs.stripes, attach: "fixed", reveal: "none" },
    { line: { path: { from: "left", to: "right" }, dash: [20, 10], patterns: [{ type: "wave" }], animate: { draw: true, flow: true, undulate: true, trigger: "visible" }, blend: "multiply" } },
  ])("hydrates without warnings (%j)", async (props) => {
    const { errors } = await hydrate(props);
    expect(errors).toEqual([]);
  });

  it("re-lays out at the measured size, then shows the layer", async () => {
    const { container } = await hydrate({ line: designs.band });
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("1200");
    expect(svg.getAttribute("height")).toBe("700");
    expect(layerOf(container).style.opacity).toBe("1");
  });

  it("re-renders when the layer is resized, keeping animation names", async () => {
    const line = { path: { from: "left", to: "right" }, animate: { draw: true } } as const;
    const { container } = await hydrate({ line });
    const before = container.querySelector("mask path")!.getAttribute("class");
    const maskId = container.querySelector("mask")!.id;
    layerSize = { width: 600, height: 400 };
    await act(async () => observers.forEach((cb) => cb()));
    expect(container.querySelector("svg")!.getAttribute("width")).toBe("600");
    expect(container.querySelector("mask path")!.getAttribute("class")).toBe(before);
    expect(container.querySelector("mask")!.id).toBe(maskId);
  });

  it("reveal none shows the layer straight away", () => {
    expect(renderToString(page({ line: designs.band, reveal: "none" }))).not.toContain("opacity:0");
  });

  it("pauses visible-triggered drawing until the layer is seen", async () => {
    const { container } = await hydrate({ line: { path: { from: "left", to: "right" }, animate: { draw: true, trigger: "visible" } } });
    const svg = container.querySelector("svg")!;
    expect(svg.hasAttribute("data-paused")).toBe(true);
    await act(async () => intersections.forEach((cb) => cb([{ isIntersecting: true }])));
    expect(svg.hasAttribute("data-paused")).toBe(false);
  });

  describe("scroll-linked drawing", () => {
    const line = { path: { from: "left", to: "right" }, animate: { draw: true, trigger: "scroll" } } as const;
    const frames: FrameRequestCallback[] = [];
    beforeEach(() => {
      vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
      vi.stubGlobal("cancelAnimationFrame", () => {});
      vi.stubGlobal("innerHeight", 800);
    });

    it("scrubs from the scroll position where CSS scroll timelines aren't supported", async () => {
      vi.stubGlobal("CSS", { supports: () => false });
      layerSize = { width: 1200, height: 2000 };
      const rect = { top: 400 };
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
        () => ({ width: layerSize.width, height: layerSize.height, top: rect.top, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} }) as DOMRect,
      );
      const { container } = await hydrate({ line });
      const layer = layerOf(container);
      expect(container.querySelector("svg")!.hasAttribute("data-scrub")).toBe(true);
      // Top 400px into an 800px window, 2000px tall: (800 - 400) / 2000.
      expect(layer.style.getPropertyValue("--linescape-progress")).toBe("0.2000");
      rect.top = -1200;
      await act(async () => {
        window.dispatchEvent(new Event("scroll"));
        frames.splice(0).forEach((f) => f(0));
      });
      expect(layer.style.getPropertyValue("--linescape-progress")).toBe("1.0000");
    });

    it("leaves it to CSS where scroll timelines are supported", async () => {
      vi.stubGlobal("CSS", { supports: () => true });
      const { container } = await hydrate({ line });
      expect(container.querySelector("svg")!.hasAttribute("data-scrub")).toBe(false);
    });
  });

  it("drops undulation for reduced motion", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), addEventListener() {}, removeEventListener() {} }));
    const { container } = await hydrate({ line: { path: { from: "left", to: "right" }, patterns: [{ type: "wave" }], animate: { undulate: true } } });
    expect(container.querySelector("animate")).toBeNull();
  });

  it("maps attributes and styles to React names", async () => {
    const { container } = await hydrate({ line: { path: { from: "left", to: "right" }, width: 12, cap: "butt", blend: "screen", dash: [4, 2] } });
    const path = container.querySelector("path")!;
    expect(path.getAttribute("stroke-width")).toBe("12");
    expect(path.getAttribute("stroke-linecap")).toBe("butt");
    expect(path.getAttribute("stroke-dasharray")).toBe("4 2");
    expect(container.querySelector<SVGGElement>("g")!.style.mixBlendMode).toBe("screen");
  });

  it("gives ids a per-instance prefix", () => {
    const line = { path: { from: "left", to: "right" }, outline: { width: 4 } } as const;
    const html = renderToString(createElement("div", null, createElement(Linescape, { line }), createElement(Linescape, { line })));
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it("matches toSvg's output", async () => {
    const { toSvg } = await import("../src");
    const { container } = await hydrate({ line: designs.swoosh });
    const ours = container.querySelector("path")!.getAttribute("d");
    expect(toSvg(designs.swoosh!, { width: 1200, height: 700 })).toContain(`d="${ours}"`);
  });

  it("warns in development when the parent is not set up", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const container = document.createElement("div");
    document.body.appendChild(container);
    const { createRoot } = await import("react-dom/client");
    await act(async () => createRoot(container).render(createElement("section", null, createElement(Linescape, { line: designs.band }))));
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]![0])).toContain("linescapeParentStyle");
  });

  it("does not warn when the parent uses linescapeParentStyle", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await hydrate({ line: designs.band });
    expect(warn).not.toHaveBeenCalled();
  });
});
