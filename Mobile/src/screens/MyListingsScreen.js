import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Text,
  TextInput,
  View,
  Image,
  Modal,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Icon from '../components/Icon';
import { VoiceSearchToggle, useVoiceSearchBox } from '../components/VoiceHost';
import { LinearGradient } from 'expo-linear-gradient';
import { openItemDetail, navigateToTab, ROUTES, TABS } from '../navigation/helpers';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import EmptyState from '../components/EmptyState';
import { ProductCardSkeleton, Skeleton } from '../components/SkeletonLoader';
import { featuredTimeLeft, formatPrice, resolveMediaUrl, timeAgo } from '../utils/listing';
import { isNearEnd } from '../utils/scroll';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';
import { useAccountStatus } from '../hooks/useAccountStatus';
import AccountStatusCard from '../components/AccountStatusCard';
import TesterModeButton from '../components/TesterModeButton';

const STATUS_STYLES = {
  active: { color: 'statusActive', label: 'Active', icon: 'radio-button-on' },
  pending: { color: 'statusPending', label: 'In review', icon: 'time' },
  sold: { color: 'statusSold', label: 'Sold', icon: 'bag-check' },
  removed: { color: 'deleteRed', label: 'Rejected', icon: 'close-circle' },
  hidden: { color: 'warning', label: 'Hidden', icon: 'eye-off' },
};

const HIDDEN_REASONS = {
  not_available_reports: 'Buyers reported it is no longer available.',
  likely_sold: 'It looked sold and we did not hear back from you.',
  seller_inactive: 'Buyers were waiting while you were away.',
  expired: 'Buyers messaged about it and it was not confirmed.',
  out_of_stock: 'It was out of stock for a week.',
  stock_check_failed: 'Buyers said it was unavailable and the stock was not confirmed.',
  stock_unconfirmed: 'Buyers were waiting and the stock was not confirmed.',
  store_inactive: 'Buyers were waiting while your store was inactive.',
  account_suspended: 'Your account was suspended for a while.',
  seller_mode: 'Paused while you sell in another mode.',
};

const SOLD_REASONS = {
  marked_sold: 'You marked it sold.',
  deal_seller_sold: 'You marked it sold.',
  deal_seller_confirmed: 'You confirmed the deal in chat.',
  deal_chat_signal: 'The buyer said they got it in chat.',
  deal_buyer_confirmed: 'The buyer confirmed the deal in chat.',
  deal_auto_signals: 'You said it was sold in chat and the meetup passed.',
  deal_completed: 'A deal was completed after your meetup.',
};

const ACTIVE_REASONS = {
  still_available: 'You confirmed it is still available.',
  suspension_ended: 'Back automatically after your suspension ended.',
  approved: 'Approved by KinBech.',
  restored: 'Restored by KinBech.',
  edited: 'Live again after your edit.',
};

const SOURCE_LABELS = {
  auto: { label: 'Automatic', short: 'Auto', icon: 'flash-outline' },
  seller: { label: 'By you', short: 'You', icon: 'person-outline' },
  admin: { label: 'By KinBech', short: 'KinBech', icon: 'shield-checkmark-outline' },
};

/** Who set the current status and why: shown so sellers can tell "Auto-sold" from "Sold by you". */
function statusSource(item) {
  const source = SOURCE_LABELS[item.statusBy];
  if (!source) return null;
  const reason = item.statusReason;
  let text = '';
  if (item.status === 'sold') text = SOLD_REASONS[reason] || (item.statusBy === 'admin' ? 'Marked sold by KinBech.' : '');
  else if (item.status === 'hidden') text = HIDDEN_REASONS[reason] || '';
  else if (item.status === 'pending') {
    text = item.statusBy === 'admin'
      ? (reason === 'reported' ? 'Held by KinBech after a report.' : 'Held by KinBech for review.')
      : 'Held for a quick check automatically.';
  } else if (item.status === 'removed') {
    text = item.statusBy === 'admin' ? 'Rejected by KinBech.' : 'Blocked automatically.';
  } else if (item.status === 'active') {
    text = ACTIVE_REASONS[reason] || '';
    if (!text) return null;
  }
  const when = timeAgo(item.statusAt).replace(/^Posted /, '');
  return { ...source, text, when };
}

const STOCK_LABELS = {
  low_stock: 'Low stock',
  out_of_stock: 'Out of stock',
  unconfirmed: 'Stock not confirmed',
  under_check: 'Buyers say unavailable',
};

function trustNotice(item) {
  if (item.status === 'hidden' && item.autoHiddenReason === 'account_suspended') {
    return {
      title: 'Hidden by KinBech',
      text: `${HIDDEN_REASONS.account_suspended} It comes back automatically when the suspension ends.`,
      noRestore: true,
    };
  }
  if (item.status === 'hidden' && item.autoHiddenReason === 'seller_mode') {
    return {
      title: 'Paused',
      text: `${HIDDEN_REASONS.seller_mode} It comes back when you switch back in Settings > Seller Preference.`,
      noRestore: true,
    };
  }
  if (item.status === 'hidden') {
    return {
      title: item.statusBy === 'admin' ? 'Hidden by KinBech' : 'Hidden automatically',
      text: `${HIDDEN_REASONS[item.autoHiddenReason] || 'It looked unavailable.'} Still have it? Tap "Still available".`,
    };
  }
  if (item.autoSold) {
    return {
      title: 'Marked sold automatically',
      text: `${SOLD_REASONS[item.statusReason] || SOLD_REASONS.deal_completed} Still have it? Tap "Still available".`,
    };
  }
  if (item.needsConfirm) {
    return { title: 'Is it still available?', text: 'Buyers are asking. Confirm so your listing stays at the top.' };
  }
  if (item.stockState === 'under_check' || item.stockState === 'unconfirmed') {
    return { title: STOCK_LABELS[item.stockState], text: 'Check the stock below or tap "Still available".' };
  }
  return null;
}

function hasStockStepper(item) {
  return item.sellerType === 'shop' && item.listingKind === 'stock' && !item.hasVariants
    && (item.status === 'active' || item.status === 'hidden');
}

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'hidden', label: 'Hidden' },
  { key: 'pending', label: 'In review' },
  { key: 'removed', label: 'Rejected' },
  { key: 'sold', label: 'Sold' },
];

