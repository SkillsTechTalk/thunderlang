import type { ReactElement, ReactNode } from 'react';
import type { ThunderModel, Thing, Member } from '../model.d.mts';
import type { ReadingLayout, ThingCardLayout, DataCardLayout, IOBoxesLayout, MemberEntryLayout, DetailsLayout, ThunderSymbolId } from '../reading-layout.d.mts';

export { readingLayout, thingCard, dataCard, ioBoxes, detailsLayout, flowEdgeLabel, READING_LABELS } from '../reading-layout.mjs';
export type { ReadingLayout, ThingCardLayout, DataCardLayout, IOBoxesLayout, DetailsLayout, When, ThunderSymbolId } from '../reading-layout.d.mts';

/** A Thunder symbol; its color is the CSS variable for its grammar color (--tl-c-*). */
export function ThunderSymbol(props: { id: ThunderSymbolId; size?: number; label?: string }): ReactElement | null;
/** A Thing card. Pass `card` (from thingCard/readingLayout) or `model` and `thing`. onOpen(memberId) makes abilities buttons. */
export function ThingCard(props: { card?: ThingCardLayout; model?: ThunderModel; thing?: Thing; onOpen?: (memberId: string) => void; selected?: boolean; headingLevel?: 2 | 3 | 4 }): ReactElement;
/** A Data card: a record or choices. Pass `card` or `thing`. */
export function DataCard(props: { card?: DataCardLayout; thing?: Thing; headingLevel?: 2 | 3 | 4 }): ReactElement;
/** You give it / You get back / It can stop with, and "Part of <Thing>". Pass `card` or `model` and `member`. */
export function IOBoxes(props: { card?: IOBoxesLayout; model?: ThunderModel; member?: Member; onLine?: (line: number) => void; onThing?: (thingId: string) => void; headingLevel?: 2 | 3 | 4; children?: ReactNode }): ReactElement;
/** The Big Picture, zoomed by focus: Things then Data, or an action's or rule's IO boxes (children go under them). */
export function BigPicture(props: { model?: ThunderModel; layout?: ReadingLayout; focus?: string | null; onOpen?: (memberId: string) => void; onLine?: (line: number) => void; onThing?: (thingId: string) => void; selectedId?: string; headingLevel?: 2 | 3; children?: ReactNode }): ReactElement;
export interface FlowGraph {
  nodes: { id: string; kind: string; text: string; lane: number; row: number; line?: number | null; does?: string; uses?: string; code?: boolean }[];
  edges: { from: string; to: string; label?: string | null; text?: string }[];
}
/** Flow: every step at the compiler's lane and row, with its edges. */
export function Flow(props: { flow: FlowGraph; onLine?: (line: number) => void; onUse?: (memberId: string) => void; useLabel?: (memberId: string) => string | undefined; marks?: Set<string>; markAs?: 'added' | 'removed' }): ReactElement;
/** Details: the same action sorted into facts, each with its line. Pass `view` (readLevel details) or `layout`. */
export function Details(props: { view?: Record<string, any>; layout?: DetailsLayout; onLine?: (line: number) => void; rules?: ReactNode; headingLevel?: 2 | 3 | 4 }): ReactElement;
