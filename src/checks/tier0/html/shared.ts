// Shared, per-run parse+cache of the served HTML <head> (IMPLEMENTATION_PLAN
// §B.2: one shared helper per category; checks read, they do not re-parse).

import { type HTMLElement, parse } from 'node-html-parser';
import type { InputSource } from '../../../loaders/input.js';

export interface LinkTag {
  rel: string;
  href?: string;
  sizes?: string;
  type?: string;
  media?: string;
}

export interface MetaTag {
  name?: string;
  content?: string;
  charset?: string;
  httpEquiv?: string;
}

export interface ScriptTag {
  src?: string;
  async: boolean;
  defer: boolean;
  module: boolean;
  inHead: boolean;
}

export interface ImgTag {
  src?: string;
  loading?: string;
}

export interface HeadInfo {
  /** True if entry HTML was found and parsed. */
  found: boolean;
  raw: string;
  links: LinkTag[];
  metas: MetaTag[];
  title?: string;
  /** All <script src> hrefs (order preserved). */
  scripts: string[];
  /** All <script> tags with attributes and position. */
  scriptTags: ScriptTag[];
  /** All <link rel="stylesheet"> hrefs. */
  stylesheets: string[];
  /** All <img> src values. */
  images: string[];
  /** All <img> tags with attributes. */
  imgTags: ImgTag[];
}

const cache = new WeakMap<InputSource, Promise<HeadInfo>>();

export function parseHead(ctx: { input: InputSource }): Promise<HeadInfo> {
  const cached = cache.get(ctx.input);
  if (cached) return cached;
  const p = doParse(ctx.input);
  cache.set(ctx.input, p);
  return p;
}

async function doParse(input: InputSource): Promise<HeadInfo> {
  const asset = await input.entryHtml();
  if (!asset) {
    return {
      found: false,
      raw: '',
      links: [],
      metas: [],
      scripts: [],
      scriptTags: [],
      stylesheets: [],
      images: [],
      imgTags: [],
    };
  }
  const raw = asset.bytes.toString('utf8');
  const root = parse(raw, { comment: false });
  const headEl = root.querySelector('head');
  const headHtml = headEl?.innerHTML ?? '';

  const links: LinkTag[] = root.querySelectorAll('link').map((el) => ({
    rel: (el.getAttribute('rel') ?? '').toLowerCase(),
    href: el.getAttribute('href') ?? undefined,
    sizes: el.getAttribute('sizes') ?? undefined,
    type: el.getAttribute('type') ?? undefined,
    media: el.getAttribute('media') ?? undefined,
  }));

  const metas: MetaTag[] = root.querySelectorAll('meta').map((el) => ({
    name: (el.getAttribute('name') ?? undefined)?.toLowerCase(),
    content: el.getAttribute('content') ?? undefined,
    charset: el.getAttribute('charset') ?? undefined,
    httpEquiv: (el.getAttribute('http-equiv') ?? undefined)?.toLowerCase(),
  }));

  const titleEl: HTMLElement | null = root.querySelector('title');
  const title = titleEl?.text?.trim() || undefined;

  const scriptEls = root.querySelectorAll('script');
  const scriptTags: ScriptTag[] = scriptEls.map((el) => {
    const src = el.getAttribute('src') ?? undefined;
    return {
      src,
      async: el.hasAttribute('async'),
      defer: el.hasAttribute('defer'),
      module: (el.getAttribute('type') ?? '') === 'module',
      inHead: src ? headHtml.includes(src) : false,
    };
  });
  const scripts = scriptTags.map((s) => s.src).filter((s): s is string => !!s);
  const stylesheets = links
    .filter((l) => l.rel === 'stylesheet' && l.href)
    .map((l) => l.href as string);
  const imgEls = root.querySelectorAll('img');
  const imgTags: ImgTag[] = imgEls.map((el) => ({
    src: el.getAttribute('src') ?? undefined,
    loading: el.getAttribute('loading') ?? undefined,
  }));
  const images = imgTags.map((i) => i.src).filter((s): s is string => !!s);

  return {
    found: true,
    raw,
    links,
    metas,
    title,
    scripts,
    scriptTags,
    stylesheets,
    images,
    imgTags,
  };
}

/** First link matching rel (browser uses the first; SPEC anti-double-count). */
export function firstLinkByRel(head: HeadInfo, rel: string): LinkTag | undefined {
  return head.links.find((l) => l.rel.split(/\s+/).includes(rel));
}

export function metaByName(head: HeadInfo, name: string): MetaTag | undefined {
  return head.metas.find((m) => m.name === name.toLowerCase());
}

export function hasCharset(head: HeadInfo): boolean {
  return head.metas.some(
    (m) =>
      m.charset?.toLowerCase().includes('utf-8') ||
      (m.httpEquiv === 'content-type' && (m.content ?? '').toLowerCase().includes('utf-8')),
  );
}
