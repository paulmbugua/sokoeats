/* eslint-disable no-console */
import axios from 'axios';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'isomorphic-dompurify';
import slugify from 'slugify';
import * as fs from 'fs';
import * as path from 'path';

const LICENSE_NAME = 'CC BY 4.0';
const LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function absoluteUrl(base: string, href?: string | null) {
  if (!href) return href ?? undefined;
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

async function fetchOpenStaxSection(sectionUrl: string) {
  const { data: html } = await axios.get(sectionUrl, {
    headers: {
      'User-Agent': 'DayBreak TutorApp Ingest/1.0',
      Accept: 'text/html,application/xhtml+xml',
    },
    timeout: 30000,
  });

  const $ = cheerio.load(html);
  const pageTitle =
    $('main h1').first().text().trim() || $('title').first().text().trim() || 'OpenStax Section';

  const $main = $('main').clone();

  // remove site chrome
  $main.find("header, footer, nav, script, style, link[rel='preload']").remove();

  // absolutize links & images
  $main.find('[href]').each((_i, el) => {
    const $el = $(el);
    $el.attr('href', absoluteUrl(sectionUrl, $el.attr('href')));
  });
  $main.find('img').each((_i, el) => {
    const $el = $(el);
    $el.attr('src', absoluteUrl(sectionUrl, $el.attr('src')));
  });

  // sanitize (fix WindowLike typing via cast)
  const { window } = new JSDOM('<!doctype html><html><body></body></html>');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const DOMPurify = (createDOMPurify as any)(window as any);
  const cleanedHtml = DOMPurify.sanitize($main.html() || '', {
    USE_PROFILES: { html: true },
  }) as string;

  // to Markdown (teleprompter-friendly)
  const td = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
  });
  const markdown = td.turndown(cleanedHtml);

  return {
    title: pageTitle,
    html: cleanedHtml,
    markdown,
    license: LICENSE_NAME,
    license_url: LICENSE_URL,
    source: 'OpenStax',
    source_url: sectionUrl,
    attribution_html:
      `Content © OpenStax, licensed under ` +
      `<a href="${LICENSE_URL}">${LICENSE_NAME}</a>. ` +
      `Source: <a href="${sectionUrl}">${sectionUrl}</a>.`,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const outFlagIdx = args.indexOf('--out');
  let outDir = './content/algebra-essentials/scripts';
  if (outFlagIdx >= 0 && args[outFlagIdx + 1]) {
    outDir = args[outFlagIdx + 1];
    args.splice(outFlagIdx, 2);
  }
  const urls = args.filter((a) => /^https?:\/\//i.test(a));
  if (!urls.length) {
    console.error('Usage: yarn ingest:openstax --out <dir> <sectionUrl> [moreUrls...]');
    process.exit(1);
  }

  ensureDir(outDir);

  for (const url of urls) {
    console.log('Fetching:', url);
    const data = await fetchOpenStaxSection(url);
    const slug =
      slugify(data.title, { lower: true, strict: true }).slice(0, 80) || 'openstax-section';
    const base = path.join(outDir, slug);
    ensureDir(base);

    fs.writeFileSync(path.join(base, 'section.html'), data.html, 'utf8');
    fs.writeFileSync(path.join(base, 'section.md'), data.markdown, 'utf8');
    fs.writeFileSync(
      path.join(base, 'metadata.json'),
      JSON.stringify(
        {
          title: data.title,
          source: data.source,
          source_url: data.source_url,
          license: data.license,
          license_url: data.license_url,
          attribution_html: data.attribution_html,
          ingested_at: new Date().toISOString(),
        },
        null,
        2
      ),
      'utf8'
    );
    console.log('Saved:', base);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
