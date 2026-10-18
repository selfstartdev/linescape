/**
 * Styles the parent of a scroll-attached <Linescape> needs: a positioning context
 * and its own stacking context.
 *
 * Lives in the core (no "use client") so React Server Components get the real
 * object; imported from a client module, a server component would only get a
 * reference and the styles would silently drop out.
 */
export const linescapeParentStyle = { position: "relative", isolation: "isolate" } as const;
