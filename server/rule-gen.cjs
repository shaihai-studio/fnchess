const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType, ShadingType,
  Footer, PageNumber, PageBreak
} = require('C:/Users/admin/AppData/Roaming/npm/node_modules/docx');

const CN_FONT = 'Microsoft YaHei';

// ── 游戏主题配色 ─────────────────────────────
const COLORS = {
  bg:      '0B1220',   // 深蓝黑底（封面底纹用）
  primary: '3B82F6',   // 主题蓝
  green:   '22C55E',   // 主题绿
  gold:    'EAB308',   // 金色点缀
  heading: '1E3A8A',   // 深蓝（大标题）
  h2:      '16A34A',   // 绿色（模式标题）
  h3:      '374151',   // 深灰（小标题）
  text:    '1F2937',   // 正文
  tableHead: '1E3A5F', // 表头深蓝
  altRow:  'F0F7FF',   // 表格交替行浅蓝
};
const runOpts = { font: CN_FONT };

// ── 通用构建 ─────────────────────────────────
const border = { style: BorderStyle.SINGLE, size: 1, color: 'B9C7D9' };
const cellBorders = { top: border, bottom: border, left: border, right: border };

function mkCell(txt, width, opts = {}) {
  const { isHead, alt, align, color } = opts;
  return new TableCell({
    borders: cellBorders,
    width: { size: width, type: WidthType.DXA },
    shading: {
      fill: isHead ? COLORS.tableHead : (alt ? COLORS.altRow : 'FFFFFF'),
      type: ShadingType.CLEAR,
    },
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    children: [new Paragraph({
      alignment: align || AlignmentType.CENTER,
      children: [new TextRun({
        text: txt,
        bold: !!isHead,
        size: isHead ? 21 : 20,
        color: isHead ? 'FFFFFF' : (color || COLORS.text),
        font: CN_FONT,
      })]
    })]
  });
}

function mkTable(widths, header, rows) {
  const total = widths.reduce((a, b) => a + b, 0);
  const trs = [
    new TableRow({ tableHeader: true, children: header.map((c, i) => mkCell(c, widths[i], { isHead: true })) })
  ].concat(rows.map((r, ri) => new TableRow({
    children: r.map((c, i) => mkCell(c, widths[i], { alt: ri % 2 === 1 }))
  })));
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: widths,
    rows: trs,
  });
}

const difficultyTable = mkTable(
  [1150, 1400, 1400, 1250, 1000, 1400],
  ['难度', '目标格/回合', '禁止区/回合', '时间限(秒)', '回合数', '胜利需胜场'],
  [
    ['简单', '3', '1', '600', '4', '3'],
    ['普通', '2', '4', '300', '6', '4'],
    ['困难', '1', '16', '60', '8', '5'],
    ['专家', '1', '64', '60', '12', '7'],
  ]
);

const starTable = mkTable(
  [2100, 2100],
  ['用时', '星级'],
  [
    ['＜100s', '★★★★★'],
    ['＜150s', '★★★★'],
    ['＜300s', '★★★'],
    ['＜1000s', '★★'],
    ['否则', '★'],
  ]
);

// ── 解析游戏规则.txt ─────────────────────────
const srcPath = path.join(__dirname, '..', '游戏规则.txt');
const text = fs.readFileSync(srcPath, 'utf8');
const lines = text.split(/\r?\n/);

// 封面标题 = txt 第一行（如 "函数棋 游戏规则"）
const TITLE = (lines.find(l => l.trim() !== '' && !/^={6,}$/.test(l.trim())) || '函数棋 游戏规则').trim();

const flow = [];
function push(type, value) { flow.push({ type, value }); }

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const trimmed = line.trim();
  if (/^={6,}$/.test(trimmed) || trimmed === '') continue;
  if (trimmed === TITLE) continue; // 标题行交给封面
  if (/^[┌├└─┬┴┼│]+$/.test(trimmed)) continue;

  if (/^[一二三四五六七八九十]+、.+/.test(trimmed)) { push('h1', trimmed); continue; }
  if (/^[①②③④⑤⑥⑦].+/.test(trimmed)) { push('h2', trimmed); continue; }
  if (/^[\u4e00-\u9fffA-Za-z][^：:]{0,14}$/.test(trimmed) && !/^-/.test(trimmed) && !/^[0-9]/.test(trimmed)) { push('h3', trimmed); continue; }

  if (/^ {4,}- /.test(line)) {
    const content = trimmed.replace(/^- /, '');
    if (content.includes('按总用时评定星级')) { push('para', content); push('table', 'star'); }
    else push('bullet2', content);
    continue;
  }
  if (/^ {1,3}- /.test(line)) {
    const content = trimmed.replace(/^- /, '');
    if (content.startsWith('难度配置：')) { push('para', '难度配置：'); push('table', 'difficulty'); }
    else if (content.includes('按总用时评定星级')) { push('para', content); push('table', 'star'); }
    else push('bullet', content);
    continue;
  }
  push('para', trimmed);
}

