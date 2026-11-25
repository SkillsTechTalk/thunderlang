export type ShareLevel = "big-picture" | "flow" | "details" | "text" | "original";
export type FileLocation = { owner: string; repo: string; ref: string; path: string };
export declare const SHARE_LEVELS: ShareLevel[];
export declare const LEVEL_NAMES: Record<ShareLevel, string>;
export declare const MAX_FILE_BYTES: number;
export declare const MAX_LINK_LENGTH: number;
export declare function isReadablePath(path: string): boolean;
export declare function parseSharePath(segments: string[] | undefined): { ok: true; value: FileLocation } | { ok: false; reason: string };
export declare function parseShareQuery(query: Record<string, string | string[] | undefined> | URLSearchParams | null | undefined): { fn: string | null; level: ShareLevel };
export declare function buildSharePath(loc: FileLocation & { fn?: string | null; level?: ShareLevel | string | null }): string;
export declare function rawFileUrl(loc: FileLocation): string;
export declare function githubFileUrl(loc: FileLocation, lines?: [number, number] | null): string;
export declare function parseGitHubUrl(input: string): (FileLocation & { lines: [number, number] | null }) | null;
type MemberLike = { id: string; name: string; lines: [number, number] };
export declare function memberRef(member: MemberLike, members?: MemberLike[]): string;
export declare function findMemberByRef<M extends MemberLike>(members: M[], ref: string | null | undefined): M | null;
export declare function encodeCode(code: string): Promise<string>;
export declare function decodeCode(value: string): Promise<string>;
export declare function buildPastedShareUrl(origin: string, opts: { code: string; file?: string | null; fn?: string | null; level?: ShareLevel | string | null }):
  Promise<{ ok: true; url: string; length: number } | { ok: false; reason: "empty" | "too-long"; length: number; limit: number }>;
export declare function parsePastedFragment(hash: string | null | undefined):
  Promise<{ ok: true; value: { code: string; file: string; fn: string | null; level: ShareLevel } } | { ok: false; reason: string } | null>;
