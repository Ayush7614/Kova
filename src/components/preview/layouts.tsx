import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Slide, SlideElement } from '../../engine/types';
import { autoSplitElements, groupProgressRuns } from '../../engine/layout/elementGrouping';
import { useT } from '../../i18n';
import { SlideCtx } from './slideContext';
import { Elements, CodeBlock, MermaidDiagram, YoutubeEmbed, VideoEmbed, PollEmbed, MathBlock } from './elements';

// Scales content down to fit its container when it overflows.
// Measures scrollHeight vs clientHeight after every render and on resize,
// then applies a CSS transform to the inner wrapper — no visual flash because
// the measurement and style update both happen inside useLayoutEffect (before paint).
export function OverflowPane({ className, elements }: { className: string; elements: SlideElement[] }) {
  const t = useT();
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const { isThumbnail, hideOverflowBadge } = useContext(SlideCtx);
  const fitScaleRef = useRef(1);
  const [fitScale, setFitScale] = useState(1);

  const lastRef = useRef({ c: -1, a: -1 });

  const remeasure = useCallback(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    // Measure unscaled, then bail if nothing changed since last time. The bail is
    // what makes this loop-proof: once dimensions settle, no setState fires, so the
    // ResizeObserver → setState → re-render cycle terminates.
    inner.style.transform = '';
    const contentH = inner.scrollHeight;
    const availH = outer.clientHeight;
    if (contentH === lastRef.current.c && availH === lastRef.current.a) {
      inner.style.transform = fitScaleRef.current < 1 ? `scale(${fitScaleRef.current})` : '';
      return;
    }
    lastRef.current = { c: contentH, a: availH };
    const s = contentH > availH + 2 && availH > 0
      ? Math.max(0.4, availH / contentH)
      : 1;
    inner.style.transform = s < 1 ? `scale(${s})` : '';
    if (Math.abs(s - fitScaleRef.current) > 0.005) {
      fitScaleRef.current = s;
      setFitScale(s);
    }
  }, []);

  // ResizeObserver fires once on observe() (covers mount), then on real box-size
  // changes: `outer` for available height, `inner` for content growth. The callback
  // is rAF-debounced — deferring the measure out of the observer's synchronous
  // delivery is the standard guard against the "ResizeObserver loop" that otherwise
  // surfaces as React's "Maximum update depth exceeded". Combined with the
  // unchanged-dimensions bail in remeasure, re-entry is impossible.
  useEffect(() => {
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(remeasure);
    });
    if (outerRef.current) ro.observe(outerRef.current);
    if (innerRef.current) ro.observe(innerRef.current);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [remeasure]);

  // When the element list changes (new slide, hidden toggle, etc.) the content
  // height may be identical to the previous slide so the ResizeObserver won't
  // fire. Reset the bail-out bookmark and force a remeasure synchronously
  // before paint so the scale is always correct on first frame.
  useLayoutEffect(() => {
    lastRef.current = { c: -1, a: -1 };
    remeasure();
  }, [elements, remeasure]);

  return (
    <div ref={outerRef} className={className}>
      <div ref={innerRef} style={{ transformOrigin: 'top left' }}>
        <Elements elements={elements} />
      </div>
      {fitScale < 0.99 && !isThumbnail && !hideOverflowBadge && <div className="sl-overflow-badge">{t('preview.rescaledToFit')}</div>}
    </div>
  );
}

// ── Layout dispatcher ─────────────────────────────────────────────────────────

// Each layout must fill its parent (.sl-content-area) which is a flex child
export function SlideLayout({ slide }: { slide: Slide }) {
  switch (slide.layout) {
    case 'title':         return <TitleLayout slide={slide} />;
    case 'section':       return <SectionLayout slide={slide} />;
    case 'title-content': return <TitleContentLayout slide={slide} />;
    case 'title-image':   return <TitleImageLayout slide={slide} />;
    case 'split':         return <SplitLayout slide={slide} />;
    case 'full-bleed':    return <FullBleedLayout slide={slide} />;
    case 'quote':         return <QuoteLayout slide={slide} />;
    case 'two-column':    return <TwoColumnLayout slide={slide} />;
    case 'bsp':           return <BspLayout slide={slide} />;
    case 'grid':          return <GridLayout slide={slide} />;
    case 'media':         return <MediaLayout slide={slide} />;
    case 'code':          return <CodeLayout slide={slide} />;
    case 'math':          return <MathLayout slide={slide} />;
    case 'blank':         return <BlankLayout />;
    default:              return <TitleContentLayout slide={slide} />;
  }
}

