import { useCallback, useState } from 'react';
import Cropper from 'react-easy-crop';
import { getCroppedBlob } from '../utils/cropImage';
import api from '../services/api';

export default function CategoryImageField({ imageUrl, onChange }) {
  const [source, setSource] = useState('');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [uploading, setUploading] = useState(false);

  const onCropComplete = useCallback((_area, pixels) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const onFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file');
      return;
    }
    setSource(URL.createObjectURL(file));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  const applyCrop = async () => {
    if (!source || !croppedAreaPixels) return;
    setUploading(true);
    try {
      const blob = await getCroppedBlob(source, croppedAreaPixels);
      const formData = new FormData();
      formData.append('image', blob, 'category.jpg');
      const { data } = await api.post('/categories/admin/upload', formData);
      onChange(data.url || data.imageUrl);
      URL.revokeObjectURL(source);
      setSource('');
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="category-image-field">
      <span className="category-image-label">Category image</span>
      <div className="category-image-row">
        <div className="category-image-preview">
          {imageUrl ? <img src={imageUrl} alt="" /> : <span>No image</span>}
        </div>
        <div className="category-image-actions">
          <label className="action-btn view">
            Upload & crop
            <input type="file" accept="image/*" hidden onChange={onFile} />
          </label>
          {imageUrl ? (
            <button type="button" className="action-btn suspend" onClick={() => onChange('')}>
              Remove
            </button>
          ) : null}
        </div>
      </div>

      {source ? (
        <div className="crop-overlay">
          <div className="crop-modal">
            <h4>Crop image</h4>
            <p>Drag and zoom to fit the square. This image shows on the mobile app.</p>
            <div className="crop-stage">
              <Cropper
                image={source}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <label className="crop-zoom">
              Zoom
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
            </label>
            <div className="form-actions">
              <button type="button" className="action-btn view" onClick={applyCrop} disabled={uploading}>
                {uploading ? 'Uploading…' : 'Use cropped image'}
              </button>
              <button
                type="button"
                className="action-btn"
                onClick={() => {
                  URL.revokeObjectURL(source);
                  setSource('');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
