const QRCode = require('qrcode');
const Shop = require('../models/Shop');
const { buildStorefrontPayload, buildStorefrontUrl } = require('../utils/storefront');
const { generateStorefrontBannerPdf } = require('../utils/storefrontBannerPdf');

async function loadOwnedShop(userId) {
  return Shop.findOne({ owner: userId, status: 'active' });
}

async function getMyShopStorefront(req, res, next) {
  try {
    const shop = await loadOwnedShop(req.user._id);
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    const storefront = buildStorefrontPayload(shop);
    const qrDataUrl = await QRCode.toDataURL(storefront.url, {
      width: 720,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: { dark: '#0B0F17', light: '#FFFFFF' },
    });

    res.json({
      storefront: {
        ...storefront,
        qrDataUrl,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function downloadMyShopStorefrontQr(req, res, next) {
  try {
    const shop = await loadOwnedShop(req.user._id);
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    const url = buildStorefrontUrl(shop._id);
    const pngBuffer = await QRCode.toBuffer(url, {
      type: 'png',
      width: 1200,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: { dark: '#0B0F17', light: '#FFFFFF' },
    });

    const safeName = String(shop.name || 'shop')
      .trim()
      .replace(/[^\w.-]+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 48) || 'shop';

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}-kinbech-qr.png"`);
    res.send(pngBuffer);
  } catch (error) {
    next(error);
  }
}

async function downloadMyShopStorefrontBannerPdf(req, res, next) {
  try {
    const shop = await loadOwnedShop(req.user._id);
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    const url = buildStorefrontUrl(shop._id);
    const pdfBuffer = await generateStorefrontBannerPdf({
      shopName: shop.name,
      url,
    });

    const safeName = String(shop.name || 'shop')
      .trim()
      .replace(/[^\w.-]+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 48) || 'shop';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeName}-kinbech-counter-banner.pdf"`,
    );
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getMyShopStorefront,
  downloadMyShopStorefrontQr,
  downloadMyShopStorefrontBannerPdf,
};
