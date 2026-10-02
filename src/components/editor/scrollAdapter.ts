/**
 * What linked scroll needs from a pane: its scrolling element and where its
 * headings sit, in that element's scroll coordinates. Each pane builds one;
 * SplitView pairs them up via src/domain/scrollMap.ts.
 */
export type ScrollAdapter = {
  scroller: HTMLElement;
  headingOffsets: () => number[];
};
