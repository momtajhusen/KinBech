import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Circle, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../services/api';
import { useGeolocation } from '../hooks/useGeolocation';
import { formatPrice } from '../utils/listing';
import Footer from '../components/Footer';
import { IconLocation } from '../components/Icons';

const DEFAULT_CENTER = { lat: 27.7172, lng: 85.3240 };
const RADIUS_OPTIONS = [2, 5, 10];
const TYPE_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'products', label: 'Products' },
  { key: 'shops', label: 'Shops' },
];

function productIcon() {
  return L.divIcon({
    className: 'map-pin map-pin-product',
    html: '<span aria-hidden="true"></span>',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function shopIcon() {
  return L.divIcon({
    className: 'map-pin map-pin-shop',
    html: '<span aria-hidden="true"></span>',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function MapViewport({ center, radiusKm }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng], radiusKm <= 2 ? 14 : radiusKm <= 5 ? 13 : 12, {
      animate: true,
    });
  }, [map, center.lat, center.lng, radiusKm]);
  return null;
}

export default function MapPage() {
  const navigate = useNavigate();
  const { coords, status: geoStatus } = useGeolocation();

  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [radiusKm, setRadiusKm] = useState(5);
  const [mapType, setMapType] = useState('all');
  const [markers, setMarkers] = useState([]);
  const [counts, setCounts] = useState({ total: 0, products: 0, shops: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    if (coords?.lat != null && coords?.lng != null) {
      setCenter({ lat: coords.lat, lng: coords.lng });
    }
  }, [coords?.lat, coords?.lng]);

  const loadMap = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getMapNearby({
        lat: center.lat,
        lng: center.lng,
        radius: radiusKm,
        type: mapType,
        limit: 100,
      });
      setMarkers(data.markers || []);
      setCounts(data.counts || { total: 0, products: 0, shops: 0 });
      setSelectedId(null);
    } catch (e) {
      setError(e.message || 'Could not load map data');
      setMarkers([]);
    } finally {
      setLoading(false);
    }
  }, [center.lat, center.lng, radiusKm, mapType]);

  useEffect(() => {
    loadMap();
  }, [loadMap]);

  const selected = useMemo(
    () => markers.find((marker) => marker.id === selectedId) || null,
    [markers, selectedId],
  );

  const openMarker = (marker) => {
    if (marker.markerType === 'product' && marker.listingId) {
      navigate(`/listing/${marker.listingId}`);
      return;
    }
    const sellerId = marker.shopId || marker.sellerId;
    if (sellerId) navigate(`/seller/${sellerId}`);
  };

  return (
    <div className="map-page">
      <header className="map-page-header">
        <div className="container map-page-header-inner">
          <nav className="detail-breadcrumb" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <span>/</span>
            <Link to="/explore">Explore</Link>
            <span>/</span>
            <span className="detail-breadcrumb-current">Nearby map</span>
          </nav>
          <div className="map-page-title-row">
            <div>
              <h1>Hyperlocal map</h1>
              <p>
                {loading
                  ? 'Loading nearby listings…'
                  : `${counts.total} results within ${radiusKm} km`}
                {geoStatus === 'denied' ? ' · Using default area' : ''}
              </p>
            </div>
            <Link to="/explore" className="btn btn-ghost map-page-back">
              List view
            </Link>
          </div>
        </div>
      </header>

      <div className="map-page-shell">
        <aside className="map-page-sidebar">
          <div className="map-control-block">
            <p className="map-control-label">Search radius</p>
            <div className="map-radius-row">
              {RADIUS_OPTIONS.map((km) => (
                <button
                  key={km}
                  type="button"
                  className={radiusKm === km ? 'active' : ''}
                  onClick={() => setRadiusKm(km)}
                >
                  {km} km
                </button>
              ))}
            </div>
          </div>

          <div className="map-control-block">
            <p className="map-control-label">Show on map</p>
            <div className="map-type-row">
              {TYPE_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={mapType === option.key ? 'active' : ''}
                  onClick={() => setMapType(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="map-stats-card">
            <div>
              <strong>{counts.products}</strong>
              <span>Products</span>
            </div>
            <div>
              <strong>{counts.shops}</strong>
              <span>Shops</span>
            </div>
          </div>

          {error ? <p className="map-error">{error}</p> : null}

          <div className="map-results-list">
            <p className="map-control-label">Nearby results</p>
            {loading ? (
              <div className="map-results-loading">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="skeleton-line" />
                ))}
              </div>
            ) : markers.length ? (
              markers.map((marker) => (
                <button
                  key={marker.id}
                  type="button"
                  className={`map-result-item${selectedId === marker.id ? ' active' : ''}`}
                  onClick={() => setSelectedId(marker.id)}
                >
                  <span className={`map-result-badge map-result-badge-${marker.markerType}`}>
                    {marker.markerType === 'shop' ? 'Shop' : 'Product'}
                  </span>
                  <strong>{marker.title}</strong>
                  <span>{marker.subtitle}</span>
                  <span className="map-result-meta">
                    <IconLocation width={12} height={12} /> {marker.distanceKm} km
                  </span>
                </button>
              ))
            ) : (
              <p className="map-empty-copy">No mapped listings in this radius yet. Try 10 km or another area.</p>
            )}
          </div>
        </aside>

        <div className="map-page-mapwrap">
          <MapContainer
            center={[center.lat, center.lng]}
            zoom={13}
            scrollWheelZoom
            className="map-leaflet"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapViewport center={center} radiusKm={radiusKm} />
            <Circle
              center={[center.lat, center.lng]}
              radius={radiusKm * 1000}
              pathOptions={{
                color: 'rgba(4, 120, 87, 0.65)',
                fillColor: 'rgba(4, 120, 87, 0.12)',
                weight: 2,
              }}
            />
            {markers.map((marker) => (
              <Marker
                key={marker.id}
                position={[marker.lat, marker.lng]}
                icon={marker.markerType === 'shop' ? shopIcon() : productIcon()}
                eventHandlers={{
                  click: () => setSelectedId(marker.id),
                }}
              >
                <Popup>
                  <div className="map-popup">
                    <strong>{marker.title}</strong>
                    <p>{marker.subtitle}</p>
                    <p>{marker.distanceKm} km away</p>
                    {marker.markerType === 'product' ? (
                      <p>{formatPrice(marker.price)}</p>
                    ) : (
                      <p>{marker.listingCount || 0} listings</p>
                    )}
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => openMarker(marker)}>
                      Open
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {selected ? (
            <div className="map-selected-card">
              <div>
                <span className={`map-result-badge map-result-badge-${selected.markerType}`}>
                  {selected.markerType === 'shop' ? 'Shop' : 'Product'}
                </span>
                <h3>{selected.title}</h3>
                <p>{selected.subtitle}</p>
                <p className="map-selected-meta">{selected.distanceKm} km away</p>
                {selected.markerType === 'product' ? (
                  <p className="map-selected-price">{formatPrice(selected.price)}</p>
                ) : (
                  <p className="map-selected-price">{selected.listingCount || 0} active listings</p>
                )}
              </div>
              <button type="button" className="btn btn-primary" onClick={() => openMarker(selected)}>
                {selected.markerType === 'shop' ? 'View shop' : 'View product'}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <Footer />
    </div>
  );
}