// ── Layout components ─────────────────────────────────────────────────────────

function TitleLayout({ slide }: { slide: Slide }) {
  const subtitles = slide.elements.filter((e): e is Extract<SlideElement, { type: 'paragraph' }> => e.type === 'paragraph');
  const rest = slide.elements.filter((e) => e.type !== 'paragraph');
  return (
    <div className="sl-title">
      <div className="sl-title__text">{slide.title}</div>
      {subtitles.length > 0 && (
        <div className="sl-title__subtitles">
          {subtitles.map((el, i) => (
            <p key={i} className="sl-title__subtitle" dangerouslySetInnerHTML={{ __html: el.html }} />
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <div className="sl-title__body">
          <Elements elements={rest} />
        </div>
      )}
    </div>
  );
}

function SectionLayout({ slide }: { slide: Slide }) {
  return (
    <div className="sl-section">
      <div className="sl-section__text">{slide.title}</div>
    </div>
  );
}

function TitleContentLayout({ slide }: { slide: Slide }) {
  return (
    <div className="sl-title-content">
      {slide.title && <div className="sl-heading">{slide.title}</div>}
      <OverflowPane className="sl-body" elements={slide.elements} />
    </div>
  );
}

function TitleImageLayout({ slide }: { slide: Slide }) {
  const img = slide.elements.find((e) => e.type === 'image');
  return (
    <div className="sl-title-image">
      <div className="sl-heading">{slide.title}</div>
      <div className="sl-ti-img">
        {img && img.type === 'image' && (
          <img src={img.src} alt={img.alt} className="sl-img-fill" />
        )}
      </div>
    </div>
  );
}

function SplitLayout({ slide }: { slide: Slide }) {
  const imgIdx = slide.elements.findIndex((e) => e.type === 'image');
  const img = imgIdx >= 0 ? slide.elements[imgIdx] : undefined;
  const rest = slide.elements.filter((e) => e.type !== 'image');
  // Put the image on the right when it appears after text in the source.
  const imgOnRight = imgIdx > 0;

  const textCol = <OverflowPane className="sl-split__right" elements={rest} />;
  const imgCol = (
    <div className="sl-split__left">
      {img && img.type === 'image' && (
        <img src={img.src} alt={img.alt} className="sl-img-fill" />
      )}
    </div>
  );

  return (
    <div className="sl-split">
      {slide.title && <div className="sl-heading sl-split__title">{slide.title}</div>}
      <div className="sl-split__body">
        {imgOnRight ? <>{textCol}{imgCol}</> : <>{imgCol}{textCol}</>}
      </div>
    </div>
  );
}

function FullBleedLayout({ slide }: { slide: Slide }) {
  const img = slide.elements.find((e) => e.type === 'image');
  return (
    <div className="sl-full-bleed">
      {img && img.type === 'image' && (
        <img src={img.src} alt={img.alt} className="sl-img-cover" />
      )}
    </div>
  );
}

function QuoteLayout({ slide }: { slide: Slide }) {
  const bq = slide.elements.find((e) => e.type === 'blockquote');
  return (
    <div className="sl-quote">
      {bq && bq.type === 'blockquote' && (
        <>
          <div className="sl-quote__mark">"</div>
          {bq.html
            ? <div className="sl-quote__text" dangerouslySetInnerHTML={{ __html: bq.html }} />
            : <div className="sl-quote__text">{bq.text}</div>}
          {bq.attribution && (
            <div className="sl-quote__attr">— {bq.attribution}</div>
          )}
        </>
      )}
    </div>
  );
}

function TwoColumnLayout({ slide }: { slide: Slide }) {
  const breakIdx = slide.elements.findIndex((e) => e.type === 'column-break');

  let left: SlideElement[];
  let right: SlideElement[];

  if (breakIdx >= 0) {
    left  = slide.elements.slice(0, breakIdx);
    right = slide.elements.slice(breakIdx + 1);
  } else {
    [left, right] = autoSplitElements(slide.elements);
  }

  return (
    <div className="sl-two-col">
      {slide.title && <div className="sl-heading sl-two-col__title">{slide.title}</div>}
      <div className="sl-two-col__body">
        <OverflowPane className="sl-two-col__col" elements={left} />
        <div className="sl-two-col__divider" />
        <OverflowPane className="sl-two-col__col" elements={right} />
      </div>
    </div>
  );
}

function BspLayout({ slide }: { slide: Slide }) {
  const groups = groupProgressRuns(slide.elements);

  // Guard against a layout:bsp override on a slide with fewer than 2 logical groups.
  if (groups.length < 2) return <TitleContentLayout slide={slide} />;

  // For 2 groups: if first is visual and second is text, put text on the left
  const isGroupPureText = (g: SlideElement[]) =>
    g.every((e) => e.type === 'paragraph' || e.type === 'list' || e.type === 'progress');

  let leftGroup: SlideElement[];
  let rightGroups: SlideElement[][];

  if (groups.length === 2) {
    if (!isGroupPureText(groups[0]) && isGroupPureText(groups[1])) {
      leftGroup  = groups[1];
      rightGroups = [groups[0]];
    } else {
      leftGroup  = groups[0];
      rightGroups = [groups[1]];
    }
  } else {
    // 3+ logical groups: first fills left, remaining stack on right
    leftGroup  = groups[0];
    rightGroups = groups.slice(1);
  }

  // Text panes top-align like every other text-holding layout (split, title-content,
  // two-column); non-text panes (image/chart/table) stay vertically centered for balance.
  const paneClass = (g: SlideElement[]) => 'sl-bsp__pane' + (isGroupPureText(g) ? ' sl-bsp__pane--text' : '');
  const subpaneClass = (g: SlideElement[]) => 'sl-bsp__subpane' + (isGroupPureText(g) ? ' sl-bsp__pane--text' : '');

  return (
    <div className="sl-bsp">
      {slide.title && <div className="sl-heading sl-bsp__title">{slide.title}</div>}
      <div className="sl-bsp__body">
        <OverflowPane className={paneClass(leftGroup)} elements={leftGroup} />
        <div className="sl-bsp__divider" />
        {rightGroups.length === 1 ? (
          <OverflowPane className={paneClass(rightGroups[0])} elements={rightGroups[0]} />
        ) : (
          <div className="sl-bsp__right">
            {rightGroups.map((g, i) => (
              <OverflowPane key={i} className={subpaneClass(g)} elements={g} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GridLayout({ slide }: { slide: Slide }) {
  // Filter column-break elements, then group consecutive progress bars into one cell.
  const filtered = slide.elements.filter((e) => e.type !== 'column-break');
  const groups = groupProgressRuns(filtered);
  return (
    <div className="sl-grid">
      {slide.title && <div className="sl-heading sl-grid__title">{slide.title}</div>}
      <div className="sl-grid__cells">
        {groups.map((group, i) => (
          <div key={i} className="sl-grid__cell">
            <Elements elements={group} />
          </div>
        ))}
      </div>
    </div>
  );
}

function MediaLayout({ slide }: { slide: Slide }) {
  const yt = slide.elements.find((e) => e.type === 'youtube');
  const vid = slide.elements.find((e) => e.type === 'video');
  const poll = slide.elements.find((e) => e.type === 'poll');
  return (
    <div className="sl-media">
      {slide.title && <div className="sl-heading sl-media__title">{slide.title}</div>}
      <div className="sl-media__body">
        {yt && yt.type === 'youtube' && <YoutubeEmbed embed={yt} />}
        {vid && vid.type === 'video' && <VideoEmbed embed={vid} />}
        {poll && poll.type === 'poll' && <PollEmbed embed={poll} />}
      </div>
    </div>
  );
}

function CodeLayout({ slide }: { slide: Slide }) {
  const codeEls = slide.elements.filter((e) => e.type === 'code' || e.type === 'mermaid');
  return (
    <div className="sl-code">
      {slide.title && <div className="sl-heading sl-code__title">{slide.title}</div>}
      {codeEls.map((codeEl, i) => (
        <div key={i} className="sl-code__block">
          {codeEl.type === 'code' && (
            <>
              {codeEl.lang && <div className="sl-code__lang">{codeEl.lang}</div>}
              <CodeBlock lang={codeEl.lang} value={codeEl.value} />
            </>
          )}
          {codeEl.type === 'mermaid' && (
            <MermaidDiagram value={codeEl.value} />
          )}
        </div>
      ))}
    </div>
  );
}

function MathLayout({ slide }: { slide: Slide }) {
  const mathEls = slide.elements.filter((e): e is Extract<SlideElement, { type: 'math' }> => e.type === 'math');
  return (
    <div className="sl-math-layout">
      {slide.title && <div className="sl-heading sl-math-layout__title">{slide.title}</div>}
      <div className="sl-math-layout__body">
        {mathEls.map((el, i) => (
          <MathBlock key={i} value={el.value} display={el.display} />
        ))}
      </div>
    </div>
  );
}

function BlankLayout() {
  return <div className="sl-blank" />;
}