const SORT_OPTIONS = [
  { key: 'newest', label: 'Newest first', icon: 'arrow-down-outline' },
  { key: 'oldest', label: 'Oldest first', icon: 'arrow-up-outline' },
  { key: 'priceLow', label: 'Price: low to high', icon: 'trending-up-outline' },
  { key: 'priceHigh', label: 'Price: high to low', icon: 'trending-down-outline' },
  { key: 'views', label: 'Most viewed', icon: 'eye-outline' },
  { key: 'chats', label: 'Most chats', icon: 'chatbubble-outline' },
];

const BOOST_COLOR = '#D97706';
const FEATURED_BLUE = 'rgba(37, 99, 235, 0.92)';
const GRID_GAP = 10;
const RENDER_BATCH = 20;
const GRID_IMAGE_RATIO = 0.78;

function reviewReason(item) {
  return String(item?.moderationReason || '').replace(/\s*Held for manual review\.?\s*$/i, '').trim();
}

function statusColor(status, colors) {
  return colors[STATUS_STYLES[status]?.color || 'statusActive'];
}

// A voice search's order, as this screen's sort.
const VOICE_SORTS = { 'price-low': 'priceLow', 'price-high': 'priceHigh', newest: 'newest', popular: 'views' };

function sortItems(items, sortBy) {
  const list = [...items];
  const time = (item) => new Date(item.createdAt || 0).getTime();
  if (sortBy === 'oldest') return list.sort((a, b) => time(a) - time(b));
  if (sortBy === 'priceLow') return list.sort((a, b) => Number(a.price) - Number(b.price));
  if (sortBy === 'priceHigh') return list.sort((a, b) => Number(b.price) - Number(a.price));
  if (sortBy === 'views') return list.sort((a, b) => b.views - a.views);
  if (sortBy === 'chats') return list.sort((a, b) => b.chats - a.chats);
  return list.sort((a, b) => time(b) - time(a));
}

