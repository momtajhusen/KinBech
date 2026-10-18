const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const BRAND_TAGLINE = 'Sell Quick · Buy Local';
const HEADLINE = 'View all our items & offers on the KinBech app';
const CTA = 'Scan QR Code';
const LOGO_PATH = path.join(__dirname, '../../assets/brand/kinbech-logo.png');

const C = {
  deep: '#064E3B',
  brand: '#059669',
  brandDark: '#047857',
  mint: '#A7F3D0',
  mintSoft: '#D1FAE5',
  mintBg: '#ECFDF5',
  ink: '#0B1F17',
  text: '#111827',
  muted: '#6B7280',
  line: '#E5E7EB',
  white: '#FFFFFF',
};

const BOLD = 'Helvetica-Bold';
const REGULAR = 'Helvetica';

function logoBuffer() {
  try {
    return fs.existsSync(LOGO_PATH) ? fs.readFileSync(LOGO_PATH) : null;
  } catch {
    return null;
  }
}

function fitText(doc, text, font, maxSize, minSize, width) {
  let size = maxSize;
  doc.font(font);
  while (size > minSize && doc.fontSize(size).widthOfString(text) > width) size -= 1;
  let out = text;
  doc.fontSize(size);
  while (out.length > 1 && doc.widthOfString(out) > width) out = `${out.slice(0, -2)}…`;
  return { text: out, size };
}

function pill(doc, { label, centerX, x, y, fill, color, opacity = 1 }) {
  doc.font(BOLD).fontSize(8.5);
  const w = doc.widthOfString(label, { characterSpacing: 1.4 }) + 24;
  const h = 20;
  const left = centerX != null ? centerX - w / 2 : x - w;
  doc.save().fillOpacity(opacity).roundedRect(left, y, w, h, h / 2).fill(fill).restore();
  doc
    .fillColor(color)
    .font(BOLD)
    .fontSize(8.5)
    .text(label, left, y + 6.2, { width: w, align: 'center', characterSpacing: 1.4, lineBreak: false });
}

function logoBadge(doc, logo, x, y, size, fill = C.deep) {
  doc.roundedRect(x, y, size, size, size * 0.26).fill(fill);
  if (logo) doc.image(logo, x + size * 0.04, y + size * 0.04, { width: size * 0.92, height: size * 0.92 });
}

function cornerBrackets(doc, x, y, size, { offset = 16, length = 34, width = 5, color = C.brand } = {}) {
  const l = x - offset;
  const t = y - offset;
  const r = x + size + offset;
  const b = y + size + offset;
  doc.save().lineWidth(width).lineCap('round').lineJoin('round').strokeColor(color);
  doc.moveTo(l, t + length).lineTo(l, t).lineTo(l + length, t).stroke();
  doc.moveTo(r - length, t).lineTo(r, t).lineTo(r, t + length).stroke();
  doc.moveTo(l, b - length).lineTo(l, b).lineTo(l + length, b).stroke();
  doc.moveTo(r - length, b).lineTo(r, b).lineTo(r, b - length).stroke();
  doc.restore();
}

