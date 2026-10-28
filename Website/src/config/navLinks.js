import {
  IconGrid,
  IconHandshake,
  IconHelp,
  IconHome,
  IconMobile,
  IconSearch,
  IconShield,
  IconShop,
  IconStar,
} from '../components/Icons';

export const NAV_LINKS = [
  { path: '/', label: 'Home', icon: IconHome },
  { path: '/explore', label: 'Explore', icon: IconSearch },
  { path: '/categories', label: 'Categories', icon: IconGrid },
  { path: '/sellers', label: 'For sellers', icon: IconShop },
];

export const NAV_MORE_LINKS = [
  { path: '/features', label: 'Features', desc: 'Why use KinBech', icon: IconStar },
  { path: '/how-it-works', label: 'How it works', desc: '4 simple steps', icon: IconHandshake },
  { path: '/safety', label: 'Safety', desc: 'Trust guidelines', icon: IconShield },
  { path: '/faq', label: 'FAQ', desc: 'Common questions', icon: IconHelp },
];

export const DRAWER_LINKS = [
  { path: '/', label: 'Home', desc: 'Start here', icon: IconHome },
  { path: '/explore', label: 'Explore', desc: 'Products & sellers live', icon: IconSearch },
  { path: '/categories', label: 'Categories', desc: 'Browse by type', icon: IconGrid },
  { path: '/sellers', label: 'For sellers', desc: 'Individual & shop', icon: IconShop },
  ...NAV_MORE_LINKS,
  { path: '/download', label: 'Download', desc: 'Get the app', icon: IconMobile },
];

export function isNavActive(path, pathname) {
  if (path === '/explore') {
    return pathname.startsWith('/explore') || pathname.startsWith('/listing/') || pathname.startsWith('/seller/');
  }
  return pathname === path;
}
