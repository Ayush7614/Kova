// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// parsePptx reads the file via Tauri's read_file_b64 command — mock it to
// hand back a hand-built in-memory PPTX zip instead of touching the filesystem.
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { invoke } from '@tauri-apps/api/core';
import JSZip from 'jszip';
import { parsePptx } from '../parsePptx';

const mockedInvoke = vi.mocked(invoke);

beforeEach(() => {
  mockedInvoke.mockReset();
});

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';

const PRESENTATION_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation ${NS}>
  <p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>
  <p:sldSz cx="9144000" cy="6858000"/>
</p:presentation>`;

const PRESENTATION_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`;

function tableXml(headerText: string, cellText: string): string {
  return `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
    <a:tbl>
      <a:tblGrid><a:gridCol w="1000000"/></a:tblGrid>
      <a:tr h="500000"><a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${headerText}</a:t></a:r></a:p></a:txBody></a:tc></a:tr>
      <a:tr h="500000"><a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${cellText}</a:t></a:r></a:p></a:txBody></a:tc></a:tr>
    </a:tbl>
  </a:graphicData></a:graphic>`;
}

// Slide layout (slide is 9144000 x 6858000 EMU):
//  - title, sp shape, at y=0                              -> normY = 0
//  - a standalone (ungrouped) table, at y=4000000          -> normY ~= 0.583
//  - a table nested in a p:grpSp; its OWN xfrm (child-local
//    coordinates) is (0,0), but the group transform places
//    it at composed y=6000000                              -> normY ~= 0.875
// Before the fix: getShapeGeom looked for a:xfrm (wrong namespace for a
// graphicFrame's own p:xfrm), so every table defaulted to (0,0) regardless of
// its real position — both tables would incorrectly sort at/near the top,
// tied with or ahead of the title. The grouped table's raw (0,0) xfrm, if
// read without composing the group transform, would also incorrectly place
// it at the top instead of its real bottom-of-slide position.
const SLIDE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld ${NS}>
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Title"/>
          <p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>
          <p:nvPr><p:ph type="title"/></p:nvPr>
        </p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="9144000" cy="1000000"/></a:xfrm></p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>My Title</a:t></a:r></a:p></p:txBody>
      </p:sp>
      <p:graphicFrame>
        <p:nvGraphicFramePr>
          <p:cNvPr id="3" name="Table 1"/>
          <p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr>
          <p:nvPr/>
        </p:nvGraphicFramePr>
        <p:xfrm><a:off x="1000000" y="4000000"/><a:ext cx="3000000" cy="1000000"/></p:xfrm>
        ${tableXml('StandaloneHeader', 'V1')}
      </p:graphicFrame>
      <p:grpSp>
        <p:nvGrpSpPr><p:cNvPr id="4" name="Group 1"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
        <p:grpSpPr>
          <a:xfrm>
            <a:off x="500000" y="6000000"/>
            <a:ext cx="2000000" cy="1000000"/>
            <a:chOff x="0" y="0"/>
            <a:chExt cx="1000000" cy="1000000"/>
          </a:xfrm>
        </p:grpSpPr>
        <p:graphicFrame>
          <p:nvGraphicFramePr>
            <p:cNvPr id="5" name="Table 2"/>
            <p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr>
            <p:nvPr/>
          </p:nvGraphicFramePr>
          <p:xfrm><a:off x="0" y="0"/><a:ext cx="1000000" cy="1000000"/></p:xfrm>
          ${tableXml('GroupedHeader', 'V2')}
        </p:graphicFrame>
      </p:grpSp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

async function buildFixtureBase64(): Promise<string> {
  const zip = new JSZip();
  zip.file('ppt/presentation.xml', PRESENTATION_XML);
  zip.file('ppt/_rels/presentation.xml.rels', PRESENTATION_RELS);
  zip.file('ppt/slides/slide1.xml', SLIDE_XML);
  return zip.generateAsync({ type: 'base64' });
}

describe('parsePptx table geometry', () => {
  it('positions tables at their real slide coordinates, in and out of a group', async () => {
    const b64 = await buildFixtureBase64();
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'read_file_b64') return b64;
      throw new Error(`unexpected invoke: ${cmd}`);
    });

    const result = await parsePptx('/fake/deck.pptx', '/fake/dest');
    expect(result.slides).toHaveLength(1);
    const { blocks } = result.slides[0];

    const kinds = blocks.map((b) => b.kind);
    // Reading order (sorted by normY ascending): title, then the standalone
    // table (~0.58), then the grouped table (~0.87) — proving both (a) the
    // standalone table no longer defaults to normY=0, and (b) the grouped
    // table's position accounts for the enclosing group's transform rather
    // than its raw (0,0) child-local coordinates.
    expect(kinds).toEqual(['title', 'table', 'table']);

    const standalone = blocks.find((b) => b.headers?.[0] === 'StandaloneHeader');
    const grouped = blocks.find((b) => b.headers?.[0] === 'GroupedHeader');
    expect(standalone).toBeDefined();
    expect(grouped).toBeDefined();

    expect(standalone!.normY).toBeCloseTo(4000000 / 6858000, 5);
    expect(grouped!.normY).toBeCloseTo(6000000 / 6858000, 5);
    expect(grouped!.normX).toBeCloseTo(500000 / 9144000, 5);
    expect(grouped!.normW).toBeCloseTo(2000000 / 9144000, 5);
  });
});