// ── 构建 docx 内容 ───────────────────────────
const children = [];

// 封面
children.push(new Paragraph({ spacing: { before: 2600 }, children: [] }));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 200 },
  children: [new TextRun({ text: TITLE.split(' ')[0] || '函数棋', bold: true, size: 64, color: COLORS.primary, font: CN_FONT })]
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 400 },
  children: [new TextRun({ text: TITLE.split(' ').slice(1).join(' ') || '游戏规则', bold: true, size: 44, color: COLORS.green, font: CN_FONT })]
}));
// 金色装饰线
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 120, after: 500 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: COLORS.gold, space: 1 } },
  children: [new TextRun({ text: '', font: CN_FONT })]
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 300 },
  children: [new TextRun({
    text: '数学函数 × 策略对战 · 双人 / 人机回合制',
    size: 24, color: '6B7280', font: CN_FONT,
  })]
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [new TextRun({
    text: '纯 HTML5 Canvas · 无框架 · 无依赖',
    size: 20, color: '9CA3AF', font: CN_FONT,
  })]
}));
// 分页到正文
children.push(new Paragraph({ children: [new PageBreak()] }));

// 正文
for (const item of flow) {
  switch (item.type) {
    case 'h1':
      children.push(new Paragraph({
        spacing: { before: 480, after: 200 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: COLORS.primary, space: 4 } },
        children: [new TextRun({ text: item.value, bold: true, size: 30, color: COLORS.heading, font: CN_FONT })]
      }));
      break;
    case 'h2':
      children.push(new Paragraph({
        spacing: { before: 360, after: 160 },
        children: [
          new TextRun({ text: '◆ ', bold: true, size: 26, color: COLORS.gold, font: CN_FONT }),
          new TextRun({ text: item.value, bold: true, size: 26, color: COLORS.h2, font: CN_FONT }),
        ]
      }));
      break;
    case 'h3':
      children.push(new Paragraph({
        spacing: { before: 260, after: 120 },
        children: [new TextRun({ text: item.value, bold: true, size: 23, color: COLORS.h3, font: CN_FONT })]
      }));
      break;
    case 'bullet':
      children.push(new Paragraph({
        numbering: { reference: 'bullets', level: 0 },
        spacing: { after: 70, line: 300 },
        children: [new TextRun({ text: item.value, size: 21, color: COLORS.text, font: CN_FONT })]
      }));
      break;
    case 'bullet2':
      children.push(new Paragraph({
        numbering: { reference: 'bullets', level: 1 },
        spacing: { after: 70, line: 300 },
        children: [new TextRun({ text: item.value, size: 21, color: COLORS.text, font: CN_FONT })]
      }));
      break;
    case 'para':
      children.push(new Paragraph({
        spacing: { after: 140, line: 300 },
        children: [new TextRun({ text: item.value, size: 21, color: COLORS.text, font: CN_FONT })]
      }));
      break;
    case 'table':
      children.push(item.value === 'difficulty' ? difficultyTable : starTable);
      children.push(new Paragraph({ spacing: { after: 140 }, children: [] }));
      break;
  }
}

// ── 文档 ─────────────────────────────────────
const doc = new Document({
  styles: {
    default: { document: { run: { font: CN_FONT, size: 22, color: COLORS.text } } },
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [
        { level: 0, format: LevelFormat.BULLET, text: '●', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 560, hanging: 260 } } } },
        { level: 1, format: LevelFormat.BULLET, text: '○', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1040, hanging: 260 } } } },
      ] },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 }, // A4
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: COLORS.primary, space: 4 } },
          children: [
            new TextRun({ text: '函数棋 · 游戏规则   第 ', size: 18, color: '9CA3AF', font: CN_FONT }),
            new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '9CA3AF', font: CN_FONT }),
            new TextRun({ text: ' 页', size: 18, color: '9CA3AF', font: CN_FONT }),
          ],
        })]
      }),
    },
    children,
  }],
});

const outPath = path.join(__dirname, '..', '游戏规则.docx');
Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(outPath, buffer);
  console.log('OK:', outPath, buffer.length, 'bytes');
}).catch(e => { console.error('ERR', e); process.exit(1); });
