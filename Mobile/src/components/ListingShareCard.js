import { forwardRef } from 'react';
import { Image, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BRAND_TAGLINE } from '../content/brand';
import { buildListingShareUrl, formatSharePrice } from '../utils/listingShare';

const CARD_W = 270;
const CARD_H = 480;

const ListingShareCard = forwardRef(function ListingShareCard(
  { listing, style },
  ref,
) {
  const shareUrl = buildListingShareUrl(listing?.id);
  const priceLabel = formatSharePrice(listing?.price);

  return (
    <View
      ref={ref}
      collapsable={false}
      style={[
        {
          width: CARD_W,
          height: CARD_H,
          borderRadius: 24,
          overflow: 'hidden',
          backgroundColor: '#0B0F17',
        },
        style,
      ]}
    >
      <LinearGradient
        colors={['#065F46', '#047857', '#059669']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Image
            source={require('../../assets/icons/app-icon.png')}
            style={{ width: 28, height: 28, borderRadius: 8 }}
          />
          <View>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900' }}>KinBech</Text>
            <Text style={{ color: 'rgba(255,255,255,0.88)', fontSize: 9, fontWeight: '600' }}>
              {BRAND_TAGLINE}
            </Text>
          </View>
        </View>
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.18)',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>FOR SALE</Text>
        </View>
      </LinearGradient>

      <View style={{ flex: 1, padding: 14, gap: 10 }}>
        <View
          style={{
            flex: 1,
            borderRadius: 18,
            overflow: 'hidden',
            backgroundColor: '#111827',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
          }}
        >
          {listing?.imageUrl ? (
            <Image
              source={{ uri: listing.imageUrl }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="cube-outline" size={42} color="rgba(255,255,255,0.35)" />
            </View>
          )}
        </View>

        <View style={{ gap: 6 }}>
          <Text
            numberOfLines={2}
            style={{ color: '#fff', fontSize: 18, fontWeight: '800', lineHeight: 22 }}
          >
            {listing?.title || 'New listing'}
          </Text>
          <Text style={{ color: '#8FBAA8', fontSize: 24, fontWeight: '900' }}>{priceLabel}</Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {listing?.condition ? (
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 999,
                  backgroundColor: 'rgba(255,255,255,0.08)',
                }}
              >
                <Text style={{ color: '#D1D5DB', fontSize: 10, fontWeight: '700' }}>
                  {listing.condition}
                </Text>
              </View>
            ) : null}
            {listing?.category ? (
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 999,
                  backgroundColor: 'rgba(16,185,129,0.16)',
                }}
              >
                <Text style={{ color: '#6EE7B7', fontSize: 10, fontWeight: '700' }}>
                  {listing.category}
                </Text>
              </View>
            ) : null}
          </View>

          {listing?.location ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="location-sharp" size={12} color="#9CA3AF" />
              <Text numberOfLines={1} style={{ color: '#9CA3AF', fontSize: 11, flex: 1 }}>
                {listing.location}
              </Text>
            </View>
          ) : null}
        </View>

        <LinearGradient
          colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)']}
          style={{
            borderRadius: 14,
            padding: 10,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
          }}
        >
          <Text style={{ color: '#F9FAFB', fontSize: 11, fontWeight: '800', marginBottom: 2 }}>
            Available on KinBech
          </Text>
          <Text numberOfLines={1} style={{ color: '#9CA3AF', fontSize: 9 }}>
            {shareUrl.replace('https://', '')}
          </Text>
        </LinearGradient>
      </View>
    </View>
  );
});

export default ListingShareCard;
