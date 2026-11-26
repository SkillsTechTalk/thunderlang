import type { ReactElement } from 'react';
import type { ThunderModel, Thing } from '../model.d.mts';
import type { ReadingLayout, ThingCardLayout, DataCardLayout, ThunderSymbolId } from '../reading-layout.d.mts';

export { readingLayout, thingCard, dataCard, ioBoxes, READING_LABELS } from '../reading-layout.mjs';
export type { ReadingLayout, ThingCardLayout, DataCardLayout, IOBoxesLayout, ThunderSymbolId } from '../reading-layout.d.mts';

/** A Thunder symbol; its color is the CSS variable for its grammar color (--tl-c-*). */
export function ThunderSymbol(props: { id: ThunderSymbolId; size?: number; label?: string }): ReactElement | null;
/** A Thing card. Pass `card` (from thingCard/readingLayout) or `model` and `thing`. onOpen(memberId) makes abilities buttons. */
export function ThingCard(props: { card?: ThingCardLayout; model?: ThunderModel; thing?: Thing; onOpen?: (memberId: string) => void; selected?: boolean; headingLevel?: 2 | 3 | 4 }): ReactElement;
/** A Data card: a record or choices. Pass `card` or `thing`. */
export function DataCard(props: { card?: DataCardLayout; thing?: Thing; headingLevel?: 2 | 3 | 4 }): ReactElement;
/** The Big Picture: every Thing, then records and choices. */
export function BigPicture(props: { model?: ThunderModel; layout?: ReadingLayout; focus?: string | null; onOpen?: (memberId: string) => void; selectedId?: string; headingLevel?: 2 | 3 }): ReactElement;