export default function MyListingsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { user, refreshUser } = useAuth();
  const [status, setStatus] = useState(route?.params?.initialTab || 'all');
  const [credits, setCredits] = useState(Number(user?.featuredCredits) || 0);
  const [boostingId, setBoostingId] = useState(null);
  const [sortBy, setSortBy] = useState('newest');
  const [category, setCategory] = useState('all');
  const [condition, setCondition] = useState('all');
  const [query, setQuery] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewMode, setViewMode] = useState('list');
  const { width: windowWidth } = useWindowDimensions();
  const gridCardWidth = (windowWidth - 32 - GRID_GAP) / 2;
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myShop, setMyShop] = useState(null);

  const isShopAccount = user?.sellerTypePreference === 'shop';

  const loadListings = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, shopRes, referralRes] = await Promise.all([
      api.getMyListings(),
      isShopAccount ? api.getMyShop() : Promise.resolve({ data: null }),
      api.getReferral(),
    ]);
    setLoading(false);
    if (referralRes.data) setCredits(Number(referralRes.data.featuredCredits) || 0);
    if (error) {
      console.error('Failed to load my listings:', error);
      setListings([]);
    } else {
      setListings(
        (data?.listings || []).map((listing) => ({
          ...listing,
          id: listing.id || listing._id,
          imageUrl: resolveMediaUrl(listing.photos?.[0] || ''),
          views: Number(listing.views ?? 0),
          chats: Number(listing.chats ?? 0),
        }))
      );
    }
    setMyShop(shopRes.data?.shop || null);
  }, [isShopAccount]);

  const { status: accountStatus, reload: reloadAccountStatus } = useAccountStatus();
  const { refreshing, onRefresh } = usePullRefresh(() => Promise.all([loadListings(), reloadAccountStatus()]));

  useFocusEffect(
    useCallback(() => {
      loadListings();
    }, [loadListings])
  );

  const counts = useMemo(() => {
    const next = { all: listings.length, active: 0, hidden: 0, pending: 0, removed: 0, sold: 0 };
    listings.forEach((item) => {
      if (next[item.status] != null) next[item.status] += 1;
    });
    return next;
  }, [listings]);

  const totals = useMemo(
    () => ({
      views: listings.reduce((sum, item) => sum + item.views, 0),
      chats: listings.reduce((sum, item) => sum + item.chats, 0),
    }),
    [listings]
  );

  const categories = useMemo(
    () => [...new Set(listings.map((item) => item.category).filter(Boolean))].sort(),
    [listings]
  );
  const conditions = useMemo(
    () => [...new Set(listings.map((item) => item.condition).filter(Boolean))],
    [listings]
  );

  const matchesQuery = useVoiceSearchBox({
    value: query,
    onChange: setQuery,
    onFilters: (search) => {
      setSortBy(VOICE_SORTS[search.sort] || 'newest');
      setCondition(search.condition || 'all');
    },
  });

  const filteredListings = useMemo(() => {
    const items = listings.filter((item) => {
      if (status !== 'all' && item.status !== status) return false;
      if (category !== 'all' && item.category !== category) return false;
      if (condition !== 'all' && item.condition !== condition) return false;
      if (!matchesQuery.inPriceRange(item.price)) return false;
      return matchesQuery(item.title, item.category, item.location);
    });
    return sortItems(items, sortBy);
  }, [listings, status, category, condition, matchesQuery, sortBy]);

  const [visibleCount, setVisibleCount] = useState(RENDER_BATCH);
  useEffect(() => {
    setVisibleCount(RENDER_BATCH);
  }, [status, category, condition, query, sortBy, viewMode]);

  const extraFilters = (sortBy !== 'newest' ? 1 : 0) + (category !== 'all' ? 1 : 0) + (condition !== 'all' ? 1 : 0);
  const sortLabel = SORT_OPTIONS.find((option) => option.key === sortBy)?.label || 'Newest first';

  const resetFilters = () => {
    setSortBy('newest');
    setCategory('all');
    setCondition('all');
  };

  const handleEdit = (item) => {
    navigation.navigate(ROUTES.EDIT_LISTING, { listingId: item.id, listing: item });
  };

  const handleShare = (item) => {
    navigation.navigate(ROUTES.LISTING_SUCCESS, {
      mode: 'share',
      listing: {
        id: item.id,
        title: item.title,
        price: item.price,
        location: item.location,
        imageUrl: item.imageUrl || resolveMediaUrl(item.photos?.[0] || ''),
        condition: item.condition,
        category: item.category,
      },
    });
  };

  const handleMarkSold = (item) => {
    Alert.alert('Mark as sold', 'Mark this listing as sold?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark sold',
        onPress: async () => {
          const { error } = await api.updateListing(item.id, { status: 'sold' });
          if (!error) {
            setListings((prev) => prev.map((l) => (l.id === item.id ? { ...l, status: 'sold' } : l)));
          } else {
            Alert.alert('Error', 'Could not mark this listing as sold');
          }
        },
      },
    ]);
  };

  const replaceListing = (fresh) => {
    if (!fresh) return;
    setListings((prev) => prev.map((l) => (
      l.id === (fresh.id || fresh._id) ? { ...l, ...fresh, id: l.id, imageUrl: l.imageUrl, chats: l.chats } : l
    )));
  };

  const handleStillAvailable = async (item) => {
    const { data, error } = await api.confirmStillAvailable(item.id);
    if (error) {
      Alert.alert('Error', error);
      return;
    }
    replaceListing(data?.listing);
  };

  const handleStock = async (item, delta) => {
    const current = Number(item.stock) || 0;
    if (current + delta < 0) return;
    setListings((prev) => prev.map((l) => (l.id === item.id ? { ...l, stock: current + delta } : l)));
    const { data, error } = await api.updateListingStock(item.id, { delta });
    if (error) {
      setListings((prev) => prev.map((l) => (l.id === item.id ? { ...l, stock: current } : l)));
      Alert.alert('Error', error);
      return;
    }
    replaceListing(data?.listing);
  };

  const stockCheckCount = listings.filter(
    (item) => item.status === 'active' && (item.stockState === 'unconfirmed' || item.stockState === 'under_check')
  ).length;

  const handleConfirmAllStock = async () => {
    const { error } = await api.confirmAllStock();
    if (error) {
      Alert.alert('Error', error);
      return;
    }
    loadListings();
  };

  const boostable = (item) => item.status === 'active' && !featuredTimeLeft(item.featuredUntil);
  const boostableCount = listings.filter(boostable).length;

  const runBoost = async (item) => {
    setBoostingId(item.id);
    const { data, error } = await api.featureListing(item.id);
    setBoostingId(null);
    if (error) {
      if (data?.code === 'NO_FEATURED_CREDITS') {
        setCredits(0);
        Alert.alert('No boost credits', 'Invite a friend to earn a free boost.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Invite', onPress: () => navigation.navigate(ROUTES.INVITE_FRIENDS) },
        ]);
      } else {
        Alert.alert('Could not boost', error);
        if (data?.code === 'ALREADY_FEATURED' || data?.code === 'NOT_ACTIVE') loadListings();
      }
      return;
    }
    replaceListing(data?.listing);
    setCredits(Number(data?.featuredCredits) || 0);
    refreshUser?.();
    Alert.alert('Boosted for 24 hours', 'Your listing is now Featured and shown higher to nearby buyers.');
  };

  const handleBoost = (item) => {
    if (boostingId) return;
    if (credits < 1) {
      Alert.alert(
        'Get a free boost',
        'A boost marks your listing Featured and shows it higher to nearby buyers for 24 hours. Invite a friend to earn one.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Invite', onPress: () => navigation.navigate(ROUTES.INVITE_FRIENDS) },
        ],
      );
      return;
    }
    Alert.alert(
      'Boost this listing?',
      `It will be Featured and shown higher to nearby buyers for 24 hours. This uses 1 of your ${credits} ${credits === 1 ? 'credit' : 'credits'}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Boost', onPress: () => runBoost(item) },
      ],
    );
  };

  const renderBoostRow = (item) => {
    if (item.status !== 'active') return null;
    const left = featuredTimeLeft(item.featuredUntil);
    if (left) {
      return (
        <View style={styles.boostRow}>
          <Icon name="flash" size={14} color={BOOST_COLOR} />
          <Text style={styles.boostRowText}>Featured · {left}</Text>
          <Text style={styles.boostRowHint} numberOfLines={1}>Shown higher to nearby buyers</Text>
        </View>
      );
    }
    if (credits < 1) return null;
    const busy = boostingId === item.id;
    return (
      <Pressable
        style={({ pressed }) => [styles.boostRow, styles.boostRowAction, pressed && styles.pressed]}
        onPress={() => handleBoost(item)}
        disabled={Boolean(boostingId)}
      >
        <Icon name="flash-outline" size={14} color={BOOST_COLOR} />
        <Text style={styles.boostRowText}>{busy ? 'Boosting…' : 'Boost for 24 hours'}</Text>
        <Text style={styles.boostRowHint} numberOfLines={1}>
          {credits} {credits === 1 ? 'credit' : 'credits'} left
        </Text>
        <Icon name="chevron-forward" size={14} color={BOOST_COLOR} />
      </Pressable>
    );
  };

  const renderTrustControls = (item) => {
    const notice = trustNotice(item);
    const stepper = hasStockStepper(item);
    if (!notice && !stepper) return null;
    return (
      <View style={styles.trustBox}>
        {notice ? (
          <View style={styles.trustNoticeRow}>
            <Icon name={item.status === 'hidden' ? 'eye-off-outline' : 'help-circle-outline'} size={15} color={colors.warning} />
            <View style={styles.reviewNoteCopy}>
              <Text style={styles.reviewNoteTitle}>{notice.title}</Text>
              <Text style={styles.reviewNoteText}>{notice.text}</Text>
            </View>
          </View>
        ) : null}
        <View style={styles.trustActions}>
          {stepper ? (
            <View style={styles.stepper}>
              <Pressable style={styles.stepperBtn} onPress={() => handleStock(item, -1)} hitSlop={6} accessibilityLabel="One less in stock">
                <Icon name="remove" size={16} color={colors.textSecondary} />
              </Pressable>
              <Text style={styles.stepperValue}>
                {Number(item.stock) || 0} in stock
              </Text>
              <Pressable style={styles.stepperBtn} onPress={() => handleStock(item, 1)} hitSlop={6} accessibilityLabel="One more in stock">
                <Icon name="add" size={16} color={colors.textSecondary} />
              </Pressable>
            </View>
          ) : null}
          {notice && !notice.noRestore ? (
            <Pressable
              style={({ pressed }) => [styles.actionBtn, styles.actionBtnPrimary, pressed && styles.pressed]}
              onPress={() => handleStillAvailable(item)}
            >
              <Icon name="checkmark-circle-outline" size={15} color={colors.price} />
              <Text style={[styles.actionText, styles.actionTextPrimary]}>Still available</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

  const handleDelete = (item) => {
    Alert.alert('Delete listing', 'Remove this listing permanently?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await api.deleteListing(item.id);
          if (!error) {
            setListings((prev) => prev.filter((row) => row.id !== item.id));
          } else {
            Alert.alert('Error', 'Could not delete listing');
          }
        },
      },
    ]);
  };

  const HEADER_STATS = [
    { key: 'active', label: 'Active', value: counts.active, icon: 'grid-outline' },
    { key: 'pending', label: 'In review', value: counts.pending + counts.removed, icon: 'time-outline' },
    { key: 'sold', label: 'Sold', value: counts.sold, icon: 'bag-check-outline' },
    { key: 'views', label: 'Views', value: totals.views, icon: 'eye-outline' },
  ];

  const emptyCopy = (() => {
    if (query.trim() || category !== 'all' || condition !== 'all') {
      return { icon: 'search-outline', title: 'No matching listings', body: 'Try another word or clear the filters.' };
    }
    if (status === 'sold') {
      return { icon: 'bag-check-outline', title: 'No sold listings yet', body: 'When you mark a listing as sold, it shows up here.' };
    }
    if (status === 'pending') {
      return { icon: 'time-outline', title: 'Nothing in review', body: 'Listings held for a manual check show up here.' };
    }
    if (status === 'removed') {
      return { icon: 'checkmark-done-outline', title: 'No rejected listings', body: 'Great. All your listings passed review.' };
    }
    if (status === 'hidden') {
      return { icon: 'eye-outline', title: 'Nothing hidden', body: 'Listings are hidden only when buyers are affected, for example when they report an item as unavailable. Confirm them to bring them back.' };
    }
    return { icon: 'pricetag-outline', title: 'No listings yet', body: 'Post an item and it will show up here for buyers.' };
  })();

  const renderCard = (item) => {
    const meta = STATUS_STYLES[item.status] || STATUS_STYLES.active;
    const tint = statusColor(item.status, colors);
    const isSold = item.status === 'sold';
    const isHeld = item.status === 'pending' || item.status === 'removed';
    const reason = reviewReason(item);
    const posted = timeAgo(item.createdAt).replace(/^Posted /, '');
    const source = statusSource(item);
    const showSourceLine = source && (item.status === 'active' || (isSold && !item.autoSold));

    return (
      <View key={item.id} style={styles.card}>
        <Pressable
          style={({ pressed }) => [styles.cardRow, pressed && styles.pressed]}
          onPress={() => openItemDetail(navigation, { listingId: item.id, item, sharedId: item.id })}
        >
          <View style={styles.cardImageWrap}>
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={styles.cardImage} resizeMode="cover" />
            ) : (
              <View style={[styles.cardImage, styles.cardImageEmpty]}>
                <Icon name="image-outline" size={28} color={colors.textMuted} />
              </View>
            )}
            {isSold ? (
              <View style={styles.soldVeil}>
                <Text style={styles.soldVeilText}>SOLD</Text>
              </View>
            ) : null}
            {item.photos?.length > 1 ? (
              <View style={styles.photoCount}>
                <Icon name="images-outline" size={10} color={colors.white} />
                <Text style={styles.photoCountText}>{item.photos.length}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.cardInfo}>
            <View style={styles.cardTopRow}>
              <View style={[styles.statusPill, { backgroundColor: `${tint}1A`, borderColor: `${tint}55` }]}>
                <Icon name={meta.icon} size={10} color={tint} />
                <Text style={[styles.statusPillText, { color: tint }]}>{meta.label}</Text>
              </View>
              {source && item.status !== 'active' ? (
                <View style={styles.sourceChip}>
                  <Icon name={source.icon} size={10} color={colors.textSecondary} />
                  <Text style={styles.sourceChipText}>{source.short}</Text>
                </View>
              ) : null}
              {posted ? <Text style={styles.postedText}>{posted}</Text> : null}
            </View>
            <Text style={[styles.cardTitle, isSold && styles.cardTitleSold]} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={[styles.cardPrice, isSold && styles.cardPriceSold]}>{formatPrice(item.price)}</Text>
            <View style={styles.tagRow}>
              {item.category ? (
                <View style={styles.tag}>
                  <Text style={styles.tagText} numberOfLines={1}>{item.category}</Text>
                </View>
              ) : null}
              {item.condition ? (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>{item.condition}</Text>
                </View>
              ) : null}
              {STOCK_LABELS[item.stockState] && item.status === 'active' ? (
                <View style={styles.tag}>
                  <Text style={[styles.tagText, { color: colors.warning }]}>{STOCK_LABELS[item.stockState]}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </Pressable>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Icon name="eye-outline" size={13} color={colors.textMuted} />
            <Text style={styles.metaText}>{item.views} views</Text>
          </View>
          <View style={styles.metaDot} />
          <View style={styles.metaItem}>
            <Icon name="chatbubble-outline" size={12} color={colors.textMuted} />
            <Text style={styles.metaText}>{item.chats} chats</Text>
          </View>
          {item.location ? (
            <>
              <View style={styles.metaDot} />
              <View style={[styles.metaItem, styles.metaItemGrow]}>
                <Icon name="location-outline" size={13} color={colors.textMuted} />
                <Text style={styles.metaText} numberOfLines={1}>{item.location}</Text>
              </View>
            </>
          ) : null}
        </View>

        {renderBoostRow(item)}

        {showSourceLine ? (
          <View style={styles.sourceLine}>
            <Icon name={source.icon} size={13} color={colors.textMuted} />
            <Text style={styles.sourceLineText} numberOfLines={2}>
              {[source.label, source.text, source.when].filter(Boolean).join(' · ')}
            </Text>
          </View>
        ) : null}

        {isHeld ? (
          <View style={[styles.reviewNote, item.status === 'removed' && styles.reviewNoteRejected]}>
            <Icon
              name={item.status === 'removed' ? 'close-circle-outline' : 'time-outline'}
              size={15}
              color={item.status === 'removed' ? colors.deleteRed : colors.warning}
            />
            <View style={styles.reviewNoteCopy}>
              <Text style={[styles.reviewNoteTitle, item.status === 'removed' && styles.reviewNoteTitleRejected]}>
                {item.status === 'removed'
                  ? (item.statusBy === 'auto' ? 'Blocked automatically' : 'Rejected by KinBech')
                  : (item.statusBy === 'admin' ? 'Held by KinBech for review' : 'Held for a quick check automatically')}
              </Text>
              <Text style={styles.reviewNoteText} numberOfLines={3}>
                {item.status === 'removed'
                  ? `${reason || 'This listing did not pass review.'} Edit it to send it for review again.`
                  : `${reason ? `${reason} ` : ''}It will go live after our team approves it.`}
              </Text>
            </View>
          </View>
        ) : null}

        {renderTrustControls(item)}

        <View style={styles.cardActions}>
          {item.status === 'active' ? (
            <>
              <Pressable style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]} onPress={() => handleShare(item)}>
                <Icon name="share-social-outline" size={15} color={colors.textSecondary} />
                <Text style={styles.actionText}>Share</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.actionBtn, styles.actionBtnPrimary, pressed && styles.pressed]}
                onPress={() => handleMarkSold(item)}
              >
                <Icon name="bag-check-outline" size={15} color={colors.price} />
                <Text style={[styles.actionText, styles.actionTextPrimary]}>Mark sold</Text>
              </Pressable>
            </>
          ) : null}
          <Pressable style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]} onPress={() => handleEdit(item)}>
            <Icon name="create-outline" size={15} color={colors.textSecondary} />
            <Text style={styles.actionText}>{item.status === 'removed' ? 'Edit & resend' : 'Edit'}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressed]}
            onPress={() => handleDelete(item)}
            accessibilityLabel="Delete listing"
          >
            <Icon name="trash-outline" size={16} color={colors.deleteRed} />
          </Pressable>
        </View>
      </View>
    );
  };

  const renderGridCard = (item) => {
    const meta = STATUS_STYLES[item.status] || STATUS_STYLES.active;
    const tint = statusColor(item.status, colors);
    const isSold = item.status === 'sold';
    const isHeld = item.status === 'pending' || item.status === 'removed';
    const featuredLeft = item.status === 'active' ? featuredTimeLeft(item.featuredUntil) : '';

    return (
      <View key={item.id} style={[styles.gridCard, { width: gridCardWidth }]}>
        <Pressable
          style={({ pressed }) => pressed && styles.pressed}
          onPress={() => openItemDetail(navigation, { listingId: item.id, item, sharedId: item.id })}
        >
          <View style={[styles.gridImageWrap, { height: Math.round(gridCardWidth * GRID_IMAGE_RATIO) }]}>
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={styles.cardImage} resizeMode="cover" />
            ) : (
              <View style={[styles.cardImage, styles.cardImageEmpty]}>
                <Icon name="image-outline" size={30} color={colors.textMuted} />
              </View>
            )}
            {isSold ? (
              <View style={styles.soldVeil}>
                <Text style={styles.soldVeilText}>SOLD</Text>
              </View>
            ) : null}
            <View style={[styles.gridStatus, { backgroundColor: tint }]}>
              <Icon name={meta.icon} size={9} color={colors.white} />
              <Text style={styles.gridStatusText}>
                {meta.label}
                {item.status !== 'active' && item.statusBy && item.statusBy !== 'seller'
                  ? ` · ${SOURCE_LABELS[item.statusBy]?.short || ''}`
                  : ''}
              </Text>
            </View>
            {featuredLeft ? (
              <View style={styles.gridFeatured}>
                <Icon name="sparkles" size={9} color={colors.white} />
                <Text style={styles.gridStatusText}>{featuredLeft}</Text>
              </View>
            ) : null}
            {item.photos?.length > 1 ? (
              <View style={styles.photoCount}>
                <Icon name="images-outline" size={10} color={colors.white} />
                <Text style={styles.photoCountText}>{item.photos.length}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.gridBody}>
            <Text style={[styles.gridTitle, isSold && styles.cardTitleSold]} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={[styles.gridPrice, isSold && styles.cardPriceSold]}>{formatPrice(item.price)}</Text>
            <View style={styles.gridMeta}>
              <View style={styles.metaItem}>
                <Icon name="eye-outline" size={12} color={colors.textMuted} />
                <Text style={styles.metaText}>{item.views}</Text>
              </View>
              <View style={styles.metaItem}>
                <Icon name="chatbubble-outline" size={11} color={colors.textMuted} />
                <Text style={styles.metaText}>{item.chats}</Text>
              </View>
              {isHeld ? (
                <Text style={[styles.gridHeld, { color: tint }]} numberOfLines={1}>
                  {item.status === 'removed' ? 'Needs edit' : 'Checking'}
                </Text>
              ) : null}
              {!isHeld && (item.needsConfirm || item.autoSold || STOCK_LABELS[item.stockState]) ? (
                <Text style={[styles.gridHeld, { color: colors.warning }]} numberOfLines={1}>
                  {item.autoSold ? 'Tap ✓ if not sold' : item.needsConfirm ? 'Still there?' : STOCK_LABELS[item.stockState]}
                </Text>
              ) : null}
            </View>
          </View>
        </Pressable>

        <View style={styles.gridActions}>
          {item.status === 'active' ? (
            <>
              <Pressable style={styles.gridActionBtn} onPress={() => handleShare(item)} hitSlop={4} accessibilityLabel="Share">
                <Icon name="share-social-outline" size={15} color={colors.textSecondary} />
              </Pressable>
              <Pressable
                style={[styles.gridActionBtn, styles.actionBtnPrimary]}
                onPress={() => handleMarkSold(item)}
                hitSlop={4}
                accessibilityLabel="Mark sold"
              >
                <Icon name="bag-check-outline" size={15} color={colors.price} />
              </Pressable>
              {!featuredLeft && credits > 0 ? (
                <Pressable
                  style={[styles.gridActionBtn, styles.gridBoostBtn]}
                  onPress={() => handleBoost(item)}
                  disabled={Boolean(boostingId)}
                  hitSlop={4}
                  accessibilityLabel="Boost for 24 hours"
                >
                  <Icon name="flash-outline" size={15} color={BOOST_COLOR} />
                </Pressable>
              ) : null}
            </>
          ) : null}
          {trustNotice(item) && !trustNotice(item).noRestore && item.status !== 'active' ? (
            <Pressable
              style={[styles.gridActionBtn, styles.actionBtnPrimary]}
              onPress={() => handleStillAvailable(item)}
              hitSlop={4}
              accessibilityLabel="Still available"
            >
              <Icon name="checkmark-circle-outline" size={15} color={colors.price} />
            </Pressable>
          ) : null}
          <Pressable style={styles.gridActionBtn} onPress={() => handleEdit(item)} hitSlop={4} accessibilityLabel="Edit">
            <Icon name="create-outline" size={15} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            style={[styles.gridActionBtn, styles.deleteBtnTint]}
            onPress={() => handleDelete(item)}
            hitSlop={4}
            accessibilityLabel="Delete listing"
          >
            <Icon name="trash-outline" size={15} color={colors.deleteRed} />
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ThemeStatusBar variant="header" />
        <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerFill}
            pointerEvents="none"
          />
          <View style={styles.headerGlow} pointerEvents="none" />
          <View style={styles.headerRow}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.navBtn}>
              <Icon name="chevron-back" size={22} color={colors.white} />
            </Pressable>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle}>My Listings</Text>
              <Text style={styles.headerSubtitle}>
                {counts.all} {counts.all === 1 ? 'listing' : 'listings'} · {totals.chats} chats
              </Text>
            </View>
            <TesterModeButton />
            {isShopAccount && myShop ? (
              <Pressable onPress={() => navigation.navigate(ROUTES.SHOP_DASHBOARD)} hitSlop={10} style={styles.navBtn}>
                <Icon name="analytics-outline" size={19} color={colors.white} />
              </Pressable>
            ) : null}
            <Pressable onPress={() => navigation.navigate(ROUTES.POST_LISTING)} hitSlop={10} style={styles.navBtn}>
              <Icon name="add" size={22} color={colors.white} />
            </Pressable>
          </View>

          <View style={styles.headerStats}>
            {HEADER_STATS.map((stat) => {
              const tappable = stat.key !== 'views';
              const selected = tappable && status === stat.key;
              return (
                <Pressable
                  key={stat.key}
                  disabled={!tappable}
                  onPress={() => setStatus(selected ? 'all' : stat.key)}
                  style={({ pressed }) => [styles.headerStat, selected && styles.headerStatActive, pressed && styles.pressed]}
                >
                  <Icon name={stat.icon} size={12} color={selected ? colors.gradientStart : 'rgba(255,255,255,0.85)'} />
                  <Text style={[styles.headerStatValue, selected && styles.headerStatValueActive]}>{stat.value}</Text>
                  <Text style={[styles.headerStatLabel, selected && styles.headerStatLabelActive]}>{stat.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.filterBar}>
          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <Icon name="search" size={16} color={colors.textMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search your listings"
                placeholderTextColor={colors.textMuted}
                style={styles.searchInput}
                returnKeyType="search"
                autoCorrect={false}
              />
              {query ? (
                <Pressable onPress={() => setQuery('')} hitSlop={8}>
                  <Icon name="close-circle" size={16} color={colors.textMuted} />
                </Pressable>
              ) : null}
              <VoiceSearchToggle size={28} />
            </View>
            <Pressable
              onPress={() => setSheetOpen(true)}
              style={({ pressed }) => [styles.filterBtn, extraFilters > 0 && styles.filterBtnActive, pressed && styles.pressed]}
              accessibilityLabel="Sort and filter"
            >
              <Icon name="options-outline" size={18} color={extraFilters > 0 ? colors.white : colors.text} />
              {extraFilters > 0 ? (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{extraFilters}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {STATUS_FILTERS.map((filter) => {
              const selected = status === filter.key;
              return (
                <Pressable
                  key={filter.key}
                  onPress={() => setStatus(filter.key)}
                  style={[styles.chip, selected && styles.chipActive]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextActive]}>{filter.label}</Text>
                  <View style={[styles.chipCount, selected && styles.chipCountActive]}>
                    <Text style={[styles.chipCountText, selected && styles.chipCountTextActive]}>
                      {counts[filter.key] || 0}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.resultsRow}>
          <View style={styles.resultsLeft}>
            <Text style={styles.resultsText}>
              {filteredListings.length} {filteredListings.length === 1 ? 'result' : 'results'}
            </Text>
            <Pressable onPress={() => setSheetOpen(true)} hitSlop={8} style={styles.sortLink}>
              <Icon name="swap-vertical" size={13} color={colors.textSecondary} />
              <Text style={styles.sortLinkText} numberOfLines={1}>{sortLabel}</Text>
            </Pressable>
          </View>
          <View style={styles.viewToggle}>
            {[
              { key: 'list', icon: 'list' },
              { key: 'grid', icon: 'grid' },
            ].map((option) => {
              const selected = viewMode === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => setViewMode(option.key)}
                  style={[styles.viewToggleBtn, selected && styles.viewToggleBtnActive]}
                  accessibilityLabel={option.key === 'list' ? 'List view' : 'Card view'}
                >
                  <Icon
                    name={selected ? option.icon : `${option.icon}-outline`}
                    size={15}
                    color={selected ? colors.white : colors.textSecondary}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingTop: 2, paddingBottom: insets.bottom + 96 }}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
        scrollEventThrottle={100}
        onScroll={(event) => {
          if (visibleCount < filteredListings.length && isNearEnd(event, 800)) {
            setVisibleCount((count) => count + RENDER_BATCH);
          }
        }}
      >
        <AccountStatusCard
          compact
          status={accountStatus}
          user={user}
          onOpenPlans={() => navigation.navigate(ROUTES.SUBSCRIPTION)}
        />
        {stockCheckCount > 0 ? (
          <View style={styles.stockBanner}>
            <Icon name="cube-outline" size={18} color={colors.warning} />
            <Text style={styles.stockBannerText}>
              {stockCheckCount} {stockCheckCount === 1 ? 'item needs' : 'items need'} a stock check
            </Text>
            <Pressable onPress={handleConfirmAllStock} style={styles.stockBannerBtn} hitSlop={6}>
              <Text style={styles.stockBannerBtnText}>All correct</Text>
            </Pressable>
          </View>
        ) : null}
        {credits > 0 && boostableCount > 0 && (status === 'all' || status === 'active') ? (
          <View style={styles.boostBanner}>
            <Icon name="flash" size={18} color={BOOST_COLOR} />
            <Text style={styles.boostBannerText}>
              {credits} boost {credits === 1 ? 'credit' : 'credits'} ready. Tap{' '}
              {viewMode === 'grid' ? '⚡' : 'Boost'} on a live listing to feature it for 24 hours.
            </Text>
          </View>
        ) : null}
        {loading && listings.length === 0 ? (
          viewMode === 'grid' ? (
            <View style={styles.gridContent}>
              {[0, 1, 2, 3].map((i) => (
                <ProductCardSkeleton key={i} width={gridCardWidth} />
              ))}
            </View>
          ) : (
            <View style={styles.listContent}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} width="100%" height={132} borderRadius={18} />
              ))}
            </View>
          )
        ) : filteredListings.length === 0 ? (
          <EmptyState
            compact
            icon={emptyCopy.icon}
            title={emptyCopy.title}
            body={emptyCopy.body}
            buttonLabel={status === 'all' && !query.trim() && extraFilters === 0 ? 'Create listing' : undefined}
            onButtonPress={() => navigation.navigate(ROUTES.POST_LISTING)}
          />
        ) : (
          viewMode === 'grid' ? (
            <View style={styles.gridContent}>{filteredListings.slice(0, visibleCount).map(renderGridCard)}</View>
          ) : (
            <View style={styles.listContent}>{filteredListings.slice(0, visibleCount).map(renderCard)}</View>
          )
        )}
      </ScrollView>

      <Modal
        visible={sheetOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setSheetOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setSheetOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Sort & filter</Text>
            <Pressable onPress={resetFilters} hitSlop={8} disabled={extraFilters === 0}>
              <Text style={[styles.sheetReset, extraFilters === 0 && styles.sheetResetDisabled]}>Reset</Text>
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} style={styles.sheetScroll}>
            <Text style={styles.sheetSection}>Sort by</Text>
            <View style={styles.sortList}>
              {SORT_OPTIONS.map((option) => {
                const selected = sortBy === option.key;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setSortBy(option.key)}
                    style={[styles.sortOption, selected && styles.sortOptionActive]}
                  >
                    <Icon name={option.icon} size={16} color={selected ? colors.gradientStart : colors.textSecondary} />
                    <Text style={[styles.sortOptionText, selected && styles.sortOptionTextActive]}>{option.label}</Text>
                    <Icon
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={selected ? colors.gradientStart : colors.textTertiary}
                    />
                  </Pressable>
                );
              })}
            </View>

            {categories.length > 1 ? (
              <>
                <Text style={styles.sheetSection}>Category</Text>
                <View style={styles.wrapChips}>
                  {['all', ...categories].map((name) => {
                    const selected = category === name;
                    return (
                      <Pressable key={name} onPress={() => setCategory(name)} style={[styles.chip, selected && styles.chipActive]}>
                        <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                          {name === 'all' ? 'All categories' : name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            {conditions.length > 1 ? (
              <>
                <Text style={styles.sheetSection}>Condition</Text>
                <View style={styles.wrapChips}>
                  {['all', ...conditions].map((name) => {
                    const selected = condition === name;
                    return (
                      <Pressable key={name} onPress={() => setCondition(name)} style={[styles.chip, selected && styles.chipActive]}>
                        <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                          {name === 'all' ? 'Any condition' : name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}
          </ScrollView>
          <Pressable style={styles.sheetDone} onPress={() => setSheetOpen(false)}>
            <Text style={styles.sheetDoneText}>
              Show {filteredListings.length} {filteredListings.length === 1 ? 'result' : 'results'}
            </Text>
          </Pressable>
        </View>
      </Modal>

      <View style={[styles.tabBar, { paddingBottom: insets.bottom + 10 }]}>
        <Pressable style={styles.tabBarItem} onPress={() => navigateToTab(navigation, TABS.HOME)}>
          <Icon name="home-outline" size={22} color={colors.textMuted} />
          <Text style={styles.tabBarLabel}>Home</Text>
        </Pressable>
        <Pressable style={styles.tabBarItem} onPress={() => navigateToTab(navigation, TABS.EXPLORE)}>
          <Icon name="compass-outline" size={22} color={colors.textMuted} />
          <Text style={styles.tabBarLabel}>Explore</Text>
        </Pressable>

        <Pressable style={styles.fabWrap} onPress={() => navigateToTab(navigation, TABS.POST)}>
          <View style={styles.fab}>
            <Icon name="add" size={28} color={colors.white} />
          </View>
        </Pressable>

        <Pressable style={styles.tabBarItem} onPress={() => navigateToTab(navigation, TABS.CHATS)}>
          <View>
            <Icon name="chatbubble-outline" size={22} color={colors.textMuted} />
            <View style={styles.chatDot} />
          </View>
          <Text style={styles.tabBarLabel}>Chats</Text>
        </Pressable>
        <Pressable style={styles.tabBarItem} onPress={() => navigateToTab(navigation, TABS.PROFILE)}>
          <Icon name="person-outline" size={22} color={colors.textMuted} />
          <Text style={styles.tabBarLabel}>Profile</Text>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  pressed: {
    opacity: 0.7,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    overflow: 'hidden',
    backgroundColor: colors.gradientStart,
  },
  headerFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  headerGlow: {
    position: 'absolute',
    top: -90,
    right: -70,
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    marginLeft: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.white,
  },
  headerSubtitle: {
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.8)',
  },
  headerStats: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  headerStat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    columnGap: 4,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  headerStatActive: {
    backgroundColor: colors.white,
    borderColor: colors.white,
  },
  headerStatValue: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.white,
  },
  headerStatValueActive: {
    color: colors.gradientStart,
  },
  headerStatLabel: {
    width: '100%',
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.82)',
  },
  headerStatLabelActive: {
    color: colors.gradientStart,
  },
  filterBar: {
    paddingTop: 12,
    gap: 10,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    paddingVertical: 0,
  },
  filterBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterBtnActive: {
    backgroundColor: colors.gradientStart,
    borderColor: colors.gradientStart,
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.badge,
    borderWidth: 2,
    borderColor: colors.background,
  },
  filterBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: colors.white,
  },
  chipRow: {
    gap: 8,
    paddingHorizontal: 16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.gradientStart,
    borderColor: colors.gradientStart,
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.white,
  },
  chipCount: {
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 9,
    alignItems: 'center',
    backgroundColor: colors.iconBackground,
  },
  chipCountActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  chipCountText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  chipCountTextActive: {
    color: colors.white,
  },
  resultsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 10,
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  resultsLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  resultsText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  sortLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewToggle: {
    flexDirection: 'row',
    padding: 3,
    gap: 2,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  viewToggleBtn: {
    width: 32,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewToggleBtnActive: {
    backgroundColor: colors.gradientStart,
  },
  gridContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
    paddingHorizontal: 16,
  },
  gridCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  gridImageWrap: {
    width: '100%',
    backgroundColor: colors.iconBackground,
  },
  gridStatus: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 9,
  },
  gridStatusText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.white,
  },
  gridBody: {
    paddingHorizontal: 9,
    paddingTop: 7,
    gap: 2,
  },
  gridTitle: {
    minHeight: 32,
    fontSize: 12.5,
    fontWeight: '700',
    lineHeight: 16,
    color: colors.text,
  },
  gridPrice: {
    fontSize: 14.5,
    fontWeight: '800',
    color: colors.price,
  },
  gridMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gridHeld: {
    flex: 1,
    textAlign: 'right',
    fontSize: 10.5,
    fontWeight: '800',
  },
  gridActions: {
    flexDirection: 'row',
    gap: 5,
    marginHorizontal: 8,
    marginTop: 8,
    marginBottom: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  gridActionBtn: {
    flex: 1,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconBackground,
  },
  deleteBtnTint: {
    backgroundColor: colors.deleteBg,
  },
  sortLinkText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  cardRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cardImageWrap: {
    width: 92,
    height: 92,
    borderRadius: 12,
    backgroundColor: colors.iconBackground,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardImageEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  soldVeil: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(17,24,39,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soldVeilText: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2,
    color: colors.white,
  },
  photoCount: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  photoCountText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.white,
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  postedText: {
    flexShrink: 1,
    fontSize: 10.5,
    color: colors.textMuted,
  },
  sourceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted || colors.border,
  },
  sourceChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  sourceLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 2,
  },
  sourceLineText: {
    flex: 1,
    fontSize: 11.5,
    color: colors.textMuted,
  },
  cardTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 18,
  },
  cardTitleSold: {
    color: colors.textSecondary,
  },
  cardPrice: {
    fontSize: 15.5,
    fontWeight: '800',
    color: colors.price,
  },
  cardPriceSold: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    maxWidth: 130,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 7,
    backgroundColor: colors.iconBackground,
  },
  tagText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 2,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaItemGrow: {
    flexShrink: 1,
  },
  metaText: {
    fontSize: 11.5,
    color: colors.textMuted,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.textTertiary,
  },
  reviewNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: `${colors.warning}1A`,
    borderWidth: 1,
    borderColor: `${colors.warning}59`,
  },
  reviewNoteRejected: {
    backgroundColor: `${colors.deleteRed}14`,
    borderColor: `${colors.deleteRed}59`,
  },
  reviewNoteCopy: {
    flex: 1,
  },
  reviewNoteTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.warning,
  },
  reviewNoteTitleRejected: {
    color: colors.deleteRed,
  },
  reviewNoteText: {
    marginTop: 2,
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  trustBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: `${colors.warning}14`,
    borderWidth: 1,
    borderColor: `${colors.warning}4D`,
    gap: 8,
  },
  trustNoticeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  trustActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepperBtn: {
    width: 34,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.text,
  },
  stockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: `${colors.warning}14`,
    borderWidth: 1,
    borderColor: `${colors.warning}4D`,
  },
  boostBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: `${BOOST_COLOR}14`,
    borderWidth: 1,
    borderColor: `${BOOST_COLOR}4D`,
  },
  boostBannerText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '600',
    color: colors.text,
  },
  boostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: `${BOOST_COLOR}12`,
  },
  boostRowAction: {
    borderWidth: 1,
    borderColor: `${BOOST_COLOR}40`,
  },
  boostRowText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: BOOST_COLOR,
  },
  boostRowHint: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'right',
  },
  gridFeatured: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 9,
    backgroundColor: FEATURED_BLUE,
  },
  gridBoostBtn: {
    backgroundColor: `${BOOST_COLOR}1A`,
  },
  stockBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  stockBannerBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.pastelGreen,
  },
  stockBannerBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.price,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.iconBackground,
  },
  actionBtnPrimary: {
    backgroundColor: colors.pastelGreen,
  },
  actionText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  actionTextPrimary: {
    color: colors.price,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.deleteBg,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  sheet: {
    maxHeight: '80%',
    paddingHorizontal: 18,
    paddingTop: 8,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.surface,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  sheetReset: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.gradientStart,
  },
  sheetResetDisabled: {
    color: colors.textMuted,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetSection: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  sortList: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sortOptionActive: {
    backgroundColor: `${colors.gradientStart}12`,
  },
  sortOptionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  sortOptionTextActive: {
    color: colors.gradientStart,
    fontWeight: '700',
  },
  wrapChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sheetDone: {
    marginTop: 18,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gradientStart,
  },
  sheetDoneText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.white,
  },
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingTop: 10,
  },
  tabBarItem: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  tabBarLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
  },
  chatDot: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.progressOrange,
  },
  fabWrap: {
    marginTop: -30,
    flex: 1,
    alignItems: 'center',
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gradientStart,
    shadowColor: colors.gradientStart,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
