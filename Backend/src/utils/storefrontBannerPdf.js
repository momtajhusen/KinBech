const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const BRAND_TAGLINE = 'Sell Quick · Buy Local';
const HINDI_HEADLINE =
  'Hamare sabhi items aur offers KinBech app par dekhein';
const HINDI_CTA = 'Scan QR Code';
const ENGLISH_SUBLINE = 'View all our items & offers on KinBech';

const FONT_REGULAR = path.join(
  __dirname,
  '../../assets/fonts/NotoSansDevanagari-Regular.ttf',
);
const FONT_BOLD = path.join(
  __dirname,
  '../../assets/fonts/NotoSansDevanagari-Bold.ttf',
);

function fontAvailable(fontPath) {
  try {
    return fs.existsSync(fontPath);
  } catch {
    return false;
  }
}

async function generateStorefrontBannerPdf({ shopName, url }) {
  const qrBuffer = await QRCode.toBuffer(url, {
    type: 'png',
    width: 900,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: { dark: '#0B0F17', light: '#FFFFFF' },
  });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      info: {
        Title: `${shopName} - KinBech Shop QR Banner`,
        Author: 'KinBech',
        Subject: 'Printable shop counter QR banner',
      },
    });

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const margin = 42;

    doc.rect(0, 0, pageW, 132).fill('#059669');
    doc.rect(0, 132, pageW, 8).fill('#047857');

    doc.fillColor('#FFFFFF');
    if (fontAvailable(FONT_BOLD)) doc.font(FONT_BOLD);
    doc.fontSize(34).text('KinBech', margin, 36, { width: pageW - margin * 2 });
    if (fontAvailable(FONT_REGULAR)) doc.font(FONT_REGULAR);
    doc.fontSize(13).text(BRAND_TAGLINE, margin, 78, { width: pageW - margin * 2 });

    doc.roundedRect(margin, 158, pageW - margin * 2, pageH - 158 - margin, 18).fill('#F9FAFB');
    doc.roundedRect(margin, 158, pageW - margin * 2, pageH - 158 - margin, 18).lineWidth(2).stroke('#D1D5DB');

    const contentX = margin + 28;
    const contentW = pageW - margin * 2 - 56;
    let y = 188;

    doc.fillColor('#111827');
    if (fontAvailable(FONT_BOLD)) doc.font(FONT_BOLD);
    doc.fontSize(24).text(String(shopName || 'Your Shop'), contentX, y, {
      width: contentW,
      align: 'center',
    });
    y = doc.y + 18;

    doc.fillColor('#059669');
    doc.fontSize(18).text(HINDI_HEADLINE, contentX, y, {
      width: contentW,
      align: 'center',
      lineGap: 4,
    });
    y = doc.y + 10;

    doc.fillColor('#6B7280');
    if (fontAvailable(FONT_REGULAR)) doc.font(FONT_REGULAR);
    doc.fontSize(12).text(ENGLISH_SUBLINE, contentX, y, {
      width: contentW,
      align: 'center',
    });
    y = doc.y + 22;

    const qrSize = 250;
    const qrX = (pageW - qrSize) / 2;
    doc.roundedRect(qrX - 12, y - 12, qrSize + 24, qrSize + 24, 14).fill('#FFFFFF');
    doc.roundedRect(qrX - 12, y - 12, qrSize + 24, qrSize + 24, 14).lineWidth(1.5).stroke('#E5E7EB');
    doc.image(qrBuffer, qrX, y, { width: qrSize, height: qrSize });
    y += qrSize + 28;

    doc.fillColor('#0B0F17');
    if (fontAvailable(FONT_BOLD)) doc.font(FONT_BOLD);
    doc.fontSize(22).text(HINDI_CTA, contentX, y, {
      width: contentW,
      align: 'center',
    });
    y = doc.y + 12;

    doc.fillColor('#6B7280');
    if (fontAvailable(FONT_REGULAR)) doc.font(FONT_REGULAR);
    doc.fontSize(11).text(String(url || '').replace(/^https?:\/\//, ''), contentX, y, {
      width: contentW,
      align: 'center',
    });
    y = doc.y + 16;

    doc.fillColor('#9CA3AF');
    doc.fontSize(10).text('Print on A4 · Laminate · Place at shop counter or entrance', contentX, y, {
      width: contentW,
      align: 'center',
    });

    doc.end();
  });
}

module.exports = {
  generateStorefrontBannerPdf,
  HINDI_HEADLINE,
  HINDI_CTA,
};