async function generateStorefrontBannerPdf({ shopName, url, category, location, isVerified, shopLogo }) {
  const qrBuffer = await QRCode.toBuffer(url, {
    type: 'png',
    width: 1000,
    margin: 1,
    errorCorrectionLevel: 'H',
    color: { dark: C.ink, light: C.white },
  });
  const logo = logoBuffer();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      info: {
        Title: `${shopName} - KinBech Store QR`,
        Author: 'KinBech',
        Subject: 'Printable shop counter QR poster',
      },
    });

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width;
    const H = doc.page.height;
    const M = 40;

    // Hero
    const heroH = 340;
    const hero = doc.linearGradient(0, 0, W, heroH);
    hero.stop(0, C.deep).stop(1, C.brand);
    doc.rect(0, 0, W, heroH).fill(hero);
    doc.save().fillOpacity(0.07);
    doc.circle(W - 30, 20, 130).fill(C.white);
    doc.circle(20, heroH - 20, 80).fill(C.white);
    doc.circle(W * 0.62, heroH - 10, 36).fill(C.white);
    doc.restore();

    pill(doc, {
      label: isVerified ? 'VERIFIED STORE' : 'KINBECH STORE',
      x: W - 24,
      y: 22,
      fill: C.white,
      opacity: 0.16,
      color: C.white,
    });

    const heroLogo = 88;
    doc.save().fillOpacity(0.25).roundedRect(W / 2 - heroLogo / 2 - 4, 26, heroLogo + 8, heroLogo + 8, 27).fill(C.white).restore();
    logoBadge(doc, logo, W / 2 - heroLogo / 2, 30, heroLogo);
    doc
      .fillColor(C.white)
      .font(BOLD)
      .fontSize(50)
      .text('KinBech App', 0, 128, { width: W, align: 'center', characterSpacing: 1, lineBreak: false });
    doc
      .fillColor(C.mint)
      .font(BOLD)
      .fontSize(13)
      .text(BRAND_TAGLINE, 0, 184, { width: W, align: 'center', characterSpacing: 1, lineBreak: false });

    doc
      .fillColor(C.white)
      .font(BOLD)
      .fontSize(18)
      .text('SCAN & SHOP', 0, 212, { width: W, align: 'center', characterSpacing: 4, lineBreak: false });
    doc
      .fillColor(C.mintSoft)
      .font(REGULAR)
      .fontSize(11)
      .text(HEADLINE, M, 236, { width: W - M * 2, align: 'center', lineBreak: false });

    // Store card
    const cardX = M;
    const cardY = 264;
    const cardW = W - M * 2;
    const cardH = 418;
    doc.save().fillOpacity(0.07).roundedRect(cardX, cardY + 8, cardW, cardH, 26).fill('#000000').restore();
    doc.roundedRect(cardX, cardY, cardW, cardH, 24).fill(C.white);
    doc.roundedRect(cardX, cardY, cardW, cardH, 24).lineWidth(1).stroke(C.line);

    const shift = shopLogo ? 30 : 0;
    if (shopLogo) {
      const size = 56;
      const lx = W / 2 - size / 2;
      const ly = cardY + 14;
      doc.save().roundedRect(lx, ly, size, size, 14).clip();
      doc.image(shopLogo, lx, ly, { width: size, height: size });
      doc.restore();
      doc.roundedRect(lx, ly, size, size, 14).lineWidth(2).stroke(C.mintSoft);
    } else {
      pill(doc, { label: 'OUR STORE', centerX: W / 2, y: cardY + 22, fill: C.mintBg, color: C.brandDark });
    }

    const fullName = String(shopName || 'Your Store').trim();
    const nameW = cardW - 60;
    const single = fitText(doc, fullName, BOLD, 32, 20, nameW);
    let extra = 0;
    if (single.text === fullName) {
      doc.fillColor(C.ink).font(BOLD).fontSize(single.size).text(fullName, cardX + 30, cardY + 50 + shift, {
        width: nameW,
        align: 'center',
        lineBreak: false,
      });
    } else {
      doc.font(BOLD).fontSize(20);
      extra = 24;
      doc.fillColor(C.ink).text(fullName, cardX + 30, cardY + 50 + shift, {
        width: nameW,
        align: 'center',
        height: 50,
        ellipsis: true,
        lineGap: 2,
      });
    }

    const meta = [category, location].filter(Boolean).join('   ·   ');
    if (meta) {
      const metaFit = fitText(doc, meta, REGULAR, 11, 9, nameW);
      doc.fillColor(C.muted).font(REGULAR).fontSize(metaFit.size).text(metaFit.text, cardX, cardY + 92 + extra + shift, {
        width: cardW,
        align: 'center',
        lineBreak: false,
      });
    }

    const qrSize = 214 - extra - shift;
    const qrX = (W - qrSize) / 2;
    const qrY = cardY + 120 + extra + shift;
    doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
    cornerBrackets(doc, qrX, qrY, qrSize);
    const badge = 50;
    doc.roundedRect(W / 2 - badge / 2 - 4, qrY + qrSize / 2 - badge / 2 - 4, badge + 8, badge + 8, 14).fill(C.white);
    logoBadge(doc, logo, W / 2 - badge / 2, qrY + qrSize / 2 - badge / 2, badge);

    doc
      .fillColor(C.text)
      .font(BOLD)
      .fontSize(14)
      .text(`${CTA} with your phone camera`, cardX, qrY + qrSize + 30, { width: cardW, align: 'center' });
    doc
      .fillColor(C.muted)
      .font(REGULAR)
      .fontSize(9.5)
      .text(String(url || '').replace(/^https?:\/\//, ''), cardX + 30, qrY + qrSize + 52, {
        width: cardW - 60,
        align: 'center',
        lineBreak: false,
      });

    // Steps
    const steps = [
      ['Open camera', 'Point your phone at the QR'],
      ['Scan the code', 'Our store opens in KinBech'],
      ['Shop & chat', 'Browse items, ask, and buy'],
    ];
    const colW = cardW / 3;
    const stepY = cardY + cardH + 18;
    steps.forEach(([title, body], i) => {
      const cx = cardX + colW * i + colW / 2;
      doc.circle(cx, stepY + 13, 13).fill(C.brand);
      doc.fillColor(C.white).font(BOLD).fontSize(12).text(String(i + 1), cx - 13, stepY + 7.5, {
        width: 26,
        align: 'center',
        lineBreak: false,
      });
      doc.fillColor(C.text).font(BOLD).fontSize(11).text(title, cardX + colW * i, stepY + 34, {
        width: colW,
        align: 'center',
        lineBreak: false,
      });
      doc.fillColor(C.muted).font(REGULAR).fontSize(9).text(body, cardX + colW * i + 8, stepY + 50, {
        width: colW - 16,
        align: 'center',
      });
      if (i > 0) {
        doc.save().dash(2, { space: 3 }).lineWidth(1).strokeColor(C.mint);
        doc.moveTo(cardX + colW * i - 22, stepY + 13).lineTo(cardX + colW * i + 22, stepY + 13).stroke();
        doc.undash().restore();
      }
    });

    // Footer
    const footH = 66;
    const footY = H - footH;
    const foot = doc.linearGradient(0, footY, W, H);
    foot.stop(0, C.deep).stop(1, C.brandDark);
    doc.rect(0, footY, W, footH).fill(foot);
    logoBadge(doc, logo, M, footY + 15, 36, C.brandDark);
    doc.fillColor(C.white).font(BOLD).fontSize(13).text('Get the KinBech app', M + 48, footY + 18, { lineBreak: false });
    doc.fillColor(C.mint).font(REGULAR).fontSize(9.5).text(BRAND_TAGLINE, M + 48, footY + 36, { lineBreak: false });
    doc
      .fillColor(C.mint)
      .font(REGULAR)
      .fontSize(8.5)
      .text('Print on A4  ·  Laminate  ·  Stick at your counter', W - M - 240, footY + 28, {
        width: 240,
        align: 'right',
        lineBreak: false,
      });

    doc.end();
  });
}

module.exports = {
  generateStorefrontBannerPdf,
  HEADLINE,
  CTA,
};
